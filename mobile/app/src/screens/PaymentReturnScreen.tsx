import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { verifyPayment } from "../lib/api";
import { useAuth } from "../providers/AuthProvider";
import { useTheme } from "../providers/ThemeProvider";
import { createThemedStyles } from "../theme";
import type { CheckoutProvider, PaymentReturnParams, PaymentVerifyResponse } from "../types";

type Props = {
  params?: PaymentReturnParams;
  onOpenHome: () => void;
  onOpenOrders: (options?: { forceRefresh?: boolean }) => void;
  onOpenSignIn: () => void;
};

type ScreenStatus = "loading" | "success" | "pending" | "error";
type PaymentPurpose = "orders" | "boost" | "subscription" | "invoice" | "order_payment";
type ResolvedVerifyInput =
  | {
      ok: true;
      input: {
        provider: CheckoutProvider;
        paymentIntentId?: string;
        transactionId?: string;
        txRef?: string;
        sessionId?: string;
        reference?: string;
        token?: string;
        orderId?: string;
      };
    }
  | { ok: false; error: string };

const isProvider = (value: string | undefined): value is CheckoutProvider =>
  value === "flutterwave" ||
  value === "stripe" ||
  value === "paystack" ||
  value === "hubtel" ||
  value === "expresspay";

const parsePurpose = (value: string | undefined): PaymentPurpose =>
  value === "boost" ||
  value === "subscription" ||
  value === "invoice" ||
  value === "order_payment"
    ? value
    : "orders";

const isPendingError = (message: string) => /pending|processing|still due/i.test(message);
const MAX_AUTO_RETRIES = 3;
const AUTO_RETRY_DELAY_MS = 4000;

function resolveInput(params: PaymentReturnParams | undefined) {
  const provider = params?.provider;
  if (!isProvider(provider)) {
    return { ok: false, error: "Missing or invalid payment provider in return URL." } satisfies ResolvedVerifyInput;
  }

  const transactionId = params?.transaction_id;
  const txRef = params?.tx_ref;
  const sessionId = params?.session_id;
  const paymentIntentId = params?.payment_intent_id;
  const reference = params?.reference ?? params?.trxref ?? (provider === "hubtel" ? txRef : undefined);
  const token = params?.token ?? params?.reference;
  const orderId = params?.order_id ?? params?.["order-id"] ?? params?.tx_ref;

  if (provider === "flutterwave" && !paymentIntentId && (!transactionId || !txRef)) {
    return {
      ok: false,
      error: "Flutterwave return is missing transaction details. Re-open checkout confirmation.",
    } satisfies ResolvedVerifyInput;
  }
  if (provider === "paystack" && !paymentIntentId && !reference) {
    return { ok: false, error: "Paystack return is missing a reference." } satisfies ResolvedVerifyInput;
  }
  if (provider === "stripe" && !paymentIntentId && !sessionId) {
    return { ok: false, error: "Stripe return is missing a session id." } satisfies ResolvedVerifyInput;
  }
  if (provider === "hubtel" && !paymentIntentId && !reference) {
    return {
      ok: false,
      error: "Hubtel return is missing a payment reference.",
    } satisfies ResolvedVerifyInput;
  }
  if (provider === "expresspay" && !paymentIntentId && !token && !orderId) {
    return {
      ok: false,
      error: "ExpressPay return is missing token details.",
    } satisfies ResolvedVerifyInput;
  }

  return {
    ok: true,
    input: {
      provider,
      paymentIntentId,
      transactionId,
      txRef,
      sessionId,
      reference,
      token,
      orderId,
    },
  } satisfies ResolvedVerifyInput;
}

function describeSuccess(result: PaymentVerifyResponse, purpose: PaymentPurpose) {
  if (purpose === "boost") {
    return "Boost payment confirmed.";
  }
  if (purpose === "subscription") {
    return "Subscription payment confirmed.";
  }
  if (purpose === "invoice") {
    return "Invoice payment confirmed.";
  }
  if (purpose === "order_payment") {
    return "Order stage payment confirmed.";
  }
  const count = result.orders?.length ?? 0;
  if (count > 0) {
    return `Payment confirmed. ${count} ${count === 1 ? "order is" : "orders are"} now protected.`;
  }
  return "Payment confirmed.";
}

