// Buttons from THEME.md › Screen-level patterns and the legacy pill buttons (retry, request, View Details).
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { FontWeight, M3Colors, Radius } from '../../theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** primary: filled. secondary: outlined on `surfaceContainerLow`. text: no container. */
export type ButtonVariant = 'primary' | 'secondary' | 'text';
/** pill: rounded-full, sized to its label. block: 48 high, radius 12 (auth screen). */
export type ButtonShape = 'pill' | 'block';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  shape?: ButtonShape;
  /** MaterialCommunityIcons name shown before the label. */
  icon?: IconName;
  disabled?: boolean;
  /** Shows a spinner in place of the icon and blocks presses. */
  loading?: boolean;
  /** Error colours: the label on text buttons (Sign Out); an `errorContainer` fill on primary (Delete). */
  destructive?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  shape = 'pill',
  icon,
  disabled,
  loading,
  destructive,
  accessibilityLabel,
  style,
  testID,
}: ButtonProps) {
  const inactive = disabled || loading;
  const textStyle = labelStyle(variant, shape, destructive);
  const color = textStyle.color as string;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      aria-disabled={!!inactive}
      aria-busy={!!loading}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        shape === 'block' ? styles.block : styles.pill,
        variant === 'primary' && (destructive ? styles.primaryDestructive : styles.primary),
        variant === 'secondary' && styles.secondary,
        variant === 'text' && styles.text,
        inactive && styles.inactive,
        pressed && !inactive && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        icon && <MaterialCommunityIcons name={icon} size={16} color={color} />
      )}
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}

function labelStyle(variant: ButtonVariant, shape: ButtonShape, destructive?: boolean): TextStyle {
  if (variant === 'primary') {
    const base = shape === 'block' ? styles.primaryBlockText : styles.primaryText;
    return destructive ? { ...base, color: M3Colors.error } : base;
  }
  if (variant === 'secondary') return styles.secondaryText;
  return destructive ? { ...styles.textLabel, color: M3Colors.error } : styles.textLabel;
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pill: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: Radius.full,
  },
  block: {
    alignSelf: 'stretch',
    height: 48,
    paddingHorizontal: 16,
    borderRadius: Radius.lg,
    gap: 8,
  },
  primary: {
    backgroundColor: M3Colors.primary,
  },
  primaryDestructive: {
    backgroundColor: M3Colors.errorContainer,
  },
  secondary: {
    backgroundColor: M3Colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: M3Colors.outlineVariant,
  },
  text: {
    paddingHorizontal: 24,
  },
  inactive: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.85,
  },
  primaryText: {
    color: M3Colors.onPrimary,
    fontSize: 14,
    fontWeight: FontWeight.bold,
  },
  primaryBlockText: {
    color: M3Colors.onPrimary,
    fontSize: 16,
    fontWeight: FontWeight.semibold,
  },
  secondaryText: {
    color: M3Colors.onSurface,
    fontSize: 15,
    fontWeight: FontWeight.medium,
  },
  textLabel: {
    color: M3Colors.primary,
    fontSize: 15,
    fontWeight: FontWeight.semibold,
  },
});
