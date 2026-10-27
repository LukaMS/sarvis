// Single-select filter chips, as on legacy History and Search (All / Barcode / Receipt; All / Products / Companies).
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { FontWeight, M3Colors, Radius, Spacing } from '../../theme';

interface FilterChipsProps<T extends string> {
  options: readonly T[];
  selected: T;
  onSelect: (option: T) => void;
  /** Accessibility label per chip. Defaults to "Filter by {option}". */
  labelFor?: (option: T) => string;
  style?: StyleProp<ViewStyle>;
  /** Each chip gets `${testID}-${option}`. */
  testID: string;
}

export function FilterChips<T extends string>({
  options,
  selected,
  onSelect,
  labelFor = (option) => `Filter by ${option}`,
  style,
  testID,
}: FilterChipsProps<T>) {
  return (
    <View style={[styles.container, style]} testID={testID}>
      {options.map((option) => {
        const active = option === selected;
        return (
          <Pressable
            key={option}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(option)}
            hitSlop={{ top: 8, bottom: 8 }}
            accessibilityRole="button"
            aria-selected={active}
            accessibilityLabel={labelFor(option)}
            testID={`${testID}-${option}`}
          >
            <Text style={[styles.text, active && styles.textActive]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.screenGutter,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.full,
    backgroundColor: M3Colors.surfaceContainerLow,
  },
  chipActive: {
    backgroundColor: M3Colors.primary,
  },
  text: {
    fontSize: 13,
    fontWeight: FontWeight.semibold,
    color: M3Colors.onSurfaceVariant,
  },
  textActive: {
    color: M3Colors.onPrimary,
  },
});