export function PaymentReturnScreen({ params, onOpenHome, onOpenOrders, onOpenSignIn }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const { user } = useAuth();
  const [status, setStatus] = useState<ScreenStatus>("loading");
  const [message, setMessage] = useState("Verifying your payment...");
  const [purpose, setPurpose] = useState<PaymentPurpose>(parsePurpose(params?.purpose));
  const [retryIndex, setRetryIndex] = useState(0);
  const [autoRetryCount, setAutoRetryCount] = useState(0);
  const paramsKey = useMemo(() => JSON.stringify(params ?? {}), [params]);

  useEffect(() => {
    setAutoRetryCount(0);
  }, [paramsKey, user?.id]);

  useEffect(() => {
    let cancelled = false;
    const requestedPurpose = parsePurpose(params?.purpose);
    const resolved = resolveInput(params);
    const isCancelled = params?.status === "cancelled" || params?.payment === "cancelled";

    const run = async () => {
      setPurpose(requestedPurpose);

      if (isCancelled) {
        setStatus("error");
        setMessage("Payment was cancelled before completion.");
        return;
      }

      if (!user) {
        setStatus("error");
        setMessage("Sign in first to verify your payment and load order status.");
        return;
      }

      if (!resolved.ok) {
        setStatus("error");
        setMessage(resolved.error);
        return;
      }

      setStatus("loading");
      setMessage("Verifying your payment...");

      try {
        const result = await verifyPayment(resolved.input);
        if (cancelled) {
          return;
        }

        const resolvedPurpose = (result.purpose as PaymentPurpose | undefined) ?? requestedPurpose;
        setPurpose(resolvedPurpose);
        setStatus("success");
        setMessage(describeSuccess(result, resolvedPurpose));
      } catch (error) {
        if (cancelled) {
          return;
        }
        const nextMessage =
          error instanceof Error ? error.message : "Unable to verify payment. Please retry.";
        setStatus(isPendingError(nextMessage) ? "pending" : "error");
        setMessage(nextMessage);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [paramsKey, params, retryIndex, user]);

  useEffect(() => {
    if (status !== "pending" || !user) {
      return;
    }
    if (autoRetryCount >= MAX_AUTO_RETRIES) {
      return;
    }

    const timer = setTimeout(() => {
      setAutoRetryCount((value) => value + 1);
      setRetryIndex((value) => value + 1);
    }, AUTO_RETRY_DELAY_MS);

    return () => clearTimeout(timer);
  }, [autoRetryCount, status, user]);

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>PAYMENT RETURN</Text>
        <Text style={styles.title}>
          {status === "loading"
            ? "Checking payment"
            : status === "success"
              ? "Payment confirmed"
              : status === "pending"
                ? "Payment still pending"
                : "Payment verification issue"}
        </Text>
        <Text style={styles.body}>{message}</Text>

        {status === "loading" ? (
          <ActivityIndicator color={palette.accent} size="large" />
        ) : null}

        <View style={styles.actionRow}>
          {user ? (
            <>
              {status !== "success" ? (
                <Pressable
                  disabled={status === "loading"}
                  onPress={() => {
                    setAutoRetryCount(0);
                    setRetryIndex((value) => value + 1);
                  }}
                  style={[styles.primaryButton, status === "loading" && styles.buttonDisabled]}
                >
                  <Text style={styles.primaryButtonText}>Check again</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => onOpenOrders({ forceRefresh: purpose === "order_payment" })}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>View orders</Text>
                </Pressable>
              )}
              <Pressable onPress={onOpenHome} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Home</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={onOpenSignIn} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Sign in</Text>
            </Pressable>
          )}
        </View>

        {purpose !== "orders" ? (
          <Text style={styles.hintText}>Purpose: {purpose.replace(/_/g, " ")}</Text>
        ) : null}
        {status === "pending" ? (
          <Text style={styles.hintText}>
            {autoRetryCount < MAX_AUTO_RETRIES
              ? `Auto-checking again in ${AUTO_RETRY_DELAY_MS / 1000}s (${autoRetryCount + 1}/${MAX_AUTO_RETRIES})`
              : "Auto-check paused. Tap \"Check again\" to retry."}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((palette) => ({
  page: {
    alignItems: "center",
    backgroundColor: palette.canvas,
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    padding: 22,
    width: "100%",
  },
  eyebrow: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  title: {
    color: palette.ink,
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 30,
  },
  body: {
    color: palette.slate,
    fontSize: 14,
    lineHeight: 21,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: palette.accent,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 46,
    minWidth: 120,
    paddingHorizontal: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
    minWidth: 100,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "700",
  },
  hintText: {
    color: palette.slate,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
}));
