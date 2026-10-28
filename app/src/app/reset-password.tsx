// Set a new password after opening a reset link (P1.15, D-028). The link has already signed the user in;
// the root layout shows only this screen until the password is saved (finishRecovery) or they sign out.
// Legacy had no such screen: its link just signed the user in. The look follows the auth screen.
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/ui/Button';
import { PasswordField } from '../components/ui/PasswordField';
import { useAuth } from '../lib/auth/AuthProvider';
import { PASSWORD_MIN_LENGTH, signOut, updatePassword } from '../lib/auth/service';
import { showAlert } from '../lib/dialogs';
import { toUserMessage } from '../lib/errors';
import { FontWeight, M3Colors, Spacing, Typography } from '../theme';

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { user, finishRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Your password needs at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updatePassword(password);
      showAlert('Password updated', 'Use your new password next time you sign in.');
      // The guard opens the app again.
      finishRecovery();
    } catch (e) {
      setError(toUserMessage(e));
      setSaving(false);
    }
  }

  async function handleCancel() {
    // Signing out ends the recovery session; the guard returns to /auth.
    try {
      await signOut();
    } catch {
      // A failed server sign-out still clears the local session.
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      testID="screen-reset-password"
    >
      <ScrollView
        contentContainerStyle={[
          styles.inner,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Ionicons
          name="lock-closed"
          size={44}
          color={M3Colors.primary}
          style={styles.logo}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text style={styles.title} testID="reset-password-title">
          Set a new password
        </Text>
        <Text style={styles.subtitle}>
          For <Text style={styles.email}>{user?.email ?? 'your account'}</Text>
        </Text>

        <PasswordField
          purpose="new"
          placeholder="New password"
          accessibilityLabel="New password"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            setError(null);
          }}
          returnKeyType="go"
          onSubmitEditing={handleSave}
          testID="reset-password-input"
        />
        <Text style={styles.hint}>At least {PASSWORD_MIN_LENGTH} characters.</Text>

        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite" testID="reset-password-error">
            {error}
          </Text>
        ) : null}

        <Button
          label="Save password"
          onPress={handleSave}
          shape="block"
          loading={saving}
          testID="reset-password-submit"
        />
        <Pressable
          onPress={handleCancel}
          disabled={saving}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Cancel and sign out"
          testID="reset-password-cancel"
        >
          <Text style={styles.cancelText}>Cancel and sign out</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: M3Colors.surface },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.screenGutter,
    gap: 12,
  },
  logo: { alignSelf: 'center', marginBottom: 4 },
  title: { ...Typography.authTitle, color: M3Colors.onSurface, textAlign: 'center' },
  subtitle: {
    fontSize: 15,
    color: M3Colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 12,
  },
  email: { fontWeight: FontWeight.bold, color: M3Colors.onSurface },
  hint: { fontSize: 12, color: M3Colors.outline, marginTop: -4, marginLeft: 4 },
  error: { color: M3Colors.error, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  cancelText: {
    color: M3Colors.onSurfaceVariant,
    textAlign: 'center',
    fontSize: 14,
    paddingVertical: 8,
  },
});
