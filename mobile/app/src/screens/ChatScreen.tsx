import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import {
  fetchConversationMessages,
  markConversationRead,
  sendConversationMessage,
  uploadChatImage,
  uploadChatFile,
  fetchBlockStatus,
  blockUser,
  unblockUser,
  fetchThread,
} from "../lib/api";
import { useAuth } from "../providers/AuthProvider";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";
import type { ConversationMessage } from "../types";

type Props = {
  threadId: string;
  threadTitle?: string;
  onBack: () => void;
  onOpenQuotes?: (threadId: string) => void;
  onStartCall?: (callType: "audio" | "video") => void;
};

type PendingAttachment = {
  uri: string;
  type: "image" | "file";
  name: string;
  mimeType: string;
};

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

const mergeMessages = (prev: ConversationMessage[], incoming: ConversationMessage[]) => {
  const map = new Map<string, ConversationMessage>();
  prev.forEach((m) => map.set(m.id, m));
  incoming.forEach((m) => map.set(m.id, m));
  return [...map.values()].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
};

export function ChatScreen({ threadId, threadTitle, onBack, onOpenQuotes, onStartCall }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [iBlockedThem, setIBlockedThem] = useState(false);
  const [theyBlockedMe, setTheyBlockedMe] = useState(false);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const listRef = useRef<FlatList<ConversationMessage>>(null);

  const isBlockedEither = iBlockedThem || theyBlockedMe;

  const loadMessages = useCallback(
    async (options: { showLoader?: boolean } = {}) => {
      if (options.showLoader) setIsLoading(true);
      try {
        const data = await fetchConversationMessages(threadId);
        setMessages((prev) => mergeMessages(prev, data));
        await markConversationRead(threadId).catch(() => {});
        setError(null);
      } catch (err) {
        if (options.showLoader) {
          setError(err instanceof Error ? err.message : "Could not load messages.");
        }
      } finally {
        if (options.showLoader) setIsLoading(false);
      }
    },
    [threadId],
  );

  useEffect(() => {
    void loadMessages({ showLoader: true });
    // Load thread info to get other user and block status
    (async () => {
      try {
        const thread = await fetchThread(threadId);
        const other = thread.participants.find((p) => p.id !== "current-user");
        if (other) {
          setOtherUserId(other.id);
          const status = await fetchBlockStatus(other.id);
          setIBlockedThem(status.iBlockedThem);
          setTheyBlockedMe(status.theyBlockedMe);
        }
      } catch {
        // Non-critical — block status unknown
      }
    })();
  }, [loadMessages, threadId]);

  useEffect(() => {
    let subscribed = true;
    const interval = setInterval(() => {
      if (subscribed) void loadMessages();
    }, 8000);
    return () => {
      subscribed = false;
      clearInterval(interval);
    };
  }, [loadMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsMultipleSelection: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const name = asset.uri.split("/").pop() ?? "photo.jpg";
    setAttachment({
      uri: asset.uri,
      type: "image",
      name,
      mimeType: asset.mimeType ?? "image/jpeg",
    });
  }, []);

  const pickFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setAttachment({
      uri: asset.uri,
      type: "file",
      name: asset.name,
      mimeType: asset.mimeType ?? "application/octet-stream",
    });
  }, []);

  const showAttachmentOptions = useCallback(() => {
    Alert.alert("Attach", "Choose what to send", [
      { text: "Photo", onPress: () => void pickImage() },
      { text: "File", onPress: () => void pickFile() },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [pickImage, pickFile]);

  const send = useCallback(async () => {
    const text = draft.trim() || (attachment ? (attachment.type === "image" ? "Sent an image" : `Sent a file: ${attachment.name}`) : "");
    if ((!text && !attachment) || isSending) return;
    setIsSending(true);
    setIsUploading(!!attachment);
    setSendError(null);
    try {
      let attachmentData: { key: string; type: "image" | "file"; name?: string } | undefined;

      if (attachment) {
        if (attachment.type === "image") {
          const uploaded = await uploadChatImage(attachment.uri);
          attachmentData = { key: uploaded.key, type: "image" };
        } else {
          const uploaded = await uploadChatFile(attachment.uri, attachment.name, attachment.mimeType);
          attachmentData = { key: uploaded.key, type: "file", name: attachment.name };
        }
      }

      setIsUploading(false);
      const msg = await sendConversationMessage(threadId, text, attachmentData);
      setMessages((prev) => mergeMessages(prev, [msg]));
      setDraft("");
      setAttachment(null);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setIsSending(false);
      setIsUploading(false);
    }
  }, [draft, attachment, isSending, threadId]);

  const handleBlock = useCallback(() => {
    if (!otherUserId) return;
    Alert.alert(
      iBlockedThem ? "Unblock user" : "Block user",
      iBlockedThem
        ? "They will be able to message and call you again."
        : "They won't be able to message or call you, and you won't be able to message or call them.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: iBlockedThem ? "Unblock" : "Block",
          style: iBlockedThem ? "default" : "destructive",
          onPress: async () => {
            try {
              if (iBlockedThem) {
                await unblockUser(otherUserId);
                setIBlockedThem(false);
              } else {
                await blockUser(otherUserId);
                setIBlockedThem(true);
              }
            } catch {
              Alert.alert("Error", "Could not update block status. Try again.");
            }
            setShowMenu(false);
          },
        },
      ],
    );
  }, [otherUserId, iBlockedThem]);

  const isMine = (msg: ConversationMessage) =>
    msg.senderId === user?.id || msg.senderId === "current-user";

  const canSend = !!(draft.trim() || attachment) && !isBlockedEither;

  const renderBubble = ({ item }: { item: ConversationMessage }) => {
    const mine = isMine(item);
    return (
      <View style={[styles.bubbleWrap, mine ? styles.bubbleWrapMine : styles.bubbleWrapPeer]}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubblePeer]}>
          {item.attachmentUrl && item.attachmentType === "image" && (
            <Pressable onPress={() => Linking.openURL(item.attachmentUrl!)}>
              <Image
                source={{ uri: item.attachmentUrl }}
                style={styles.attachmentImage}
                resizeMode="cover"
              />
            </Pressable>
          )}
          {item.attachmentUrl && item.attachmentType === "file" && (
            <Pressable
              onPress={() => Linking.openURL(item.attachmentUrl!)}
              style={[styles.fileAttachment, mine ? styles.fileAttachmentMine : styles.fileAttachmentPeer]}
            >
              <Ionicons name="document-outline" size={20} color={mine ? "#ffffff" : palette.accentDeep} />
              <Text
                numberOfLines={1}
                style={[styles.fileName, mine ? styles.fileNameMine : styles.fileNamePeer]}
              >
                {item.attachmentName ?? "File"}
              </Text>
              <Ionicons name="download-outline" size={16} color={mine ? "rgba(255,255,255,0.7)" : palette.slate} />
            </Pressable>
          )}
          {item.content && !(item.attachmentUrl && item.content === "Sent an image") && !(item.attachmentUrl && item.content.startsWith("Sent a file:")) && (
            <Text style={mine ? styles.bubbleMineText : styles.bubblePeerText}>
              {item.content}
            </Text>
          )}
        </View>
        <Text style={[styles.bubbleMeta, mine ? styles.bubbleMetaMine : styles.bubbleMetaPeer]}>
          {formatTime(item.timestamp)}
          {mine ? (item.read ? " · Seen" : " · Sent") : ""}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      {/* Header */}
      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </Pressable>
        <Text numberOfLines={1} style={styles.threadTitle}>
          {threadTitle ?? "Conversation"}
        </Text>
        {onStartCall && !isBlockedEither && (
          <Pressable onPress={() => onStartCall("audio")} style={styles.callIconButton}>
            <Ionicons color={palette.accentDeep} name="call-outline" size={20} />
          </Pressable>
        )}
        {/* Video calls disabled for now */}
        {onOpenQuotes && (
          <Pressable onPress={() => onOpenQuotes(threadId)} style={styles.quotesButton}>
            <Text style={styles.quotesButtonText}>Quotes</Text>
          </Pressable>
        )}
        <Pressable onPress={() => setShowMenu((v) => !v)} style={styles.menuButton}>
          <Ionicons name="ellipsis-vertical" size={20} color={palette.ink} />
        </Pressable>
      </View>

      {/* Dropdown menu */}
      {showMenu && (
        <View style={styles.dropdownMenu}>
          <Pressable
            onPress={() => { setShowMenu(false); handleBlock(); }}
            style={styles.dropdownItem}
          >
            <Ionicons
              name={iBlockedThem ? "person-add-outline" : "ban-outline"}
              size={18}
              color={iBlockedThem ? palette.accentDeep : palette.danger}
            />
            <Text style={[styles.dropdownText, !iBlockedThem && { color: palette.danger }]}>
              {iBlockedThem ? "Unblock user" : "Block user"}
            </Text>
          </Pressable>
        </View>
      )}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={palette.accent} size="large" />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Could not load messages</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Pressable onPress={() => void loadMessages({ showLoader: true })} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          contentContainerStyle={styles.messageList}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderBubble}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
            </View>
          }
        />
      )}

      {/* Blocked banner */}
      {isBlockedEither && (
        <View style={styles.blockedBanner}>
          <Ionicons name="ban-outline" size={16} color={palette.danger} />
          <Text style={styles.blockedText}>
            {iBlockedThem
              ? "You blocked this user. Unblock to resume messaging."
              : "This user has blocked you."}
          </Text>
        </View>
      )}

      {/* Composer */}
      <View style={styles.composerWrap}>
        {sendError ? (
          <Text style={styles.sendError}>{sendError}</Text>
        ) : null}

        {/* Attachment preview */}
        {attachment && (
          <View style={styles.attachmentPreview}>
            {attachment.type === "image" ? (
              <Image source={{ uri: attachment.uri }} style={styles.previewThumb} />
            ) : (
              <View style={styles.previewFile}>
                <Ionicons name="document-outline" size={18} color={palette.accentDeep} />
                <Text numberOfLines={1} style={styles.previewFileName}>{attachment.name}</Text>
              </View>
            )}
            <Pressable onPress={() => setAttachment(null)} style={styles.previewRemove}>
              <Ionicons name="close-circle" size={20} color={palette.danger} />
            </Pressable>
          </View>
        )}

        {isUploading && (
          <View style={styles.uploadingRow}>
            <ActivityIndicator color={palette.accent} size="small" />
            <Text style={styles.uploadingText}>Uploading...</Text>
          </View>
        )}

        <View style={styles.composer}>
          <Pressable onPress={showAttachmentOptions} style={styles.attachButton} disabled={isSending || isBlockedEither}>
            <Ionicons name="add-circle-outline" size={26} color={isSending ? palette.slate : palette.accentDeep} />
          </Pressable>
          <TextInput
            editable={!isSending && !isBlockedEither}
            multiline
            onChangeText={(t) => {
              setDraft(t);
              setSendError(null);
            }}
            placeholder="Type a message..."
            placeholderTextColor={palette.slate}
            style={styles.input}
            value={draft}
          />
          <Pressable
            disabled={isSending || !canSend}
            onPress={() => void send()}
            style={[
              styles.sendButton,
              (isSending || !canSend) && styles.sendButtonDisabled,
            ]}
          >
            {isSending && !isUploading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Ionicons name="send" size={18} color="#ffffff" />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = createThemedStyles((palette) => ({
  root: { backgroundColor: palette.canvas, flex: 1, marginBottom: Platform.OS === "android" ? 20 : 0 },
  topBar: {
    alignItems: "center",
    backgroundColor: palette.card,
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backButton: { padding: 4 },
  backButtonText: { color: palette.accentDeep, fontSize: 22, fontWeight: "700" },
  threadTitle: { color: palette.ink, flex: 1, fontSize: 16, fontWeight: "800" },
  callIconButton: {
    alignItems: "center",
    backgroundColor: palette.accentSoft,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  quotesButton: {
    backgroundColor: palette.accentSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  quotesButtonText: { color: palette.accentDeep, fontSize: 12, fontWeight: "700" },
  centered: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24,
  },
  loadingText: { color: palette.slate, fontSize: 14 },
  errorTitle: { color: palette.danger, fontSize: 16, fontWeight: "700" },
  errorBody: { color: palette.slate, fontSize: 14, textAlign: "center" },
  retryButton: {
    backgroundColor: palette.accentDeep,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  messageList: {
    gap: 10,
    padding: 16,
    paddingBottom: 20,
  },
  emptyWrap: { alignItems: "center", paddingTop: 40 },
  emptyText: { color: palette.slate, fontSize: 14 },
  bubbleWrap: { gap: 3, maxWidth: "85%" },
  bubbleWrapMine: { alignSelf: "flex-end", alignItems: "flex-end" },
  bubbleWrapPeer: { alignSelf: "flex-start", alignItems: "flex-start" },
  bubble: { borderRadius: 16, overflow: "hidden" },
  bubbleMine: { backgroundColor: palette.accentDeep },
  bubblePeer: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderWidth: 1,
  },
  bubbleMineText: { color: "#ffffff", fontSize: 14, lineHeight: 20, paddingHorizontal: 14, paddingVertical: 10 },
  bubblePeerText: { color: palette.ink, fontSize: 14, lineHeight: 20, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMeta: { fontSize: 10 },
  bubbleMetaMine: { color: palette.slate, textAlign: "right" },
  bubbleMetaPeer: { color: palette.slate },

  /* Attachment in bubble */
  attachmentImage: {
    borderRadius: 12,
    height: 180,
    width: 220,
  },
  fileAttachment: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 8,
    margin: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  fileAttachmentMine: { backgroundColor: "rgba(255,255,255,0.15)" },
  fileAttachmentPeer: { backgroundColor: palette.accentSoft },
  fileName: { flex: 1, fontSize: 13 },
  fileNameMine: { color: "#ffffff" },
  fileNamePeer: { color: palette.ink },

  /* Composer */
  composerWrap: {
    backgroundColor: palette.card,
    borderTopColor: palette.line,
    borderTopWidth: 1,
    gap: 6,
    padding: 10,
    paddingBottom: Platform.OS === "ios" ? 28 : 10,
  },
  sendError: { color: palette.danger, fontSize: 12 },
  composer: { alignItems: "flex-end", flexDirection: "row", gap: 8 },
  attachButton: { justifyContent: "center", paddingBottom: 10 },
  input: {
    backgroundColor: palette.isDark ? "#1a2e1a" : palette.inputBg,
    borderColor: palette.isDark ? "#3d5a3d" : palette.line,
    borderRadius: 14,
    borderWidth: 1,
    color: palette.ink,
    flex: 1,
    fontSize: 14,
    maxHeight: 100,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: palette.accent,
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  sendButtonDisabled: { opacity: 0.5 },

  /* Attachment preview */
  attachmentPreview: {
    alignItems: "center",
    backgroundColor: palette.inputBg,
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    padding: 8,
  },
  previewThumb: {
    borderRadius: 8,
    height: 48,
    width: 48,
  },
  previewFile: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 8,
  },
  previewFileName: { color: palette.ink, flex: 1, fontSize: 13 },
  previewRemove: { padding: 4 },

  uploadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 4,
  },
  uploadingText: { color: palette.slate, fontSize: 12 },

  /* Menu button & dropdown */
  menuButton: { padding: 6 },
  dropdownMenu: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 8,
    position: "absolute",
    right: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    top: 56,
    zIndex: 100,
  },
  dropdownItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownText: { color: palette.ink, fontSize: 14, fontWeight: "600" },

  /* Blocked banner */
  blockedBanner: {
    alignItems: "center",
    backgroundColor: palette.dangerSoft,
    borderColor: palette.dangerLine,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  blockedText: { color: palette.danger, flex: 1, fontSize: 13 },
}));
