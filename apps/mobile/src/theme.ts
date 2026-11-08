// Light "study" palette (indigo primary, orange highlight). All text pairs meet 4.5:1.
export const colors = {
  bg: "#F5F7FF",
  panel: "#FFFFFF",
  text: "#1E1B4B",
  muted: "#475569",
  line: "#E0E7FF",
  lineStrong: "#C7D2FE",
  accent: "#4F46E5",
  accentSoft: "#EEF2FF",
  onAccent: "#FFFFFF",
  highlight: "#EA580C",
  highlightSoft: "#FFF1E8",
  success: "#15803D",
  successSoft: "#DCFCE7",
  danger: "#B91C1C",
  dangerSoft: "#FEE2E2",
  warn: "#92400E",
  warnSoft: "#FEF3C7",
};

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const icon = { sm: 16, md: 20, lg: 24, xl: 40 };

export const shadow = {
  shadowColor: "#1E1B4B",
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

export function masteryTone(score: number): { color: string; soft: string; label: string } {
  if (score < 0.5) return { color: colors.danger, soft: colors.dangerSoft, label: "Needs work" };
  if (score < 0.8) return { color: colors.warn, soft: colors.warnSoft, label: "Getting there" };
  return { color: colors.success, soft: colors.successSoft, label: "Strong" };
}
