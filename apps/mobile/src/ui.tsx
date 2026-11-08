import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, icon, masteryTone, radius, shadow, space } from "./theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export function Icon({ name, size = icon.md, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "inverse";

export function Button({
  label,
  onPress,
  variant = "primary",
  iconName,
  disabled,
  hint,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  iconName?: IconName;
  disabled?: boolean;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const v = buttonVariants[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.button,
        v.box,
        pressed && !disabled && { opacity: 0.8 },
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      {iconName ? <Icon name={iconName} color={v.text.color} /> : null}
      <Text style={[styles.buttonText, v.text]}>{label}</Text>
    </Pressable>
  );
}

const buttonVariants: Record<ButtonVariant, { box: ViewStyle; text: { color: string } }> = {
  primary: { box: { backgroundColor: colors.accent }, text: { color: colors.onAccent } },
  secondary: {
    box: { backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.lineStrong },
    text: { color: colors.accent },
  },
  ghost: { box: { backgroundColor: "transparent" }, text: { color: colors.accent } },
  inverse: { box: { backgroundColor: colors.panel }, text: { color: colors.accent } },
};

export function IconButton({
  name,
  label,
  onPress,
  color = colors.text,
  disabled,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && { backgroundColor: colors.accentSoft },
        disabled && { opacity: 0.45 },
      ]}
    >
      <Icon name={name} size={icon.lg} color={color} />
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionCard({
  title,
  iconName,
  children,
  tone = colors.accent,
}: {
  title: string;
  iconName: IconName;
  children: ReactNode;
  tone?: string;
}) {
  return (
    <Card>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionIcon, { backgroundColor: tone + "1A" }]}>
          <Icon name={iconName} size={icon.sm} color={tone} />
        </View>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {children}
    </Card>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && { color: colors.muted }]}>{children}</Text>;
}

export function Bullets({ items, iconName = "ellipse", color = colors.accent }: { items: string[]; iconName?: IconName; color?: string }) {
  return (
    <View style={{ gap: space.sm }}>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow}>
          <View style={styles.bulletIcon}>
            <Icon name={iconName} size={iconName === "ellipse" ? 8 : icon.sm} color={color} />
          </View>
          <Text style={[styles.body, { flex: 1 }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function Badge({ label, color = colors.accent, soft = colors.accentSoft, iconName }: { label: string; color?: string; soft?: string; iconName?: IconName }) {
  return (
    <View style={[styles.badge, { backgroundColor: soft }]}>
      {iconName ? <Icon name={iconName} size={14} color={color} /> : null}
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ value, color = colors.accent }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <View style={styles.barBg} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

export function MasteryRow({ name, score, subtitle }: { name: string; score: number; subtitle?: string }) {
  const tone = masteryTone(score);
  const pct = Math.round(score * 100);
  return (
    <Card style={{ gap: space.sm }}>
      <View
        accessible
        accessibilityLabel={`${name}: ${pct}% mastery, ${tone.label}`}
        style={{ gap: space.sm }}
      >
        <View style={styles.rowBetween}>
          <Text style={[styles.itemTitle, { flex: 1 }]} numberOfLines={2}>
            {name}
          </Text>
          <Badge label={tone.label} color={tone.color} soft={tone.soft} />
        </View>
        <ProgressBar value={score} color={tone.color} />
        <Text style={styles.caption}>
          {pct}% mastery{subtitle ? ` · ${subtitle}` : ""}
        </Text>
      </View>
    </Card>
  );
}

export function EmptyState({ iconName, title, body, children }: { iconName: IconName; title: string; body: string; children?: ReactNode }) {
  return (
    <Card style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={iconName} size={icon.xl} color={colors.accent} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={[styles.body, { color: colors.muted, textAlign: "center" }]}>{body}</Text>
      {children}
    </Card>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: on, selected: on }}
            style={[styles.segment, on && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, on && { color: colors.onAccent }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  buttonText: { fontSize: 16, fontWeight: "700" },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    padding: space.md + 4,
    gap: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow,
  },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: space.sm + 2 },
  sectionIcon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  body: { color: colors.text, fontSize: 16, lineHeight: 24 },
  caption: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  itemTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  bulletRow: { flexDirection: "row", gap: space.sm + 2, alignItems: "flex-start" },
  bulletIcon: { height: 24, justifyContent: "center", width: 16, alignItems: "center" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 13, fontWeight: "700" },
  barBg: { height: 8, borderRadius: radius.pill, backgroundColor: colors.accentSoft, overflow: "hidden" },
  barFill: { height: 8, borderRadius: radius.pill },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  empty: { alignItems: "center", paddingVertical: space.xl, gap: space.sm },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "700", textAlign: "center" },
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.sm + 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
  },
  segmentOn: { backgroundColor: colors.accent },
  segmentText: { color: colors.accent, fontWeight: "700", fontSize: 15, textTransform: "capitalize" },
});
