/**
 * Safely convert any value to a finite number, returning 0 for invalid inputs.
 */
export const toNumber = (value: string | number | null | undefined): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

/**
 * Format a numeric amount as currency.
 *
 * Uses a manual format (e.g. "GHS 1,200") instead of `Intl.NumberFormat` with
 * `style: "currency"` because Hermes (React Native) doesn't reliably support
 * the `currencyDisplay` option — causing crashes on production Android builds
 * while working fine in Expo Go.
 */
export const formatCurrency = (
  amount: string | number,
  currency = "GHS",
): string => {
  const val = toNumber(amount);
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "";

  // Build grouped integer string (e.g. 1,234,567)
  const intPart = Math.floor(abs);
  const grouped = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  // Include decimals only when there are meaningful cents
  const frac = abs - intPart;
  const decimals = frac > 0.004 ? `.${Math.round(frac * 100).toString().padStart(2, "0")}` : "";

  return `${sign}${currency} ${grouped}${decimals}`;
};
