// Section title with an optional uppercase action link (THEME.md › SectionHeader).
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FontWeight, M3Colors, Spacing, Typography } from '../../theme';

interface SectionHeaderProps {
  title: string;
  actionText?: string;
  onAction?: () => void;
  /** The action gets `${testID}-action`. */
  testID?: string;
}

export function SectionHeader({ title, actionText, onAction, testID }: SectionHeaderProps) {
  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {actionText && onAction && (
        // The text is ~18dp tall; hitSlop lifts the target above 48dp without changing layout.
        <Pressable
          onPress={onAction}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`${actionText} ${title}`}
          testID={testID ? `${testID}-action` : undefined}
        >
          <Text style={styles.action}>{actionText}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.screenGutter,
    marginBottom: 12,
  },
  title: {
    ...Typography.sectionHeader,
    color: M3Colors.onSurface,
  },
  action: {
    fontSize: 13,
    fontWeight: FontWeight.semibold,
    color: M3Colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
