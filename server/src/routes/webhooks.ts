import { Router } from "express";
import type { Request } from "express";
import crypto from "crypto";
import multer from "multer";
import { prisma } from "../db.js";
import { env } from "../config.js";
import { asyncHandler } from "../utils/async-handler.js";
import { createNotification } from "../utils/notifications.js";
import { getPlatformSettings } from "../utils/platform-settings.js";
import { Prisma, type PaymentProvider } from "@prisma/client";
import { finalizePayment } from "./payments.js";
import { queryExpresspayPayment, resolveExpresspayConfig } from "../utils/expresspay.js";
import { createSupportTicketEvent } from "../utils/tickets.js";
import { allocateDisbursementToOrders } from "../utils/order-flow.js";

export const webhooksRouter = Router();

const timingSafeEqual = (a: string, b: string) => {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
};

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const SUPPORT_TICKET_NUMBER_PATTERN = /(?:^|[\s#[(])TKT-(\d{1,10})(?:\b|[\])])/i;
const MAX_EMAIL_SUBJECT_LENGTH = 120;
const MAX_EMAIL_BODY_LENGTH = 2000;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const extractEmailAddress = (value: unknown): string | null => {
  const raw = asString(value);
  if (!raw) {
    return null;
  }

  const angleMatch = raw.match(/<([^>]+)>/);
  const candidate = (angleMatch?.[1] ?? raw).trim().toLowerCase();
  return EMAIL_ADDRESS_PATTERN.test(candidate) ? candidate : null;
};

const stripHtml = (value: string) =>
  value
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const normalizeEmailText = (value: string | null) => {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, MAX_EMAIL_BODY_LENGTH);
};

const extractTicketNumber = (...inputs: Array<string | null>) => {
  for (const value of inputs) {
    if (!value) {
      continue;
    }

    const match = value.match(SUPPORT_TICKET_NUMBER_PATTERN);
    if (!match?.[1]) {
      continue;
    }

    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
};

const resolveEmailWebhookSecret = (settings: Awaited<ReturnType<typeof getPlatformSettings>>["settings"]) =>
  settings.integrations.webhooks.outboundSigningKey.trim();

const readTokenCandidate = (value: unknown) => {
  if (Array.isArray(value)) {
    return asString(value[0] ?? null);
  }
  return asString(value);
};

const hasValidEmailWebhookToken = (req: Request, secret: string) => {
  const queryToken = readTokenCandidate(req.query.token);
  if (queryToken && timingSafeEqual(queryToken, secret)) {
    return true;
  }

  const headerToken =
    readTokenCandidate(req.headers["x-servfix-webhook-token"]) ??
    readTokenCandidate(req.headers["x-postmark-server-token"]);

  if (headerToken && timingSafeEqual(headerToken, secret)) {
    return true;
  }

  const authHeader = readTokenCandidate(req.headers.authorization);
  if (!authHeader) {
    return false;
  }

  if (authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice("Bearer ".length).trim();
    return Boolean(bearer) && timingSafeEqual(bearer, secret);
  }

  return timingSafeEqual(authHeader, secret);
};

const createEmailAuditLog = async (params: {
  action: string;
  entityId: string;
  payload: unknown;
}) => {
  const entityId =
    params.entityId.trim() || `email-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  let payload: Prisma.InputJsonValue;
  try {
    payload = JSON.parse(JSON.stringify(params.payload ?? null)) as Prisma.InputJsonValue;
  } catch {
    payload = {
      serializationError: true,
      fallback: String(params.payload),
    } as Prisma.InputJsonValue;
  }

  await prisma.auditLog.create({
    data: {
      action: params.action,
      entityType: "email",
      entityId,
      payload,
    },
  });
};

const EMAIL_WEBHOOK_MAX_FILES = 8;
const EMAIL_WEBHOOK_MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const SENDGRID_SIGNATURE_TIMESTAMP_HEADER = "x-twilio-email-event-webhook-timestamp";
const SENDGRID_SIGNATURE_HEADER = "x-twilio-email-event-webhook-signature";
const MAILGUN_SIGNATURE_WINDOW_SECONDS = 15 * 60;

const emailInboundFormDataParser = multer({
  storage: multer.memoryStorage(),
  limits: {
    fields: 200,
    files: EMAIL_WEBHOOK_MAX_FILES,
    fileSize: EMAIL_WEBHOOK_MAX_FILE_SIZE_BYTES,
  },
}).any();

type SupportedEmailWebhookProvider = "postmark" | "sendgrid" | "mailgun";

const resolveEmailWebhookProvider = (
  settings: Awaited<ReturnType<typeof getPlatformSettings>>["settings"],
): SupportedEmailWebhookProvider => {
  const provider = settings.integrations.email.provider;
  if (provider === "sendgrid" || provider === "mailgun" || provider === "postmark") {
    return provider;
  }
  return "postmark";
};

const toTrimmedString = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
  }
  return null;
};

const getRecordValue = (record: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const candidates = Array.from(
      new Set([
        key,
        key.toLowerCase(),
        key.toUpperCase(),
        key.replace(/-/g, "_"),
        key.replace(/_/g, "-"),
        key.replace(/-/g, "_").toLowerCase(),
        key.replace(/_/g, "-").toLowerCase(),
      ]),
    );

    for (const candidate of candidates) {
      if (Object.prototype.hasOwnProperty.call(record, candidate)) {
        return record[candidate];
      }
    }
  }
  return undefined;
};

const readRecordString = (record: Record<string, unknown>, ...keys: string[]) =>
  toTrimmedString(getRecordValue(record, ...keys));

const parseJsonRecord = (value: unknown) => {
  const raw = toTrimmedString(value);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return asRecord(parsed);
  } catch {
    return null;
  }
};

const parseJsonArray = (value: unknown) => {
  const raw = toTrimmedString(value);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const extractFirstEmailFromText = (value: unknown) => {
  const raw = toTrimmedString(value);
  if (!raw) {
    return null;
  }

  const matches = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  for (const match of matches) {
    const email = extractEmailAddress(match);
    if (email) {
      return email;
    }
  }

  return extractEmailAddress(raw);
};

const extractMailboxHintFromAddress = (value: unknown) => {
  const email = extractEmailAddress(value) ?? extractFirstEmailFromText(value);
  if (!email) {
    return null;
  }

  const atIndex = email.indexOf("@");
  if (atIndex <= 0) {
    return null;
  }

  const localPart = email.slice(0, atIndex);
  const plusIndex = localPart.indexOf("+");
  if (plusIndex < 0 || plusIndex >= localPart.length - 1) {
    return null;
  }

  return localPart.slice(plusIndex + 1);
};

const extractMessageIdFromHeaderBlock = (rawHeaders: unknown) => {
  const block = toTrimmedString(rawHeaders);
  if (!block) {
    return null;
  }

  const lines = block.split(/\r?\n/);
  for (const line of lines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }

    const name = line.slice(0, separatorIndex).trim().toLowerCase();
    if (name !== "message-id") {
      continue;
    }

    const value = line.slice(separatorIndex + 1).trim();
    return value ? value : null;
  }

  return null;
};

const extractMessageIdFromMailgunHeaders = (value: unknown) => {
  const headersRecord = asRecord(value) ?? parseJsonRecord(value);
  if (headersRecord) {
    return (
      readRecordString(headersRecord, "message-id", "message_id", "Message-ID", "Message-Id") ??
      null
    );
  }

  const headersArray = Array.isArray(value) ? value : parseJsonArray(value);
  if (!headersArray) {
    return null;
  }

  for (const item of headersArray) {
    if (Array.isArray(item) && item.length >= 2) {
      const name = toTrimmedString(item[0])?.toLowerCase();
      if (name === "message-id") {
        return toTrimmedString(item[1]);
      }
      continue;
    }

    const itemRecord = asRecord(item);
    if (!itemRecord) {
      continue;
    }

    const name =
      readRecordString(itemRecord, "name", "key", "header")?.toLowerCase() ??
      readRecordString(itemRecord, "0")?.toLowerCase();
    if (name !== "message-id") {
      continue;
    }

    const headerValue = readRecordString(itemRecord, "value", "1");
    if (headerValue) {
      return headerValue;
    }
  }

  return null;
};

const normalizeEventType = (value: string | null) => {
  if (!value) {
    return "unknown";
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
};

const normalizeSendGridPublicKey = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes("BEGIN PUBLIC KEY")) {
    return trimmed;
  }

  const compact = trimmed.replace(/\s+/g, "");
  if (!compact) {
    return null;
  }

  const wrapped = compact.match(/.{1,64}/g)?.join("\n") ?? compact;
  return `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----`;
};

const decodeBase64Value = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  const padded = normalized + "=".repeat(padLength);
  return Buffer.from(padded, "base64");
};

const verifySendGridSignature = (params: {
  rawBody: string;
  timestamp: string;
  signature: string;
  publicKey: string;
}) => {
  if (!params.rawBody || !params.timestamp || !params.signature || !params.publicKey) {
    return false;
  }

  const publicKey = normalizeSendGridPublicKey(params.publicKey);
  if (!publicKey) {
    return false;
  }

  try {
    const payload = Buffer.concat([
      Buffer.from(params.timestamp, "utf8"),
      Buffer.from(params.rawBody, "utf8"),
    ]);
    const signature = decodeBase64Value(params.signature);
    return crypto.verify("sha256", payload, publicKey, signature);
  } catch {
    return false;
  }
};

const extractMailgunSignaturePayload = (payload: Record<string, unknown>) => {
  const signatureRecord = asRecord(getRecordValue(payload, "signature")) ?? {};
  const timestamp =
    readRecordString(signatureRecord, "timestamp") ??
    readRecordString(payload, "timestamp");
  const token =
    readRecordString(signatureRecord, "token") ??
    readRecordString(payload, "token");
  const signature =
    readRecordString(signatureRecord, "signature") ??
    readRecordString(payload, "signature");

  if (!timestamp || !token || !signature) {
    return null;
  }

  return { timestamp, token, signature };
};

const verifyMailgunSignature = (params: {
  timestamp: string;
  token: string;
  signature: string;
  signingKey: string;
}) => {
  const expected = crypto
    .createHmac("sha256", params.signingKey)
    .update(`${params.timestamp}${params.token}`, "utf8")
    .digest("hex");

  if (!timingSafeEqual(expected, params.signature)) {
    return false;
  }

  const parsedTimestamp = Number(params.timestamp);
  if (!Number.isFinite(parsedTimestamp)) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsedTimestamp) > MAILGUN_SIGNATURE_WINDOW_SECONDS) {
    return false;
  }

  return true;
};

const hasValidEmailWebhookAuth = (params: {
  req: Request;
  provider: SupportedEmailWebhookProvider;
  payload: Record<string, unknown>;
  secret: string;
}) => {
  const tokenValid = hasValidEmailWebhookToken(params.req, params.secret);

  if (params.provider === "mailgun") {
    const signaturePayload = extractMailgunSignaturePayload(params.payload);
    if (!signaturePayload) {
      return tokenValid;
    }

    const signatureValid = verifyMailgunSignature({
      ...signaturePayload,
      signingKey: params.secret,
    });

    return signatureValid || tokenValid;
  }

  if (params.provider === "sendgrid") {
    const timestamp = readTokenCandidate(params.req.headers[SENDGRID_SIGNATURE_TIMESTAMP_HEADER]);
    const signature = readTokenCandidate(params.req.headers[SENDGRID_SIGNATURE_HEADER]);
    const rawBody = params.req.rawBody?.toString("utf8") ?? "";

    if (timestamp && signature && rawBody) {
      const signatureValid = verifySendGridSignature({
        rawBody,
        timestamp,
        signature,
        publicKey: params.secret,
      });
      return signatureValid || tokenValid;
    }

    return tokenValid;
  }

  return tokenValid;
};

const extractEmailEventRecords = (body: unknown) => {
  if (Array.isArray(body)) {
    return body.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item));
  }

  const payload = asRecord(body);
  if (!payload) {
    return [];
  }

  const eventsArray = getRecordValue(payload, "events");
  if (Array.isArray(eventsArray)) {
    const eventRecords = eventsArray
      .map(asRecord)
      .filter((item): item is Record<string, unknown> => Boolean(item));
    if (eventRecords.length > 0) {
      return eventRecords;
    }
  }

  const eventDataRecord =
    asRecord(getRecordValue(payload, "event-data", "event_data")) ??
    parseJsonRecord(getRecordValue(payload, "event-data", "event_data"));
  if (eventDataRecord) {
    return [eventDataRecord];
  }

  return [payload];
};

const parseInboundEmailPayload = (payload: Record<string, unknown>) => {
  const fromFull = asRecord(getRecordValue(payload, "FromFull", "from_full")) ?? {};
  const envelopeRecord = parseJsonRecord(getRecordValue(payload, "envelope")) ?? {};
  const mailgunHeaders = getRecordValue(payload, "message-headers", "message_headers");

  const senderEmail =
    extractEmailAddress(getRecordValue(fromFull, "Email")) ??
    extractEmailAddress(getRecordValue(payload, "From", "Sender", "sender", "from")) ??
    extractEmailAddress(getRecordValue(envelopeRecord, "from")) ??
    extractFirstEmailFromText(getRecordValue(payload, "from", "sender"));

  const subject =
    readRecordString(payload, "Subject", "subject") ?? "Email support request";

  const textBody =
    readRecordString(payload, "StrippedTextReply", "TextBody", "Text") ??
    readRecordString(payload, "text", "stripped-text", "body-plain", "body_plain");
  const htmlBody =
    readRecordString(payload, "StrippedHtmlBody", "HtmlBody") ??
    readRecordString(payload, "html", "stripped-html", "body-html", "body_html");

  const messageBody = normalizeEmailText(textBody ?? (htmlBody ? stripHtml(htmlBody) : null));

  const recipient =
    extractEmailAddress(getRecordValue(payload, "To", "to", "Recipient", "recipient")) ??
    extractFirstEmailFromText(getRecordValue(payload, "To", "to", "Recipient", "recipient")) ??
    extractEmailAddress(
      Array.isArray(getRecordValue(envelopeRecord, "to"))
        ? (getRecordValue(envelopeRecord, "to") as unknown[])[0]
        : getRecordValue(envelopeRecord, "to"),
    );

  const mailboxHint =
    readRecordString(payload, "MailboxHash", "mailbox_hash") ??
    extractMailboxHintFromAddress(recipient);

  const messageId =
    readRecordString(payload, "MessageID", "MessageId", "message-id", "Message-Id", "Message-ID") ??
    readRecordString(payload, "sg_message_id", "sg_messageid", "id") ??
    extractMessageIdFromHeaderBlock(getRecordValue(payload, "headers")) ??
    extractMessageIdFromMailgunHeaders(mailgunHeaders) ??
    null;

  return {
    senderEmail,
    subject,
    messageBody,
    mailboxHint,
    messageId,
  };
};

const parseEmailEvent = (eventRecord: Record<string, unknown>) => {
  const eventTypeValue =
    readRecordString(eventRecord, "RecordType", "Type", "type", "event") ?? "unknown";
  const normalizedEventType = normalizeEventType(eventTypeValue);

  const recipientFromMessage = asRecord(getRecordValue(eventRecord, "message")) ?? {};
  const headersFromMessage = asRecord(getRecordValue(recipientFromMessage, "headers")) ?? {};
  const headersFromMessageJson = parseJsonRecord(getRecordValue(recipientFromMessage, "headers")) ?? {};

  const email =
    extractEmailAddress(getRecordValue(eventRecord, "Email", "Recipient", "email", "recipient")) ??
    extractFirstEmailFromText(getRecordValue(eventRecord, "Email", "Recipient", "email", "recipient")) ??
    extractEmailAddress(getRecordValue(recipientFromMessage, "to", "recipient")) ??
    extractFirstEmailFromText(getRecordValue(recipientFromMessage, "to", "recipient"));

  const messageId =
    readRecordString(eventRecord, "MessageID", "MessageId", "sg_message_id", "ID", "id") ??
    readRecordString(headersFromMessage, "message-id", "Message-Id", "Message-ID") ??
    readRecordString(headersFromMessageJson, "message-id", "Message-Id", "Message-ID") ??
    null;

  return {
    eventType: normalizedEventType,
    email,
    messageId,
  };
};

const verifyStripeSignature = (rawBody: string, signature: string, secret: string) => {
  const elements = signature.split(",").reduce<Record<string, string[]>>((acc, item) => {
    const [key, value] = item.split("=");
    if (!key || !value) return acc;
    acc[key] = acc[key] ? [...acc[key], value] : [value];
    return acc;
  }, {});

  const timestamp = elements["t"]?.[0];
  const signatures = elements["v1"] ?? [];
  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");

  const isValid = signatures.some((sig) => timingSafeEqual(sig, expected));
  if (!isValid) {
    return false;
  }

  const toleranceSeconds = 10 * 60;
  const now = Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > toleranceSeconds) {
    return false;
  }

  return true;
};

const verifyFlutterwaveSignature = (rawBody: string, headers: Record<string, string | string[] | undefined>, secret: string) => {
  const hashHeader = headers["verif-hash"];
  if (hashHeader) {
    const hash = Array.isArray(hashHeader) ? hashHeader[0] : hashHeader;
    return timingSafeEqual(hash ?? "", secret);
  }

  const signatureHeader = headers["flutterwave-signature"];
  if (signatureHeader) {
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    return timingSafeEqual(signature ?? "", expected);
  }

  return false;
};

const verifyPaystackSignature = (rawBody: string, signature: string, secret: string) => {
  const expected = crypto.createHmac("sha512", secret).update(rawBody, "utf8").digest("hex");
  return timingSafeEqual(signature, expected);
};

const markOrderRefunded = async (params: {
  orderId?: string | null;
  refundReference?: string | null;
  provider: PaymentProvider;
  payload: Prisma.JsonValue;
}) => {
  let order = null;

  if (params.orderId) {
    order = await prisma.order.findUnique({
      where: { id: params.orderId },
      include: { service: true },
    });
  }

  if (!order && params.refundReference) {
    order = await prisma.order.findFirst({
      where: { refundReference: params.refundReference },
      include: { service: true },
    });
  }

  if (!order) {
    return null;
  }

  if (order.status === "refunded") {
    return order;
  }

  if (!["refund_pending", "cancelled"].includes(order.status)) {
    return order;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedOrder = await tx.order.update({
      where: { id: order!.id },
      data: {
        status: "refunded",
        refundCompletedAt: new Date(),
        refundProvider: params.provider,
        refundReference: params.refundReference ?? order!.refundReference ?? undefined,
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId: order!.id,
        type: "refunded",
        payload: {
          provider: params.provider,
          refundReference: params.refundReference ?? null,
          webhook: true,
        },
      },
    });

    return updatedOrder;
  });

  const serviceTitle = order.service?.title ?? "service";
  await createNotification({
    userId: order.buyerId,
    actorId: order.providerId,
    type: "order_status",
    title: "Refund completed",
    body: `Your payment for ${serviceTitle} has been refunded.`,
    data: { orderId: order.id, serviceId: order.serviceId },
  });

  return updated;
};

const markPayoutRequest = async (params: {
  pspTransferRef?: string | null;
  reference?: string | null;
  status: "paid" | "failed";
  payload: Prisma.JsonValue;
}) => {
  const pspTransferRef = params.pspTransferRef?.trim() || null;
  const reference = params.reference?.trim() || null;
  if (!pspTransferRef && !reference) {
    return null;
  }

  const request = await prisma.payoutRequest.findFirst({
    where: {
      OR: [
        ...(pspTransferRef
          ? [{ pspTransferRef }, { reference: pspTransferRef }]
          : []),
        ...(reference
          ? [{ pspTransferRef: reference }, { reference }]
          : []),
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  if (!request) {
    return null;
  }

  if (["paid", "failed", "cancelled"].includes(request.status)) {
    return request;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const trackingRef =
      pspTransferRef ?? request.pspTransferRef ?? reference ?? request.reference ?? request.id;
    const wallet = await tx.providerWallet.upsert({
      where: { providerId: request.providerId },
      create: {
        providerId: request.providerId,
        availableBalance: new Prisma.Decimal(0),
        pendingBalance: new Prisma.Decimal(0),
        currency: request.currency,
      },
      update: {},
    });

    if (params.status === "paid") {
      const pendingAfter = wallet.pendingBalance.sub(request.amount);
      await tx.providerWallet.update({
        where: { providerId: request.providerId },
        data: {
          pendingBalance: pendingAfter.gte(0) ? pendingAfter : new Prisma.Decimal(0),
        },
      });

      if (request.orderId) {
        await tx.earningsLedger.updateMany({
          where: { orderId: request.orderId, providerId: request.providerId },
          data: {
            state: "disbursed",
            disbursedAt: new Date(),
            pspPayoutRef: trackingRef,
          },
        });
      }
    }

    if (params.status === "failed") {
      const pendingAfter = wallet.pendingBalance.sub(request.amount);
      await tx.providerWallet.update({
        where: { providerId: request.providerId },
        data: {
          availableBalance: { increment: request.amount },
          pendingBalance: pendingAfter.gte(0) ? pendingAfter : new Prisma.Decimal(0),
        },
      });

      if (request.orderId) {
        await tx.earningsLedger.updateMany({
          where: { orderId: request.orderId, providerId: request.providerId },
          data: {
            state: "payable",
            reservedAt: null,
            disbursedAt: null,
            pspPayoutRef: null,
          },
        });
      }
    }

    if (params.status === "paid") {
      await allocateDisbursementToOrders(tx, {
        providerId: request.providerId,
        orderId: request.orderId ?? undefined,
        amount: request.amount,
        currency: request.currency,
        reference: trackingRef,
      });
    }

    const previousMetadata =
      request.metadata && typeof request.metadata === "object"
        ? (request.metadata as Record<string, unknown>)
        : {};
    const metadata =
      params.payload === null
        ? Prisma.JsonNull
        : ({
            ...previousMetadata,
            webhook: params.payload,
            trackingRef,
          } as Prisma.InputJsonValue);

    return tx.payoutRequest.update({
      where: { id: request.id },
      data: {
        status: params.status,
        reference: request.reference ?? reference ?? trackingRef,
        pspTransferRef: trackingRef,
        metadata,
      },
    });
  });

  if (params.status === "paid") {
    await createNotification({
      userId: request.providerId,
      actorId: null,
      type: "payout_update",
      title: "Disbursement completed",
      body: `Your disbursement of ${request.currency} ${request.amount.toFixed(2)} is completed.`,
      data: { payoutRequestId: request.id },
    });
  } else {
    await createNotification({
      userId: request.providerId,
      actorId: null,
      type: "payout_update",
      title: "Disbursement failed",
      body: "Your disbursement could not be completed. Funds have been returned to your payable amount.",
      data: { payoutRequestId: request.id },
    });
  }

  return updated;
};

webhooksRouter.post(
  "/email/inbound",
  emailInboundFormDataParser,
  asyncHandler(async (req, res) => {
    const { settings } = await getPlatformSettings();
    const secret = resolveEmailWebhookSecret(settings);
    const provider = resolveEmailWebhookProvider(settings);

    if (!secret) {
      return res.status(400).json({ error: "Email webhook secret not configured." });
    }

    const payload = asRecord(req.body) ?? {};
    if (!hasValidEmailWebhookAuth({ req, provider, payload, secret })) {
      return res.status(401).json({ error: "Invalid email webhook token." });
    }

    const inboundEmail = parseInboundEmailPayload(payload);
    const senderEmail = inboundEmail.senderEmail;

    if (!senderEmail) {
      await createEmailAuditLog({
        action: "email_inbound_ignored",
        entityId: "missing-sender",
        payload: {
          reason: "missing_sender",
          provider,
          payload,
        },
      });
      return res.json({ received: true, ignored: "missing_sender" });
    }

    const messageBody = inboundEmail.messageBody;

    if (!messageBody || messageBody.length < 2) {
      await createEmailAuditLog({
        action: "email_inbound_ignored",
        entityId: senderEmail,
        payload: {
          reason: "missing_message_body",
          provider,
          senderEmail,
          payload,
        },
      });
      return res.json({ received: true, ignored: "missing_message_body" });
    }

    const sender = await prisma.user.findFirst({
      where: {
        email: { equals: senderEmail, mode: "insensitive" },
        status: "active",
      },
      select: { id: true, role: true },
    });

    if (!sender) {
      await createEmailAuditLog({
        action: "email_inbound_ignored",
        entityId: senderEmail,
        payload: {
          reason: "sender_not_found",
          provider,
          senderEmail,
          payload,
        },
      });
      return res.json({ received: true, ignored: "sender_not_found" });
    }

    const subject = inboundEmail.subject;
    const ticketNumber = extractTicketNumber(inboundEmail.mailboxHint, subject, messageBody);
    const messageId = inboundEmail.messageId;

    if (ticketNumber) {
      const ticket = await prisma.supportTicket.findUnique({
        where: { ticketNumber },
        select: {
          id: true,
          ticketNumber: true,
          userId: true,
          status: true,
        },
      });

      if (ticket) {
        if (ticket.userId !== sender.id) {
          await createEmailAuditLog({
            action: "email_inbound_ignored",
            entityId: messageId ?? `${senderEmail}-${ticket.id}`,
            payload: {
              reason: "sender_ticket_mismatch",
              provider,
              senderId: sender.id,
              senderEmail,
              ticketId: ticket.id,
              ticketNumber: ticket.ticketNumber,
            },
          });
          return res.json({ received: true, ignored: "sender_ticket_mismatch" });
        }

        if (ticket.status === "closed") {
          await createEmailAuditLog({
            action: "email_inbound_ignored",
            entityId: messageId ?? `${senderEmail}-${ticket.id}`,
            payload: {
              reason: "ticket_closed",
              provider,
              senderId: sender.id,
              senderEmail,
              ticketId: ticket.id,
              ticketNumber: ticket.ticketNumber,
            },
          });
          return res.json({ received: true, ignored: "ticket_closed" });
        }

        const now = new Date();
        const nextStatus = ticket.status === "resolved" ? "open" : ticket.status;

        await prisma.$transaction([
          prisma.supportTicketMessage.create({
            data: {
              ticketId: ticket.id,
              senderId: sender.id,
              senderRole: sender.role,
              body: messageBody,
              isInternal: false,
            },
          }),
          prisma.supportTicket.update({
            where: { id: ticket.id },
            data: {
              status: nextStatus,
              lastMessageAt: now,
            },
          }),
        ]);

        await createEmailAuditLog({
          action: "email_inbound_linked",
          entityId: messageId ?? `${senderEmail}-${ticket.id}`,
          payload: {
            provider,
            senderId: sender.id,
            senderEmail,
            ticketId: ticket.id,
            ticketNumber: ticket.ticketNumber,
            nextStatus,
            messageId,
          },
        });

        return res.json({ received: true, created: false, ticketId: ticket.id });
      }
    }

    const now = new Date();
    const createdTicket = await prisma.supportTicket.create({
      data: {
        userId: sender.id,
        subject: subject.slice(0, MAX_EMAIL_SUBJECT_LENGTH),
        category: "email",
        status: "open",
        lastMessageAt: now,
        messages: {
          create: {
            senderId: sender.id,
            senderRole: sender.role,
            body: messageBody,
            isInternal: false,
          },
        },
      },
      select: {
        id: true,
        ticketNumber: true,
      },
    });

    await createSupportTicketEvent({
      ticketId: createdTicket.id,
      actorId: sender.id,
      type: "created",
      data: {
        source: "email_inbound",
        provider,
        subject: subject.slice(0, MAX_EMAIL_SUBJECT_LENGTH),
      },
    });

    await createEmailAuditLog({
      action: "email_inbound_ticket_created",
      entityId: messageId ?? `${senderEmail}-${createdTicket.id}`,
      payload: {
        provider,
        senderId: sender.id,
        senderEmail,
        ticketId: createdTicket.id,
        ticketNumber: createdTicket.ticketNumber,
        messageId,
      },
    });

    return res.status(201).json({
      received: true,
      created: true,
      ticketId: createdTicket.id,
      ticketNumber: createdTicket.ticketNumber,
    });
  }),
);

webhooksRouter.post(
  "/email/events",
  asyncHandler(async (req, res) => {
    const { settings } = await getPlatformSettings();
    const secret = resolveEmailWebhookSecret(settings);
    const provider = resolveEmailWebhookProvider(settings);

    if (!secret) {
      return res.status(400).json({ error: "Email webhook secret not configured." });
    }

    const payload = asRecord(req.body) ?? {};
    if (!hasValidEmailWebhookAuth({ req, provider, payload, secret })) {
      return res.status(401).json({ error: "Invalid email webhook token." });
    }

    const records = extractEmailEventRecords(req.body);

    if (records.length === 0) {
      return res.json({ received: true, count: 0 });
    }

    const severeEventTypes = new Set([
      "bounce",
      "dropped",
      "failed",
      "complained",
      "spamcomplaint",
      "spam_complaint",
      "spamreport",
      "spam_report",
      "unsubscribe",
    ]);
    let severeEvents = 0;

    for (const eventRecord of records) {
      const parsedEvent = parseEmailEvent(eventRecord);
      const normalizedEventType = parsedEvent.eventType;

      if (severeEventTypes.has(normalizedEventType)) {
        severeEvents += 1;
      }

      const email = parsedEvent.email;
      const messageId = parsedEvent.messageId;
      const entityId =
        messageId ?? email ?? `email-event-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

      const relatedUser = email
        ? await prisma.user.findFirst({
            where: { email: { equals: email, mode: "insensitive" } },
            select: { id: true, status: true },
          })
        : null;

      await createEmailAuditLog({
        action: "email_event_received",
        entityId,
        payload: {
          provider,
          eventType: normalizedEventType,
          email,
          messageId,
          relatedUserId: relatedUser?.id ?? null,
          relatedUserStatus: relatedUser?.status ?? null,
          payload: eventRecord,
        },
      });
    }

    return res.json({
      received: true,
      count: records.length,
      severeEvents,
    });
  }),
);

