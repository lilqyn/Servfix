type Platform = "ios" | "android" | "web" | "unknown" | string;

type PushTokenRecord = {
  token: string;
  platform: Platform;
  projectId?: string | null;
};

const pushTokens = new Map<string, Set<PushTokenRecord>>();

export const addPushToken = (userId: string, record: PushTokenRecord) => {
  const existing = pushTokens.get(userId) ?? new Set<PushTokenRecord>();
  existing.add(record);
  pushTokens.set(userId, existing);
};

export const removePushToken = (userId: string, token?: string | null) => {
  if (!token) {
    pushTokens.delete(userId);
    return;
  }
  const existing = pushTokens.get(userId);
  if (!existing) {
    return;
  }
  for (const entry of Array.from(existing)) {
    if (entry.token === token) {
      existing.delete(entry);
    }
  }
  if (existing.size === 0) {
    pushTokens.delete(userId);
  } else {
    pushTokens.set(userId, existing);
  }
};

export const listPushTokens = (userId: string): PushTokenRecord[] => {
  return Array.from(pushTokens.get(userId) ?? []);
};
