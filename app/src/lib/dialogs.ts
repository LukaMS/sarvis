// Confirm and alert dialogs on every platform. React Native Web's Alert.alert does nothing, so web
// falls back to the browser's own dialogs (which can't label their buttons).
import { Alert, Platform } from 'react-native';

export interface ConfirmOptions {
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  /** Styles the confirm button as destructive (iOS; Android ignores it). */
  destructive?: boolean;
}

/** Resolves true when the user picks the confirm button. Back or dismiss counts as cancel. */
export function confirmAsync({
  title,
  message,
  cancelLabel,
  confirmLabel,
  destructive,
}: ConfirmOptions): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function showAlert(title: string, message: string): void {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
