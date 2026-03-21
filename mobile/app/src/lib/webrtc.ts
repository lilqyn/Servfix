import * as ws from "./websocket";
import { fetchIceServers } from "./api";

// WebRTC native module is not available in Expo Go — lazy-load to avoid crash
let RTCPeerConnection: any;
let RTCSessionDescription: any;
let RTCIceCandidate: any;
let mediaDevices: any;
export type MediaStream = any;

let webrtcLoaded = false;
function ensureWebRTC() {
  if (webrtcLoaded) return;
  try {
    const mod = require("react-native-webrtc");
    RTCPeerConnection = mod.RTCPeerConnection;
    RTCSessionDescription = mod.RTCSessionDescription;
    RTCIceCandidate = mod.RTCIceCandidate;
    mediaDevices = mod.mediaDevices;
    webrtcLoaded = true;
  } catch {
    throw new Error("WebRTC is not available in Expo Go. Use a development build.");
  }
}

// Fallback STUN-only config used when the backend is unreachable
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

let cachedIceServers: RTCIceServer[] | null = null;
let cacheExpiresAt = 0;

async function getIceServers(): Promise<RTCIceServer[]> {
  if (cachedIceServers && Date.now() < cacheExpiresAt) {
    return cachedIceServers;
  }
  try {
    const servers = await fetchIceServers();
    cachedIceServers = servers;
    cacheExpiresAt = Date.now() + 15 * 60 * 1000; // cache 15 min
    return servers;
  } catch {
    return cachedIceServers ?? FALLBACK_ICE_SERVERS;
  }
}

export type CallEventType =
  | "ringing"
  | "connected"
  | "ended"
  | "remote-stream"
  | "error";

export type CallEvent =
  | { type: "ringing" }
  | { type: "connected" }
  | { type: "ended"; reason?: string }
  | { type: "remote-stream"; stream: MediaStream }
  | { type: "error"; message: string };

type CallEventHandler = (event: CallEvent) => void;

let pc: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let remoteStream: MediaStream | null = null;
let currentCallId: string | null = null;
let currentTargetUserId: string | null = null;
let eventHandler: CallEventHandler | null = null;
let pendingIceCandidates: RTCIceCandidate[] = [];
let wsUnsubscribe: (() => void) | null = null;

function emit(event: CallEvent) {
  eventHandler?.(event);
}

function handleWsMessage(msg: Record<string, unknown>) {
  const type = msg.type as string;
  const from = msg.from as string | undefined;

  // Only process messages relevant to current call
  if (!currentCallId) return;

  switch (type) {
    case "call:answer":
      handleRemoteAnswer(msg);
      break;
    case "call:offer":
      // Handled externally by incoming call manager, not here
      break;
    case "call:ice-candidate":
      handleRemoteIceCandidate(msg);
      break;
    case "call:hangup":
    case "call:reject":
      if (from === currentTargetUserId || msg.callId === currentCallId) {
        emit({ type: "ended", reason: type === "call:reject" ? "rejected" : "remote_hangup" });
        cleanup();
      }
      break;
    case "call:busy":
      if (from === currentTargetUserId || msg.callId === currentCallId) {
        emit({ type: "ended", reason: "busy" });
        cleanup();
      }
      break;
  }
}

async function handleRemoteAnswer(msg: Record<string, unknown>) {
  if (!pc) return;
  try {
    const sdp = msg.sdp as string;
    await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp }));
    // Flush any ICE candidates that arrived before the answer
    for (const candidate of pendingIceCandidates) {
      await pc.addIceCandidate(candidate);
    }
    pendingIceCandidates = [];
  } catch (err) {
    emit({ type: "error", message: "Failed to set remote answer" });
  }
}

async function handleRemoteIceCandidate(msg: Record<string, unknown>) {
  if (!pc) return;
  try {
    const candidate = new RTCIceCandidate({
      candidate: msg.candidate as string,
      sdpMid: msg.sdpMid as string | undefined,
      sdpMLineIndex: msg.sdpMLineIndex as number | undefined,
    });
    if (pc.remoteDescription) {
      await pc.addIceCandidate(candidate);
    } else {
      pendingIceCandidates.push(candidate);
    }
  } catch {
    // ignore
  }
}

async function createPeerConnection() {
  ensureWebRTC();
  const iceServers = await getIceServers();
  pc = new RTCPeerConnection({ iceServers });

  // react-native-webrtc typings are incomplete — use `any` for event wiring
  const conn = pc as any;

  conn.onicecandidate = (event: { candidate: any | null }) => {
    if (event.candidate && currentTargetUserId) {
      ws.send({
        type: "call:ice-candidate",
        targetUserId: currentTargetUserId,
        callId: currentCallId,
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
      });
    }
  };

  conn.ontrack = (event: { streams: MediaStream[] }) => {
    if (event.streams && event.streams[0]) {
      remoteStream = event.streams[0];
      emit({ type: "remote-stream", stream: remoteStream });
    }
  };

  conn.onconnectionstatechange = () => {
    if (!pc) return;
    const state = conn.connectionState as string | undefined;
    if (state === "connected") {
      emit({ type: "connected" });
    } else if (state === "disconnected" || state === "failed" || state === "closed") {
      emit({ type: "ended", reason: state });
      cleanup();
    }
  };

  return pc;
}

