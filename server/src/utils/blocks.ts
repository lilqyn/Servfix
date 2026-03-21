import { prisma } from "../db.js";

/**
 * Check if either user has blocked the other.
 * Returns true if a block exists in either direction.
 */
export async function isBlocked(userA: string, userB: string): Promise<boolean> {
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userA, blockedId: userB },
        { blockerId: userB, blockedId: userA },
      ],
    },
    select: { id: true },
  });
  return !!block;
}
