import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { updateCallStatus } from "../lib/api";
import * as webrtc from "../lib/webrtc";
import type { CallEvent } from "../lib/webrtc";

// Audio routing for calls
let InCallManager: any = null;
try {
  InCallManager = require("react-native-incall-manager").default;
} catch {}

// Lazy-load RTCView to avoid crash in Expo Go
let RTCView: any = View; // fallback
try {
  RTCView = require("react-native-webrtc").RTCView;
} catch {}
type MediaStream = any;

type CallState = "ringing" | "connected" | "ended";

type Props = {
  callId: string;
  callType: "audio" | "video";
  isIncoming: boolean;
  callerName: string;
  callerAvatar?: string | null;
  /** For incoming calls: the user ID of the caller */
  callerUserId?: string;
  /** For outgoing calls: the user ID being called */
  calleeUserId?: string;
  /** For incoming calls: the SDP offer from the caller */
  offerSdp?: string;
  onEnd: () => void;
};

const DARK_BG = "#111111";
const GREEN = "#22c55e";
const RED = "#ef4444";

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function CallScreen({
  callId,
  callType,
  isIncoming,
  callerName,
  callerAvatar,
  callerUserId,
  calleeUserId,
  offerSdp,
  onEnd,
}: Props) {
  const [callState, setCallState] = useState<CallState>("ringing");
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === "video");
  const [elapsed, setElapsed] = useState(0);
  const [localStreamUrl, setLocalStreamUrl] = useState<string | null>(null);
  const [remoteStreamUrl, setRemoteStreamUrl] = useState<string | null>(null);
  const [endReason, setEndReason] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasStartedRef = useRef(false);

  // Animated pulse ring for ringing state
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  const handleCallEvent = useCallback(
    (event: CallEvent) => {
      switch (event.type) {
        case "ringing":
          setCallState("ringing");
          break;
        case "connected":
          setCallState("connected");
          updateCallStatus(callId, "answered").catch(() => {});
          break;
        case "remote-stream": {
          const stream = event.stream as MediaStream;
          setRemoteStreamUrl(stream.toURL());
          break;
        }
        case "ended":
          setCallState("ended");
          setEndReason(event.reason ?? null);
          updateCallStatus(callId, "ended").catch(() => {});
          break;
        case "error":
          setCallState("ended");
          setEndReason(event.message);
          break;
      }
    },
    [callId],
  );

  // Start InCallManager for audio routing
  useEffect(() => {
    if (!InCallManager) return;
    InCallManager.start({ media: callType === "video" ? "video" : "audio" });
    // Default to speaker for video calls, earpiece for audio
    InCallManager.setSpeakerphoneOn(callType === "video");
    setIsSpeaker(callType === "video");

    return () => {
      InCallManager.stop();
    };
  }, [callType]);

  // Start outgoing call via WebRTC
  useEffect(() => {
    if (isIncoming || hasStartedRef.current) return;
    if (!calleeUserId) return;
    hasStartedRef.current = true;

    webrtc.startCall({
      callId,
      targetUserId: calleeUserId,
      callType,
      onEvent: handleCallEvent,
    }).then(() => {
      const local = webrtc.getLocalStream();
      if (local) setLocalStreamUrl(local.toURL());
    });
  }, [callId, callType, calleeUserId, isIncoming, handleCallEvent]);

  // Pulse animation for ringing
  useEffect(() => {
    if (callState !== "ringing") return;
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.8,
            duration: 1200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, {
            toValue: 0,
            duration: 1200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.6,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [callState, pulseAnim, pulseOpacity]);

  // Call timer
  useEffect(() => {
    if (callState === "connected") {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  // Auto-dismiss after "ended"
  useEffect(() => {
    if (callState === "ended") {
      const timeout = setTimeout(() => {
        onEnd();
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [callState, onEnd]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      webrtc.cleanup();
    };
  }, []);

  const handleAccept = useCallback(() => {
    if (!callerUserId || !offerSdp) return;
    webrtc.acceptCall({
      callId,
      callerUserId,
      callType,
      offerSdp,
      onEvent: handleCallEvent,
    }).then(() => {
      const local = webrtc.getLocalStream();
      if (local) setLocalStreamUrl(local.toURL());
    });
    setCallState("connected");
    updateCallStatus(callId, "answered").catch(() => {});
  }, [callId, callType, callerUserId, offerSdp, handleCallEvent]);

  const handleReject = useCallback(() => {
    if (callerUserId) {
      webrtc.rejectCall(callerUserId, callId);
    }
    setCallState("ended");
    updateCallStatus(callId, "rejected").catch(() => {});
  }, [callId, callerUserId]);

  const handleHangup = useCallback(() => {
    webrtc.hangup();
    setCallState("ended");
    updateCallStatus(callId, "ended").catch(() => {});
  }, [callId]);

  const handleToggleMute = useCallback(() => {
    const muted = webrtc.toggleMute();
    setIsMuted(muted);
  }, []);

  const handleToggleVideo = useCallback(() => {
    const enabled = webrtc.toggleVideo();
    setIsVideoEnabled(enabled);
  }, []);

  const endedLabel =
    endReason === "rejected"
      ? "Call rejected"
      : endReason === "busy"
        ? "User is busy"
        : "Call ended";

  // ── Ringing (outgoing) ──────────────────────────────────────────────────
  if (callState === "ringing" && !isIncoming) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={DARK_BG} />
        <View style={styles.centerContent}>
          <View style={styles.avatarWrap}>
            <Animated.View
              style={[
                styles.pulseRing,
                { transform: [{ scale: pulseAnim }], opacity: pulseOpacity },
              ]}
            />
            {callerAvatar ? (
              <Image source={{ uri: callerAvatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons color="#ffffff" name="person" size={48} />
              </View>
            )}
          </View>
          <Text style={styles.callerName}>{callerName}</Text>
          <Text style={styles.statusText}>Calling...</Text>
        </View>

        <View style={styles.bottomBar}>
          <Pressable onPress={handleHangup} style={styles.hangupButton}>
            <Ionicons
              color="#ffffff"
              name="call-outline"
              size={28}
              style={{ transform: [{ rotate: "135deg" }] }}
            />
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Ringing (incoming) ──────────────────────────────────────────────────
  if (callState === "ringing" && isIncoming) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={DARK_BG} />
        <View style={styles.centerContent}>
          <View style={styles.avatarWrap}>
            <Animated.View
              style={[
                styles.pulseRing,
                { transform: [{ scale: pulseAnim }], opacity: pulseOpacity },
              ]}
            />
            {callerAvatar ? (
              <Image source={{ uri: callerAvatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons color="#ffffff" name="person" size={48} />
              </View>
            )}
          </View>
          <Text style={styles.callerName}>{callerName}</Text>
          <Text style={styles.statusText}>
            Incoming {callType} call
          </Text>
        </View>

        <View style={styles.bottomBarIncoming}>
          <Pressable onPress={handleReject} style={styles.hangupButton}>
            <Ionicons
              color="#ffffff"
              name="call-outline"
              size={28}
              style={{ transform: [{ rotate: "135deg" }] }}
            />
          </Pressable>
          <Pressable onPress={handleAccept} style={styles.acceptButton}>
            <Ionicons color="#ffffff" name="call-outline" size={28} />
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Ended ───────────────────────────────────────────────────────────────
  if (callState === "ended") {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={DARK_BG} />
        <View style={styles.centerContent}>
          <Text style={styles.endedText}>{endedLabel}</Text>
          {elapsed > 0 && (
            <Text style={styles.endedDuration}>{formatTimer(elapsed)}</Text>
          )}
        </View>
      </View>
    );
  }

  // ── Connected ───────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BG} />

      {/* Remote video (full screen behind) */}
      {callType === "video" && remoteStreamUrl ? (
        <RTCView
          streamURL={remoteStreamUrl}
          style={styles.remoteVideo}
          objectFit="cover"
          zOrder={0}
        />
      ) : null}

      {/* Local video preview (small pip) */}
      {callType === "video" && localStreamUrl && isVideoEnabled ? (
        <View style={styles.localVideoPip}>
          <RTCView
            streamURL={localStreamUrl}
            style={styles.localVideo}
            objectFit="cover"
            mirror
            zOrder={1}
          />
        </View>
      ) : null}

      {/* Audio-only or video overlay content */}
      <View style={[styles.centerContent, callType === "video" && remoteStreamUrl && styles.overlayContent]}>
        {callType !== "video" || !remoteStreamUrl ? (
          <>
            {callerAvatar ? (
              <Image source={{ uri: callerAvatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons color="#ffffff" name="person" size={48} />
              </View>
            )}
            <Text style={styles.callerName}>{callerName}</Text>
          </>
        ) : null}
        <Text style={styles.timerText}>{formatTimer(elapsed)}</Text>
      </View>

      <View style={styles.controlsRow}>
        <Pressable
          onPress={handleToggleMute}
          style={[styles.controlButton, isMuted && styles.controlButtonActive]}
        >
          <Ionicons
            color="#ffffff"
            name={isMuted ? "mic-off-outline" : "mic-outline"}
            size={26}
          />
          <Text style={styles.controlLabel}>{isMuted ? "Unmute" : "Mute"}</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            const next = !isSpeaker;
            setIsSpeaker(next);
            if (InCallManager) InCallManager.setSpeakerphoneOn(next);
          }}
          style={[styles.controlButton, isSpeaker && styles.controlButtonActive]}
        >
          <Ionicons
            color="#ffffff"
            name={isSpeaker ? "volume-high-outline" : "volume-low-outline"}
            size={26}
          />
          <Text style={styles.controlLabel}>{isSpeaker ? "Speaker" : "Earpiece"}</Text>
        </Pressable>

        {callType === "video" && (
          <Pressable
            onPress={handleToggleVideo}
            style={[styles.controlButton, !isVideoEnabled && styles.controlButtonActive]}
          >
            <Ionicons
              color="#ffffff"
              name={isVideoEnabled ? "videocam-outline" : "videocam-off-outline"}
              size={26}
            />
            <Text style={styles.controlLabel}>{isVideoEnabled ? "Cam on" : "Cam off"}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.bottomBar}>
        <Pressable onPress={handleHangup} style={styles.hangupButton}>
          <Ionicons
            color="#ffffff"
            name="call-outline"
            size={28}
            style={{ transform: [{ rotate: "135deg" }] }}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: DARK_BG,
    flex: 1,
    justifyContent: "space-between",
  },
  centerContent: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  overlayContent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 200,
    zIndex: 2,
  },
  avatarWrap: {
    alignItems: "center",
    height: 120,
    justifyContent: "center",
    marginBottom: 8,
    width: 120,
  },
  pulseRing: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 60,
    height: 120,
    position: "absolute",
    width: 120,
  },
  avatar: {
    backgroundColor: "#333333",
    borderRadius: 48,
    height: 96,
    width: 96,
  },
  avatarPlaceholder: {
    alignItems: "center",
    backgroundColor: "#333333",
    borderRadius: 48,
    height: 96,
    justifyContent: "center",
    width: 96,
  },
  callerName: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  statusText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
    fontWeight: "500",
  },
  timerText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 1,
  },
  endedText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
  },
  endedDuration: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 15,
    fontWeight: "500",
  },
  // Video
  remoteVideo: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#000000",
  },
  localVideoPip: {
    borderColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 2,
    height: 180,
    overflow: "hidden",
    position: "absolute",
    right: 16,
    top: 48,
    width: 120,
    zIndex: 10,
  },
  localVideo: {
    flex: 1,
  },
  // Controls
  controlsRow: {
    flexDirection: "row",
    gap: 24,
    justifyContent: "center",
    paddingBottom: 24,
    paddingHorizontal: 24,
    zIndex: 5,
  },
  controlButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 32,
    gap: 6,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  controlButtonActive: {
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  controlLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 9,
    fontWeight: "600",
    position: "absolute",
    bottom: -18,
  },
  bottomBar: {
    alignItems: "center",
    paddingBottom: 48,
    paddingTop: 16,
    zIndex: 5,
  },
  bottomBarIncoming: {
    alignItems: "center",
    flexDirection: "row",
    gap: 64,
    justifyContent: "center",
    paddingBottom: 48,
    paddingTop: 16,
  },
  hangupButton: {
    alignItems: "center",
    backgroundColor: RED,
    borderRadius: 32,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  acceptButton: {
    alignItems: "center",
    backgroundColor: GREEN,
    borderRadius: 32,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
});