webhooksRouter.post(
  "/stripe",
  asyncHandler(async (req, res) => {
    const { settings } = await getPlatformSettings();
    const stripeSecret =
      settings.integrations.webhooks.stripeWebhookSecret || env.STRIPE_WEBHOOK_SECRET;
    if (!stripeSecret) {
      return res.status(400).json({ error: "Stripe webhook secret not configured." });
    }

    const signature = req.headers["stripe-signature"];
    if (!signature || typeof signature !== "string") {
      return res.status(400).json({ error: "Missing Stripe signature." });
    }

    const rawBody = req.rawBody?.toString("utf8") ?? "";
    if (!rawBody) {
      return res.status(400).json({ error: "Missing webhook payload." });
    }

    const isValid = verifyStripeSignature(rawBody, signature, stripeSecret);
    if (!isValid) {
      return res.status(400).json({ error: "Invalid Stripe signature." });
    }

    const event = req.body as {
      type?: string;
      data?: { object?: Record<string, unknown> };
    };

    const type = event.type ?? "";
    const data = event.data?.object ?? {};

    if (type === "refund.succeeded" || type === "refund.updated") {
      const status = String(data["status"] ?? "").toLowerCase();
      if (status === "succeeded") {
        const refundId = data["id"] ? String(data["id"]) : undefined;
        const metadata = data["metadata"] as Record<string, string> | undefined;
        const orderId = metadata?.orderId;

        await markOrderRefunded({
          orderId,
          refundReference: refundId,
          provider: "stripe",
          payload: event as Prisma.JsonValue,
        });
      }
    }

    res.json({ received: true });
  }),
);

