// Web /admin gate (D-005). The root layout already sends signed-out users to /auth. Here the server
// decides who is an admin (admin_ping RPC); nothing under this layout renders until it says yes.
import { Slot, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdminLoading } from '../../components/admin/AdminLoading';
import { Button } from '../../components/ui/Button';
import { ErrorState, type FriendlyError } from '../../components/ui/ErrorState';
import { checkIsAdmin } from '../../lib/admin';
import { useAuth } from '../../lib/auth/AuthProvider';
import { toFriendlyError } from '../../lib/errors';
import { M3Colors } from '../../theme';

type Gate =
  | { status: 'checking' }
  | { status: 'allowed' }
  | { status: 'denied' }
  | { status: 'failed'; error: FriendlyError };

const NOT_AUTHORISED: FriendlyError = {
  kind: 'permission',
  title: 'Not authorised',
  message: 'This area is for Sarvis admins only.',
  retryable: false,
};

export default function AdminLayout() {
  const { user } = useAuth();
  const router = useRouter();
  const [gate, setGate] = useState<Gate>({ status: 'checking' });
  const [attempt, setAttempt] = useState(0);
  const userId = user?.id;

  // Re-asks when the signed-in user changes, so a role check never outlives its session.
  useEffect(() => {
    let active = true;
    setGate({ status: 'checking' });
    checkIsAdmin().then(
      (isAdmin) => active && setGate({ status: isAdmin ? 'allowed' : 'denied' }),
      (e: unknown) => active && setGate({ status: 'failed', error: toFriendlyError(e) }),
    );
    return () => {
      active = false;
    };
  }, [userId, attempt]);

  if (gate.status === 'allowed') return <Slot />;
  if (gate.status === 'checking') return <AdminLoading testID="admin-checking" />;

  return (
    <View style={styles.container} testID="admin-denied">
      {gate.status === 'denied' ? (
        <ErrorState error={NOT_AUTHORISED} />
      ) : (
        <ErrorState
          error={gate.error}
          onRetry={() => setAttempt((n) => n + 1)}
          testID="admin-check-failed"
        />
      )}
      <Button
        label="Back to home"
        variant="secondary"
        icon="home-outline"
        onPress={() => router.replace('/')}
        testID="admin-denied-home"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: M3Colors.surface,
    paddingHorizontal: 24,
  },
});
