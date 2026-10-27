// Failed-request state (THEME.md › ErrorState). Kept apart from EmptyState so a failure never reads as "nothing here".
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { FontWeight, M3Colors, Radius, Spacing } from '../../theme';
import { Button } from './Button';

export type ErrorKind = 'offline' | 'auth' | 'permission' | 'notFound' | 'unknown';

/** User-facing error copy. Mapping raw errors to this belongs to the data layer (legacy `toUserMessage`). */
export interface FriendlyError {
  kind: ErrorKind;
  /** Short headline for the title. */
  title: string;
  /** One or two sentences telling the user what to do next. */
  message: string;
  /** False when retrying can't help (e.g. a wrong password). */
  retryable: boolean;
}

interface ErrorStateProps {
  error: FriendlyError;
  onRetry?: () => void;
  /** Inline variant for a section of a screen rather than the whole screen. */
  compact?: boolean;
  /** The retry button gets `${testID}-retry`. */
  testID?: string;
}

export function ErrorState({ error, onRetry, compact, testID }: ErrorStateProps) {
  const icon = error.kind === 'offline' ? 'wifi-off' : 'alert-circle-outline';

  return (
    <View style={[styles.container, compact && styles.compactContainer]} testID={testID}>
      <MaterialCommunityIcons name={icon} size={compact ? 28 : 44} color={M3Colors.outline} />
      <Text style={[styles.title, compact && styles.compactTitle]}>{error.title}</Text>
      <Text style={styles.message}>{error.message}</Text>
      {onRetry && error.retryable && (
        <Button
          label="Try again"
          icon="refresh"
          onPress={onRetry}
          style={styles.retryButton}
          testID={testID ? `${testID}-retry` : 'error-state-retry'}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
    gap: 6,
  },
  compactContainer: {
    paddingVertical: 24,
    marginHorizontal: Spacing.screenGutter,
    backgroundColor: M3Colors.surfaceContainerLow,
    borderRadius: Radius.xl,
  },
  title: {
    fontSize: 16,
    fontWeight: FontWeight.bold,
    color: M3Colors.onSurface,
    marginTop: 8,
    textAlign: 'center',
  },
  compactTitle: {
    fontSize: 15,
    marginTop: 4,
  },
  message: {
    fontSize: 13,
    color: M3Colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 19,
  },
  // Legacy's retry pill is a little tighter than the default pill.
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
});