webhooksRouter.post(
  "/flutterwave",
  asyncHandler(async (req, res) => {
    const { settings } = await getPlatformSettings();
    const flutterwaveHash =
      settings.integrations.webhooks.flutterwaveWebhookHash || env.FLUTTERWAVE_WEBHOOK_HASH;
    if (!flutterwaveHash) {
      return res.status(400).json({ error: "Flutterwave webhook hash not configured." });
    }

    const rawBody = req.rawBody?.toString("utf8") ?? "";
    if (!rawBody) {
      return res.status(400).json({ error: "Missing webhook payload." });
    }

    const isValid = verifyFlutterwaveSignature(rawBody, req.headers, flutterwaveHash);
    if (!isValid) {
      return res.status(400).json({ error: "Invalid Flutterwave signature." });
    }

    const payload = req.body as {
      event?: string;
      type?: string;
      data?: Record<string, unknown>;
    };

    const eventName = String(payload.event ?? payload.type ?? "").toLowerCase();
    if (eventName.includes("transfer")) {
      const data = payload.data ?? {};
      const status = String(data["status"] ?? "").toLowerCase();
      const referenceValue = data["reference"] ?? data["transfer_reference"];
      const reference = referenceValue ? String(referenceValue) : undefined;
      const pspTransferRefValue = data["id"] ?? data["transfer_id"] ?? data["transferId"];
      const pspTransferRef = pspTransferRefValue ? String(pspTransferRefValue) : undefined;
      const isSuccess = ["successful", "success", "completed"].includes(status);
      const isFailed = ["failed", "cancelled", "canceled"].includes(status);

      if (isSuccess || isFailed) {
        await markPayoutRequest({
          pspTransferRef,
          reference,
          status: isSuccess ? "paid" : "failed",
          payload: payload as Prisma.JsonValue,
        });
      }

      return res.json({ received: true });
    }

    if (!eventName.includes("refund")) {
      return res.json({ received: true });
    }

    const data = payload.data ?? {};
    const status = String(data["status"] ?? data["refund_status"] ?? "").toLowerCase();
    const isCompleted = ["completed", "successful", "success", "succeeded"].includes(status);

    if (!isCompleted) {
      return res.json({ received: true });
    }

    const refundId =
      data["id"] ??
      data["refund_id"] ??
      data["refundId"];
    const refundReference = refundId ? String(refundId) : undefined;
    const meta = (data["meta"] as Record<string, unknown> | undefined) ?? {};
    const orderIdValue =
      meta["orderId"] ??
      meta["order_id"] ??
      meta["orderID"];
    const orderId = orderIdValue ? String(orderIdValue) : undefined;

    await markOrderRefunded({
      orderId,
      refundReference,
      provider: "flutterwave",
      payload: payload as Prisma.JsonValue,
    });

    res.json({ received: true });
  }),
);

