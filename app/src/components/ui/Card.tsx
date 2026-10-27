// The default card: white on the warm surface, radius 16, no shadow (THEME.md › Elevation). Pressable cards spring.
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { M3Colors, Radius } from '../../theme';
import { PressableScale } from './PressableScale';

interface CardProps {
  children: ReactNode;
  /** Makes the whole card pressable with the PressableScale spring. */
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Card({ children, onPress, accessibilityLabel, style, testID }: CardProps) {
  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[styles.card, style]}
        testID={testID}
      >
        {children}
      </PressableScale>
    );
  }
  return (
    <View style={[styles.card, style]} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: M3Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    padding: 16,
  },
});