async function getLocalMedia(callType: "audio" | "video"): Promise<any> {
  ensureWebRTC();
  const constraints: { audio: boolean; video: boolean | object } = {
    audio: true,
    video: callType === "video" ? { facingMode: "user", width: 640, height: 480 } : false,
  };
  const stream = await mediaDevices.getUserMedia(constraints);
  return stream as MediaStream;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Start an outgoing call: get media, create offer, send via WS */
export async function startCall(opts: {
  callId: string;
  targetUserId: string;
  callType: "audio" | "video";
  onEvent: CallEventHandler;
}) {
  cleanup();

  currentCallId = opts.callId;
  currentTargetUserId = opts.targetUserId;
  eventHandler = opts.onEvent;

  wsUnsubscribe = ws.subscribe(handleWsMessage);

  try {
    localStream = await getLocalMedia(opts.callType);
    await createPeerConnection();

    for (const track of localStream.getTracks()) {
      pc!.addTrack(track, localStream!);
    }

    const offer = await pc!.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: opts.callType === "video",
    });
    await pc!.setLocalDescription(offer);

    ws.send({
      type: "call:offer",
      targetUserId: opts.targetUserId,
      callId: opts.callId,
      callType: opts.callType,
      sdp: offer.sdp,
    });

    emit({ type: "ringing" });
  } catch (err) {
    emit({ type: "error", message: err instanceof Error ? err.message : "Failed to start call" });
    cleanup();
  }
}

/** Accept an incoming call: set remote offer, create answer, send via WS */
export async function acceptCall(opts: {
  callId: string;
  callerUserId: string;
  callType: "audio" | "video";
  offerSdp: string;
  onEvent: CallEventHandler;
}) {
  cleanup();

  currentCallId = opts.callId;
  currentTargetUserId = opts.callerUserId;
  eventHandler = opts.onEvent;

  wsUnsubscribe = ws.subscribe(handleWsMessage);

  try {
    localStream = await getLocalMedia(opts.callType);
    await createPeerConnection();

    for (const track of localStream.getTracks()) {
      pc!.addTrack(track, localStream!);
    }

    await pc!.setRemoteDescription(
      new RTCSessionDescription({ type: "offer", sdp: opts.offerSdp }),
    );

    // Flush any ICE candidates that arrived before we set the remote description
    for (const candidate of pendingIceCandidates) {
      await pc!.addIceCandidate(candidate);
    }
    pendingIceCandidates = [];

    const answer = await pc!.createAnswer();
    await pc!.setLocalDescription(answer);

    ws.send({
      type: "call:answer",
      targetUserId: opts.callerUserId,
      callId: opts.callId,
      sdp: answer.sdp,
    });
  } catch (err) {
    emit({ type: "error", message: err instanceof Error ? err.message : "Failed to accept call" });
    cleanup();
  }
}

/** Hang up the current call */
export function hangup() {
  if (currentTargetUserId && currentCallId) {
    ws.send({
      type: "call:hangup",
      targetUserId: currentTargetUserId,
      callId: currentCallId,
    });
  }
  emit({ type: "ended", reason: "local_hangup" });
  cleanup();
}

/** Reject an incoming call (before answering) */
export function rejectCall(callerUserId: string, callId: string) {
  ws.send({
    type: "call:reject",
    targetUserId: callerUserId,
    callId,
  });
}

/** Toggle mute on local audio track */
export function toggleMute(): boolean {
  if (!localStream) return false;
  const audioTracks = localStream.getAudioTracks();
  if (audioTracks.length === 0) return false;
  const newEnabled = !audioTracks[0].enabled;
  audioTracks[0].enabled = newEnabled;
  return !newEnabled; // return isMuted
}

/** Toggle local video track on/off */
export function toggleVideo(): boolean {
  if (!localStream) return true;
  const videoTracks = localStream.getVideoTracks();
  if (videoTracks.length === 0) return false;
  const newEnabled = !videoTracks[0].enabled;
  videoTracks[0].enabled = newEnabled;
  return newEnabled;
}

/** Get current local stream (for rendering local video preview) */
export function getLocalStream(): MediaStream | null {
  return localStream;
}

/** Get current remote stream */
export function getRemoteStream(): MediaStream | null {
  return remoteStream;
}

/** Clean up all WebRTC resources */
export function cleanup() {
  if (wsUnsubscribe) {
    wsUnsubscribe();
    wsUnsubscribe = null;
  }

  if (localStream) {
    for (const track of localStream.getTracks()) {
      track.stop();
    }
    localStream = null;
  }

  remoteStream = null;

  if (pc) {
    pc.close();
    pc = null;
  }

  currentCallId = null;
  currentTargetUserId = null;
  eventHandler = null;
  pendingIceCandidates = [];
}