webhooksRouter.post(
  "/paystack",
  asyncHandler(async (req, res) => {
    const { settings } = await getPlatformSettings();
    const paystackSecret =
      settings.integrations.payments.paystackSecretKey || env.PAYSTACK_SECRET_KEY;
    if (!paystackSecret) {
      return res.status(400).json({ error: "Paystack is not configured." });
    }

    const signature = req.headers["x-paystack-signature"];
    if (!signature || typeof signature !== "string") {
      return res.status(400).json({ error: "Missing Paystack signature." });
    }

    const rawBody = req.rawBody?.toString("utf8") ?? "";
    if (!rawBody) {
      return res.status(400).json({ error: "Missing webhook payload." });
    }

    const isValid = verifyPaystackSignature(rawBody, signature, paystackSecret);
    if (!isValid) {
      return res.status(400).json({ error: "Invalid Paystack signature." });
    }

    const payload = req.body as {
      event?: string;
      data?: Record<string, unknown>;
    };

    const eventName = String(payload.event ?? "").toLowerCase();
    if (eventName.includes("transfer")) {
      const data = payload.data ?? {};
      const transferStatus = String(data["status"] ?? "").toLowerCase();
      const transferCode = data["transfer_code"] ?? data["id"];
      const transferRef = transferCode ? String(transferCode) : undefined;
      const reference = data["reference"] ? String(data["reference"]) : undefined;
      const isSuccess =
        eventName.includes("success") ||
        ["success", "successful", "completed", "paid"].includes(transferStatus);
      const isFailed =
        eventName.includes("failed") ||
        eventName.includes("reversed") ||
        ["failed", "reversed", "rejected", "cancelled", "canceled"].includes(transferStatus);

      if (isSuccess || isFailed) {
        await markPayoutRequest({
          pspTransferRef: transferRef,
          reference,
          status: isSuccess ? "paid" : "failed",
          payload: payload as Prisma.JsonValue,
        });
      }

      return res.json({ received: true });
    }

    if (!eventName.includes("refund")) {
      return res.json({ received: true });
    }

    const data = payload.data ?? {};
    const status = String(data["status"] ?? data["refund_status"] ?? "").toLowerCase();
    const isCompleted = ["processed", "success", "succeeded", "completed"].includes(status);

    if (!isCompleted) {
      return res.json({ received: true });
    }

    const refundId =
      data["id"] ??
      data["refund_id"] ??
      data["refundId"];
    const refundReference = refundId ? String(refundId) : undefined;

    await markOrderRefunded({
      refundReference,
      provider: "paystack",
      payload: payload as Prisma.JsonValue,
    });

    res.json({ received: true });
  }),
);

