import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired } from "../middleware/auth.js";
import { createSupportTicketEvent, formatTicketNumber } from "../utils/tickets.js";

export const supportRouter = Router();

const paginationSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const createTicketSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  category: z.string().trim().max(80).optional(),
  message: z.string().trim().min(5).max(2000),
});

const supportMessageSchema = z.object({
  message: z.string().trim().min(2).max(2000),
});

supportRouter.get(
  "/tickets",
  authRequired,
  asyncHandler(async (req, res) => {
    const query = paginationSchema.parse(req.query);
    const limit = query.limit ?? 20;

    const tickets = await prisma.supportTicket.findMany({
      where: { userId: req.user!.id },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      include: {
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, body: true, senderRole: true, createdAt: true },
        },
      },
    });

    const hasNext = tickets.length > limit;
    const trimmed = hasNext ? tickets.slice(0, limit) : tickets;
    const nextCursor = hasNext ? trimmed[trimmed.length - 1]?.id ?? null : null;

    res.json({
      tickets: trimmed.map((ticket) => ({
        id: ticket.id,
        ticketNumber: formatTicketNumber(ticket.ticketNumber, ticket.id),
        subject: ticket.subject,
        category: ticket.category,
        status: ticket.status,
        department: ticket.department,
        priority: ticket.priority,
        assignedRole: ticket.assignedRole,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        lastMessageAt: ticket.lastMessageAt,
        lastMessage: ticket.messages[0] ?? null,
      })),
      nextCursor,
    });
  }),
);

supportRouter.post(
  "/tickets",
  authRequired,
  asyncHandler(async (req, res) => {
    const data = createTicketSchema.parse(req.body);
    const now = new Date();

    const ticket = await prisma.supportTicket.create({
      data: {
        userId: req.user!.id,
        subject: data.subject,
        category: data.category ?? null,
        status: "open",
        lastMessageAt: now,
        messages: {
          create: {
            senderId: req.user!.id,
            senderRole: req.user!.role,
            body: data.message,
            isInternal: false,
          },
        },
      },
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        category: true,
        status: true,
        department: true,
        priority: true,
        assignedRole: true,
        createdAt: true,
        lastMessageAt: true,
      },
    });

    await createSupportTicketEvent({
      ticketId: ticket.id,
      actorId: req.user!.id,
      type: "created",
      data: {
        subject: ticket.subject,
        category: ticket.category,
        department: ticket.department,
        priority: ticket.priority,
      },
    });

    res.status(201).json({
      ticket: { ...ticket, ticketNumber: formatTicketNumber(ticket.ticketNumber, ticket.id) },
    });
  }),
);

supportRouter.get(
  "/tickets/:id",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      include: {
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            body: true,
            senderId: true,
            senderRole: true,
            createdAt: true,
          },
        },
        meetings: {
          orderBy: { scheduledAt: "desc" },
          select: {
            id: true,
            scheduledAt: true,
            durationMinutes: true,
            meetingUrl: true,
            notes: true,
            createdAt: true,
          },
        },
      },
    });

    if (!ticket || ticket.userId !== req.user!.id) {
      return res.status(404).json({ error: "Support ticket not found." });
    }

    res.json({
      id: ticket.id,
      ticketNumber: formatTicketNumber(ticket.ticketNumber, ticket.id),
      subject: ticket.subject,
      category: ticket.category,
      status: ticket.status,
      department: ticket.department,
      priority: ticket.priority,
      assignedRole: ticket.assignedRole,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      lastMessageAt: ticket.lastMessageAt,
      messages: ticket.messages,
      meetings: ticket.meetings,
    });
  }),
);

supportRouter.post(
  "/tickets/:id/messages",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = supportMessageSchema.parse(req.body);

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      select: { id: true, userId: true, status: true },
    });

    if (!ticket || ticket.userId !== req.user!.id) {
      return res.status(404).json({ error: "Support ticket not found." });
    }

    if (ticket.status === "closed") {
      return res.status(400).json({ error: "This ticket is closed." });
    }

    const nextStatus = ticket.status === "resolved" ? "open" : ticket.status;
    const now = new Date();

    const [message] = await prisma.$transaction([
      prisma.supportTicketMessage.create({
        data: {
          ticketId: ticket.id,
          senderId: req.user!.id,
          senderRole: req.user!.role,
          body: data.message,
          isInternal: false,
        },
        select: { id: true, body: true, senderRole: true, createdAt: true },
      }),
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: nextStatus,
          lastMessageAt: now,
        },
      }),
    ]);

    res.json({ message, status: nextStatus });
  }),
);
