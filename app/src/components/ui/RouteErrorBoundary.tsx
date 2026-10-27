// Screen-level fallback for render crashes (THEME.md › RouteErrorBoundary).
// A route file opts in with `export { RouteErrorBoundary as ErrorBoundary }`; Expo Router mounts it.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { FontWeight, M3Colors } from '../../theme';
import { Button } from './Button';

export function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const router = useRouter();

  return (
    <View style={styles.container} testID="route-error-boundary">
      <MaterialCommunityIcons name="alert-circle-outline" size={44} color={M3Colors.outline} />
      <Text style={styles.title}>This page couldn&apos;t be displayed</Text>
      <Text style={styles.message}>
        Some of the information for this entry is missing or incomplete. Nothing is wrong with your
        account.
      </Text>

      <Button
        label="Try again"
        accessibilityLabel="Try loading this page again"
        onPress={() => void retry()}
        style={styles.retryButton}
        testID="route-error-boundary-retry"
      />

      {router.canGoBack() && (
        <Button
          label="Go back"
          variant="text"
          onPress={() => router.back()}
          style={styles.backButton}
          testID="route-error-boundary-back"
        />
      )}

      {__DEV__ && <Text style={styles.devDetail}>{error.message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 6,
    backgroundColor: M3Colors.surface,
  },
  title: {
    fontSize: 17,
    fontWeight: FontWeight.bold,
    color: M3Colors.onSurface,
    marginTop: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: M3Colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Legacy's full-screen retry is a larger pill (28 × 13, 15 / 700).
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 28,
    paddingVertical: 13,
  },
  backButton: {
    marginTop: 4,
  },
  devDetail: {
    marginTop: 24,
    fontSize: 11,
    color: M3Colors.outline,
    textAlign: 'center',
  },
});