webhooksRouter.post(
  "/hubtel",
  asyncHandler(async (req, res) => {
    const payload = req.body as {
      responseCode?: string;
      ResponseCode?: string;
      message?: string;
      Message?: string;
      data?: Record<string, unknown>;
      Data?: Record<string, unknown>;
    };

    const data = payload.data ?? payload.Data ?? {};
    const clientReference =
      (data["clientReference"] ?? data["ClientReference"])?.toString() ??
      (payload as Record<string, unknown>)["clientReference"]?.toString() ??
      (payload as Record<string, unknown>)["ClientReference"]?.toString();

    if (!clientReference) {
      return res.status(400).json({ error: "Missing Hubtel client reference." });
    }

    const paymentIntent = await prisma.paymentIntent.findUnique({
      where: { id: clientReference },
    });

    if (!paymentIntent) {
      return res.status(404).json({ error: "Payment intent not found." });
    }

    if (paymentIntent.provider !== "hubtel") {
      return res.status(400).json({ error: "Invalid payment provider." });
    }

    const responseCode = String(
      payload.responseCode ?? payload.ResponseCode ?? "",
    );
    const status = String(data["status"] ?? data["Status"] ?? "").toLowerCase();

    const successCodes = new Set(["0000", "00", "200", "0"]);
    const successStatuses = new Set(["paid", "success", "successful", "completed"]);
    const failureStatuses = new Set(["failed", "cancelled", "canceled", "declined"]);

    const isSuccess = successCodes.has(responseCode) || successStatuses.has(status);
    const isFailure = failureStatuses.has(status);

    if (isFailure && paymentIntent.status !== "succeeded") {
      await prisma.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: {
          status: "failed",
          metadata:
            payload === null ? Prisma.JsonNull : (payload as Prisma.InputJsonValue),
        },
      });
      return res.json({ received: true });
    }

    if (!isSuccess) {
      return res.json({ received: true });
    }

    if (paymentIntent.status === "succeeded") {
      return res.json({ received: true });
    }

    const amountValue = data["amount"] ?? data["Amount"];
    if (amountValue !== undefined && amountValue !== null) {
      const amount = new Prisma.Decimal(String(amountValue));
      if (amount.lessThan(paymentIntent.amount)) {
        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: {
            status: "failed",
            metadata:
              payload === null ? Prisma.JsonNull : (payload as Prisma.InputJsonValue),
          },
        });
        return res.status(400).json({ error: "Amount mismatch." });
      }
    }

    const paylinkId =
      (data["paylinkId"] ?? data["PaylinkId"])?.toString() ??
      (data["transactionId"] ?? data["TransactionId"])?.toString() ??
      clientReference;

    if (!paymentIntent.providerRef && paylinkId) {
      await prisma.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: { providerRef: paylinkId },
      });
    }

    const metadata =
      paymentIntent.metadata && typeof paymentIntent.metadata === "object"
        ? (paymentIntent.metadata as Record<string, unknown>)
        : {};
    const actorId =
      (metadata["buyerId"] as string | undefined) ??
      (metadata["providerId"] as string | undefined) ??
      (metadata["payerId"] as string | undefined) ??
      null;

    const { settings } = await getPlatformSettings();
    await finalizePayment({
      paymentIntentId: paymentIntent.id,
      providerEventId: paylinkId ?? paymentIntent.id,
      providerPayload:
        payload === null ? Prisma.JsonNull : (payload as Prisma.InputJsonValue),
      actorId,
      settings,
    });

    res.json({ received: true });
  }),
);

