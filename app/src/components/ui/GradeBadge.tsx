// Letter-grade badge (THEME.md › GradeBadge). Unrated grades show a dashed "Not rated" box.
import { StyleSheet, Text, View } from 'react-native';

import { FontWeight, M3Colors, TintAlpha, gradeToColor, withAlpha } from '../../theme';

export type GradeBadgeSize = 'sm' | 'md' | 'lg';

interface GradeBadgeProps {
  /** A letter grade, or null/empty when the item has never been rated. */
  grade: string | null | undefined;
  size?: GradeBadgeSize;
  /** Render nothing instead of "Not rated" when the surrounding row already says so. */
  hideWhenUnrated?: boolean;
  testID?: string;
}

const SIZES: Record<
  GradeBadgeSize,
  { height: number; fontSize: number; minWidth: number; unratedFontSize: number }
> = {
  sm: { height: 20, fontSize: 11, minWidth: 28, unratedFontSize: 9 },
  md: { height: 26, fontSize: 13, minWidth: 36, unratedFontSize: 10 },
  lg: { height: 34, fontSize: 17, minWidth: 48, unratedFontSize: 12 },
};

/** A grade is only real if it's a letter: "", "—", "-" and null all mean unrated. */
export function isRatedGrade(grade: string | null | undefined): grade is string {
  if (!grade) return false;
  const trimmed = grade.trim();
  return trimmed.length > 0 && trimmed !== '—' && trimmed !== '-';
}

export function GradeBadge({ grade, size = 'md', hideWhenUnrated, testID }: GradeBadgeProps) {
  const dims = SIZES[size];

  if (!isRatedGrade(grade)) {
    if (hideWhenUnrated) return null;
    return (
      <View
        style={[styles.badge, styles.unratedBadge, { height: dims.height }]}
        accessibilityLabel="Not rated"
        testID={testID}
      >
        <Text style={[styles.unratedText, { fontSize: dims.unratedFontSize }]} numberOfLines={1}>
          Not rated
        </Text>
      </View>
    );
  }

  const color = gradeToColor(grade);

  return (
    <View
      style={[
        styles.badge,
        styles.ratedBadge,
        {
          backgroundColor: withAlpha(color, TintAlpha.badge),
          minWidth: dims.minWidth,
          height: dims.height,
        },
      ]}
      accessibilityLabel={`Grade ${grade}`}
      testID={testID}
    >
      <Text style={[styles.text, { color, fontSize: dims.fontSize }]}>{grade}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratedBadge: {
    paddingHorizontal: 6,
  },
  text: {
    fontWeight: FontWeight.bold,
  },
  unratedBadge: {
    paddingHorizontal: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: M3Colors.outlineVariant,
    borderStyle: 'dashed',
  },
  unratedText: {
    fontWeight: FontWeight.semibold,
    color: M3Colors.outline,
  },
});
