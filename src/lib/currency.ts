export type CurrencyCode = "GHS" | "USD" | "EUR";

export const CURRENCY_OPTIONS: Array<{ value: CurrencyCode; label: string }> = [
  { value: "GHS", label: "GHS (Ghana cedi)" },
  { value: "USD", label: "USD (US dollar)" },
  { value: "EUR", label: "EUR (Euro)" },
];

const DEFAULT_LOCALE_BY_CURRENCY: Record<CurrencyCode, string> = {
  GHS: "en-GH",
  USD: "en-US",
  EUR: "en-IE",
};

type FormatCurrencyOptions = {
  locale?: string;
  currencyDisplay?: "symbol" | "narrowSymbol" | "code" | "name";
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

export const formatCurrencyAmount = (
  amount: number,
  currency: CurrencyCode,
  options: FormatCurrencyOptions = {},
) => {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const locale = options.locale ?? DEFAULT_LOCALE_BY_CURRENCY[currency];

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: options.currencyDisplay ?? "code",
    minimumFractionDigits: options.minimumFractionDigits,
    maximumFractionDigits: options.maximumFractionDigits,
  }).format(safeAmount);
};
