// Settings placeholder with the Danger zone (SPEC F8) until Phase 8 builds the real screen. The header
// is configured in the root layout.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { StackPlaceholder } from '../components/navigation/PlaceholderScreen';
import { Button } from '../components/ui/Button';
import { deleteAccount } from '../lib/auth/service';
import { confirmAsync, showAlert } from '../lib/dialogs';
import { toUserMessage } from '../lib/errors';
import { FontWeight, M3Colors, Radius } from '../theme';

export default function SettingsScreen() {
  const [deleting, setDeleting] = useState(false);

  // Asks twice, with the legacy copy: it can't be undone, and app stores require it in-app.
  async function confirmDeleteAccount() {
    const first = await confirmAsync({
      title: 'Delete your account?',
      message:
        'This permanently removes your account, your scan history, your saved receipts and your profile. It cannot be undone.',
      cancelLabel: 'Cancel',
      confirmLabel: 'Continue',
      destructive: true,
    });
    if (!first) return;
    const second = await confirmAsync({
      title: 'This is permanent',
      message: 'Last chance — deleting your account cannot be reversed.',
      cancelLabel: 'Keep my account',
      confirmLabel: 'Delete permanently',
      destructive: true,
    });
    if (!second) return;

    // On success the session clears and the root layout's guard swaps this screen for /auth.
    setDeleting(true);
    try {
      await deleteAccount();
    } catch (e) {
      showAlert("Couldn't delete your account", toUserMessage(e));
      setDeleting(false);
    }
  }

  return (
    <StackPlaceholder id="settings" title="Settings">
      <Text style={styles.sectionTitle}>Danger zone</Text>
      <View style={styles.card}>
        <Button
          label={deleting ? 'Deleting…' : 'Delete my account'}
          onPress={confirmDeleteAccount}
          icon="trash-can-outline"
          destructive
          loading={deleting}
          accessibilityLabel="Delete my account permanently"
          style={styles.deleteButton}
          testID="settings-delete-account"
        />
        <Text style={styles.deleteHint}>
          Permanently removes your account, scan history, receipts and profile. This cannot be
          undone.
        </Text>
      </View>
    </StackPlaceholder>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 13,
    fontWeight: FontWeight.bold,
    color: M3Colors.outline,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 16,
    marginBottom: 2,
  },
  card: {
    backgroundColor: M3Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    padding: 18,
  },
  deleteButton: {
    alignSelf: 'stretch',
    paddingVertical: 14,
    gap: 8,
  },
  deleteHint: {
    fontSize: 12,
    color: M3Colors.outline,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 17,
  },
});
