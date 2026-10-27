// "Nothing here yet" state (THEME.md › EmptyState). Failed requests use ErrorState instead.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { FontWeight, M3Colors } from '../../theme';
import type { IconName } from './Button';

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  message?: string;
  testID?: string;
}

export function EmptyState({ icon = 'package-variant', title, message, testID }: EmptyStateProps) {
  return (
    <View style={styles.container} testID={testID}>
      <MaterialCommunityIcons name={icon} size={48} color={M3Colors.outlineVariant} />
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 16,
    fontWeight: FontWeight.semibold,
    color: M3Colors.onSurfaceVariant,
    marginTop: 12,
  },
  message: {
    fontSize: 14,
    color: M3Colors.outline,
    textAlign: 'center',
    marginTop: 4,
  },
});
