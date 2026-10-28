// Admin home placeholder (P1.12). Phase 5 builds the real portal. Loaded lazily by the /admin route, so
// admin code stays out of the main web bundle; only the gate in (admin)/_layout.web.tsx ships with it.
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../lib/auth/AuthProvider';
import { M3Colors, Spacing, Typography } from '../../theme';

export default function AdminHome() {
  const { user } = useAuth();

  return (
    <View style={styles.container} testID="admin-home">
      <Text style={styles.title} testID="admin-home-title">
        Admin
      </Text>
      <Text style={styles.meta} testID="admin-home-user">
        Signed in as {user?.email}
      </Text>
      <Text style={styles.note}>Placeholder. The admin portal is built in Phase 5.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: M3Colors.surface,
    paddingHorizontal: Spacing.screenGutter,
    paddingTop: Spacing.sectionGap,
    gap: 8,
  },
  title: {
    ...Typography.heroTitle,
    color: M3Colors.primary,
  },
  meta: {
    ...Typography.meta,
    color: M3Colors.outline,
  },
  note: {
    ...Typography.body,
    color: M3Colors.onSurfaceVariant,
  },
});
