import { ServerClient } from "postmark";
import { getPlatformSettings } from "./platform-settings.js";

const DEFAULT_FROM_ADDRESS = "support@servfixgh.com";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

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

const extractEmailAddress = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const angleMatch = trimmed.match(/<([^>]+)>/);
  const candidate = (angleMatch?.[1] ?? trimmed).trim();
  return EMAIL_PATTERN.test(candidate) ? candidate : null;
};

const parseMailgunDomain = (fromAddress: string) => {
  const email = extractEmailAddress(fromAddress);
  if (!email) {
    return null;
  }

  const atIndex = email.lastIndexOf("@");
  if (atIndex < 0 || atIndex === email.length - 1) {
    return null;
  }

  return email.slice(atIndex + 1);
};

const sendViaSendgrid = async (params: SendEmailParams, fromAddress: string, apiKey: string) => {
  const content: Array<{ type: string; value: string }> = [
    { type: "text/plain", value: params.text },
  ];

  if (params.html?.trim()) {
    content.push({ type: "text/html", value: params.html });
  }

  const body: Record<string, unknown> = {
    personalizations: [
      {
        to: [{ email: params.to }],
        ...(params.metadata ? { custom_args: params.metadata } : {}),
      },
    ],
    from: { email: fromAddress },
    subject: params.subject,
    content,
    ...(params.tag ? { categories: [params.tag] } : {}),
  };

  if (params.replyTo) {
    body.reply_to = { email: params.replyTo };
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`SendGrid request failed (${response.status}): ${message}`);
  }
};

const sendViaMailgun = async (params: SendEmailParams, fromAddress: string, apiKey: string) => {
  const domain = parseMailgunDomain(fromAddress);
  if (!domain) {
    throw new Error("Mailgun requires a valid fromAddress domain.");
  }

  const form = new URLSearchParams();
  form.set("from", fromAddress);
  form.set("to", params.to);
  form.set("subject", params.subject);
  form.set("text", params.text);

  if (params.html?.trim()) {
    form.set("html", params.html);
  }

  if (params.replyTo) {
    form.set("h:Reply-To", params.replyTo);
  }

  if (params.tag) {
    form.append("o:tag", params.tag);
  }

  if (params.metadata) {
    for (const [key, value] of Object.entries(params.metadata)) {
      form.append(`v:${key}`, value);
    }
  }

  const authToken = Buffer.from(`api:${apiKey}`).toString("base64");
  const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Mailgun request failed (${response.status}): ${message}`);
  }
};

export const sendEmail = async (params: SendEmailParams): Promise<SendEmailResult> => {
  if (!params.to) {
    return { sent: false, reason: "missing_recipient" };
  }

  const { settings } = await getPlatformSettings();
  const integration = settings.integrations.email;

  if (integration.provider === "disabled") {
    return { sent: false, reason: "disabled" };
  }

  if (!["postmark", "sendgrid", "mailgun"].includes(integration.provider)) {
    return { sent: false, reason: "unsupported_provider" };
  }

  const apiKey = integration.apiKey?.trim();
  if (!apiKey) {
    return { sent: false, reason: "missing_api_key" };
  }

  const fromAddress = integration.fromAddress?.trim() || DEFAULT_FROM_ADDRESS;

  if (integration.provider === "postmark") {
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
  } else if (integration.provider === "sendgrid") {
    await sendViaSendgrid(params, fromAddress, apiKey);
  } else {
    await sendViaMailgun(params, fromAddress, apiKey);
  }

  return { sent: true };
};
