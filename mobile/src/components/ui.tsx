import { StyleSheet, Text, View, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { radius, theme } from '@/lib/theme';

/**
 * The handful of primitives the screens share.
 *
 * Plain React Native rather than a UI library: the palette is already fixed by
 * the website's tokens, and these are the only five shapes the app needs. A
 * dependency would be more code to learn than to write.
 */

export function Screen({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Heading({ children }: { children: React.ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

/** An error the shopper can act on, rather than a raw failure string. */
export function Notice({
  tone = 'danger',
  children,
}: {
  tone?: 'danger' | 'muted';
  children: React.ReactNode;
}) {
  return (
    <Text style={[styles.notice, tone === 'muted' && styles.noticeMuted]}>{children}</Text>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.buttonLabel, variant === 'secondary' && styles.buttonLabelSecondary]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Hairline row border, matching the site's 1px lines. */
export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.canvas,
  },
  heading: {
    fontSize: 26,
    fontWeight: '600',
    color: theme.ink,
    letterSpacing: -0.4,
  },
  muted: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.inkMuted,
  },
  notice: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.danger,
    backgroundColor: theme.dangerSoft,
    padding: 12,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: theme.danger,
  },
  noticeMuted: {
    color: theme.inkMuted,
    backgroundColor: theme.surface,
    borderColor: theme.line,
  },
  button: {
    backgroundColor: theme.ink,
    borderRadius: radius,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.lineStrong,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    color: theme.onInk,
    fontSize: 15,
    fontWeight: '600',
  },
  buttonLabelSecondary: {
    color: theme.ink,
  },
  divider: {
    height: 1,
    backgroundColor: theme.line,
  },
});
