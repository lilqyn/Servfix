export type CheckoutProvider =
  | "flutterwave"
  | "stripe"
  | "paystack"
  | "hubtel"
  | "expresspay";

export type CurrencyCode = "GHS" | "USD" | "EUR";

const GHS_ONLY_PROVIDER_NAMES: Partial<Record<CheckoutProvider, string>> = {
  hubtel: "Hubtel",
  expresspay: "ExpressPay",
};

export const getProviderCurrencyError = (
  provider: CheckoutProvider,
  currency: CurrencyCode,
) => {
  const providerName = GHS_ONLY_PROVIDER_NAMES[provider];
  if (providerName && currency !== "GHS") {
    return `${providerName} supports GHS only.`;
  }
  return null;
};
