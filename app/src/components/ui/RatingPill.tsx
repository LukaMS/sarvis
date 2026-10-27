// Good / Mixed / Poor pill (THEME.md › RatingPill). No rating shows a dashed "Not rated" pill.
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { FontWeight, M3Colors, TintAlpha, ratingToColor, withAlpha } from '../../theme';

interface RatingPillProps {
  /** "Good" / "Mixed" / "Poor", or null when the company has no rating yet. */
  rating: string | null | undefined;
  style?: StyleProp<ViewStyle>;
  /** Render nothing instead of "Not rated" when there's no rating. */
  hideWhenUnrated?: boolean;
  testID?: string;
}

export function RatingPill({ rating, style, hideWhenUnrated, testID }: RatingPillProps) {
  const value = rating?.trim();

  if (!value) {
    if (hideWhenUnrated) return null;
    return (
      <View
        style={[styles.pill, styles.unratedPill, style]}
        accessibilityLabel="Not rated"
        testID={testID}
      >
        <Text style={styles.unratedText}>Not rated</Text>
      </View>
    );
  }

  const color = ratingToColor(value);

  return (
    <View
      style={[styles.pill, { backgroundColor: withAlpha(color, TintAlpha.badge) }, style]}
      accessibilityLabel={`Rated ${value}`}
      testID={testID}
    >
      <Text style={[styles.text, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: FontWeight.semibold,
  },
  unratedPill: {
    borderWidth: 1,
    borderColor: M3Colors.outlineVariant,
    borderStyle: 'dashed',
  },
  unratedText: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
    color: M3Colors.outline,
  },
});