webhooksRouter.post(
  "/expresspay",
  asyncHandler(async (req, res) => {
    const payload = req.body as Record<string, unknown>;
    const token =
      payload["token"]?.toString() ?? payload["Token"]?.toString();
    const orderId =
      payload["order-id"]?.toString() ??
      payload["order_id"]?.toString() ??
      payload["orderId"]?.toString() ??
      payload["OrderId"]?.toString();

    if (!token && !orderId) {
      return res.status(400).json({ error: "Missing ExpressPay reference." });
    }

    let paymentIntent =
      orderId
        ? await prisma.paymentIntent.findUnique({ where: { id: orderId } })
        : null;

    if (!paymentIntent && token) {
      paymentIntent = await prisma.paymentIntent.findFirst({
        where: { provider: "expresspay", providerRef: token },
      });
    }

    if (!paymentIntent) {
      return res.status(404).json({ error: "Payment intent not found." });
    }

    if (paymentIntent.provider !== "expresspay") {
      return res.status(400).json({ error: "Invalid payment provider." });
    }

    const { settings } = await getPlatformSettings();
    const expresspayConfig = resolveExpresspayConfig(settings);
    if (!expresspayConfig) {
      return res.status(400).json({ error: "ExpressPay is not configured." });
    }

    const verifyToken = token ?? paymentIntent.providerRef ?? "";
    if (!verifyToken) {
      return res.status(400).json({ error: "Missing ExpressPay token." });
    }

    const { ok, payload: verifyPayload } = await queryExpresspayPayment(
      expresspayConfig,
      verifyToken,
    );
    const resultCode =
      verifyPayload.result !== undefined ? String(verifyPayload.result) : "";

    if (!ok || !resultCode) {
      if (paymentIntent.status !== "succeeded") {
        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: {
            status: "failed",
            metadata:
              verifyPayload === null
                ? Prisma.JsonNull
                : (verifyPayload as Prisma.InputJsonValue),
          },
        });
      }
      return res
        .status(400)
        .json({ error: "Unable to verify ExpressPay payment." });
    }

    if (resultCode === "4") {
      return res.json({ received: true });
    }

    if (resultCode !== "1") {
      if (paymentIntent.status !== "succeeded") {
        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: {
            status: "failed",
            metadata:
              verifyPayload === null
                ? Prisma.JsonNull
                : (verifyPayload as Prisma.InputJsonValue),
          },
        });
      }
      return res.json({ received: true });
    }

    if (
      verifyPayload.currency &&
      verifyPayload.currency.toString().toUpperCase() !== paymentIntent.currency
    ) {
      await prisma.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: {
          status: "failed",
          metadata:
            verifyPayload === null
              ? Prisma.JsonNull
              : (verifyPayload as Prisma.InputJsonValue),
        },
      });
      return res.status(400).json({ error: "Currency mismatch." });
    }

    if (verifyPayload.amount !== undefined) {
      const amount = new Prisma.Decimal(String(verifyPayload.amount));
      if (amount.lessThan(paymentIntent.amount)) {
        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: {
            status: "failed",
            metadata:
              verifyPayload === null
                ? Prisma.JsonNull
                : (verifyPayload as Prisma.InputJsonValue),
          },
        });
        return res.status(400).json({ error: "Amount mismatch." });
      }
    }

    if (!paymentIntent.providerRef && token) {
      await prisma.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: { providerRef: token },
      });
    }

    if (paymentIntent.status === "succeeded") {
      return res.json({ received: true });
    }

    const metadata =
      paymentIntent.metadata && typeof paymentIntent.metadata === "object"
        ? (paymentIntent.metadata as Record<string, unknown>)
        : {};
    const actorId =
      (metadata["buyerId"] as string | undefined) ??
      (metadata["providerId"] as string | undefined) ??
      (metadata["payerId"] as string | undefined) ??
      null;

    const providerEventId =
      verifyPayload["transaction-id"]?.toString() ?? verifyToken ?? paymentIntent.id;

    await finalizePayment({
      paymentIntentId: paymentIntent.id,
      providerEventId,
      providerPayload:
        verifyPayload === null
          ? Prisma.JsonNull
          : (verifyPayload as Prisma.InputJsonValue),
      actorId,
      settings,
    });

    res.json({ received: true });
  }),
);
