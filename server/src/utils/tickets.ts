import { Prisma, type SupportTicketEventType } from "@prisma/client";
import { prisma } from "../db.js";

export const formatTicketNumber = (ticketNumber?: number | null, fallbackId?: string) => {
  if (typeof ticketNumber === "number" && Number.isFinite(ticketNumber)) {
    return `TKT-${String(ticketNumber).padStart(6, "0")}`;
  }
  if (fallbackId) {
    const token = fallbackId.split("-")[0] ?? fallbackId;
    return `TKT-${token.toUpperCase()}`;
  }
  return "TKT-UNKNOWN";
};

export const createSupportTicketEvent = async (params: {
  ticketId: string;
  actorId?: string | null;
  type: SupportTicketEventType;
  data?: Prisma.InputJsonValue;
}) => {
  return prisma.supportTicketEvent.create({
    data: {
      ticketId: params.ticketId,
      actorId: params.actorId ?? null,
      type: params.type,
      data: params.data ?? Prisma.JsonNull,
    },
  });
};
