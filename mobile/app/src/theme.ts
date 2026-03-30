import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useTheme } from "./providers/ThemeProvider";

// ─── Palette type ────────────────────────────────────────────────────────────

export type Palette = {
  ink: string;
  slate: string;
  line: string;
  mist: string;
  card: string;
  accent: string;
  accentDeep: string;
  accentSoft: string;
  gold: string;
  goldSoft: string;
  danger: string;
  dangerSoft: string;
  dangerLine: string;
  dangerInk: string;
  canvas: string;
  info: string;
  infoSoft: string;
  shadow: string;
  inputBg: string;
  isDark: boolean;
  warnSoft: string;
  warnInk: string;
};

// ─── Light palette ───────────────────────────────────────────────────────────

export const lightPalette: Palette = {
  ink: "#111111",
  slate: "#4b5563",
  line: "#dfe7df",
  mist: "#f3f8f3",
  card: "#ffffff",
  accent: "#15803d",
  accentDeep: "#166534",
  accentSoft: "#dcfce7",
  gold: "#ea580c",
  goldSoft: "#ffedd5",
  danger: "#e11d48",
  dangerSoft: "#fff1f2",
  dangerLine: "#fecdd3",
  dangerInk: "#7f1d1d",
  canvas: "#f8faf8",
  info: "#1d4ed8",
  infoSoft: "#dbeafe",
  shadow: "#000000",
  inputBg: "#f8fafc",
  isDark: false,
  warnSoft: "#fef3c7",
  warnInk: "#92400e",
};

// ─── Dark palette ────────────────────────────────────────────────────────────

export const darkPalette: Palette = {
  ink: "#f0f0f0",
  slate: "#9ca3af",
  line: "#2d3a2d",
  mist: "#1a231a",
  card: "#1e2a1e",
  accent: "#22c55e",
  accentDeep: "#4ade80",
  accentSoft: "#14532d",
  gold: "#fb923c",
  goldSoft: "#431407",
  danger: "#fb7185",
  dangerSoft: "#4c0519",
  dangerLine: "#9f1239",
  dangerInk: "#fda4af",
  canvas: "#111811",
  info: "#60a5fa",
  infoSoft: "#1e3a5f",
  shadow: "#000000",
  inputBg: "#162016",
  isDark: true,
  warnSoft: "#451a03",
  warnInk: "#fbbf24",
};

// ─── Backward-compatible static export (used until files are migrated) ──────

export const palette = lightPalette;

// ─── Themed StyleSheet helper ────────────────────────────────────────────────

type NamedStyles<T> = StyleSheet.NamedStyles<T>;

export function createThemedStyles<T extends NamedStyles<T>>(
  factory: (p: Palette) => T | NamedStyles<T>,
): () => T {
  const cache = new Map<Palette, T>();
  return function useStyles(): T {
    const { palette: p } = useTheme();
    return useMemo(() => {
      const cached = cache.get(p);
      if (cached) return cached;
      const created = StyleSheet.create(factory(p)) as T;
      cache.set(p, created);
      return created;
    }, [p]);
  };
}
