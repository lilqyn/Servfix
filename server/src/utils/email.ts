import { ServerClient } from "postmark";
import { getPlatformSettings } from "./platform-settings.js";

const DEFAULT_FROM_ADDRESS = "support@servfixgh.com";

export type SendEmailParams = {
  to: string;
  subject: string;
  text: string;
  html?: string | null;
  tag?: string;
  replyTo?: string;
  metadata?: Record<string, string>;
};

type SendEmailResult =
  | { sent: true }
  | { sent: false; reason: "disabled" | "unsupported_provider" | "missing_api_key" | "missing_recipient" };

export const sendEmail = async (params: SendEmailParams): Promise<SendEmailResult> => {
  if (!params.to) {
    return { sent: false, reason: "missing_recipient" };
  }

  const { settings } = await getPlatformSettings();
  const integration = settings.integrations.email;

  if (integration.provider === "disabled") {
    return { sent: false, reason: "disabled" };
  }

  if (integration.provider !== "postmark") {
    return { sent: false, reason: "unsupported_provider" };
  }

  const apiKey = integration.apiKey?.trim();
  if (!apiKey) {
    return { sent: false, reason: "missing_api_key" };
  }

  const fromAddress = integration.fromAddress?.trim() || DEFAULT_FROM_ADDRESS;
  const client = new ServerClient(apiKey);

  await client.sendEmail({
    From: fromAddress,
    To: params.to,
    Subject: params.subject,
    TextBody: params.text,
    ...(params.html ? { HtmlBody: params.html } : {}),
    ...(params.replyTo ? { ReplyTo: params.replyTo } : {}),
    ...(params.tag ? { Tag: params.tag } : {}),
    ...(params.metadata ? { Metadata: params.metadata } : {}),
  });

  return { sent: true };
};
