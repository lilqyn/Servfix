import { prisma } from "../db.js";

type Platform = "ios" | "android" | "web" | "unknown" | string;

export type PushTokenRecord = {
  token: string;
  platform: Platform;
  projectId?: string | null;
};

export const addPushToken = async (userId: string, record: PushTokenRecord) => {
  await prisma.pushToken.upsert({
    where: { userId_token: { userId, token: record.token } },
    update: { platform: record.platform, projectId: record.projectId ?? null },
    create: {
      userId,
      token: record.token,
      platform: record.platform,
      projectId: record.projectId ?? null,
    },
  });
};

export const removePushToken = async (userId: string, token?: string | null) => {
  if (!token) {
    await prisma.pushToken.deleteMany({ where: { userId } });
    return;
  }
  await prisma.pushToken.deleteMany({ where: { userId, token } });
};

export const listPushTokens = async (userId: string): Promise<PushTokenRecord[]> => {
  const records = await prisma.pushToken.findMany({ where: { userId } });
  return records.map((r) => ({
    token: r.token,
    platform: r.platform,
    projectId: r.projectId,
  }));
};
