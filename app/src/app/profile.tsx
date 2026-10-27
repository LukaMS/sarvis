// Profile placeholder, with sign-out until Phase 8 builds the real screen. The header is configured in
// the root layout.
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { StackPlaceholder } from '../components/navigation/PlaceholderScreen';
import { Button } from '../components/ui/Button';
import { useAuth } from '../lib/auth/AuthProvider';
import { signOut } from '../lib/auth/service';
import { toUserMessage } from '../lib/errors';
import { M3Colors } from '../theme';

export default function ProfileScreen() {
  const { user } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On success the root layout's guard swaps this screen for /auth.
  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      await signOut();
    } catch (e) {
      setError(toUserMessage(e));
      setSigningOut(false);
    }
  }

  return (
    <StackPlaceholder id="profile" title="Profile">
      {user?.email ? (
        <Text style={styles.email} testID="profile-email">
          {user.email}
        </Text>
      ) : null}
      <Button
        label="Sign Out"
        onPress={handleSignOut}
        variant="text"
        destructive
        icon="logout"
        loading={signingOut}
        style={styles.signOut}
        testID="profile-sign-out"
      />
      {error ? (
        <Text style={styles.error} testID="profile-sign-out-error">
          {error}
        </Text>
      ) : null}
    </StackPlaceholder>
  );
}

const styles = StyleSheet.create({
  email: {
    fontSize: 14,
    color: M3Colors.onSurface,
  },
  signOut: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  error: {
    fontSize: 13,
    color: M3Colors.error,
  },
});
