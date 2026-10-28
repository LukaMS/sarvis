// Root stack (SPEC › Navigation map). Tab screens draw their own hero; detail and secondary screens get
// the native header (THEME.md › Navigation chrome › Stack headers).
// AuthGate (SPEC F1): Stack.Protected guards. Signed out, every app route sends you to /auth; signed
// in, /auth sends you to the tabs. Signed in from a password-reset link, only /reset-password is open
// (D-028). The dev-only routes stay outside every guard. A deep link to a guarded route still lands on
// the first open screen, but in development React Navigation logs "The 'state' or 'screen' passed in the
// params couldn't be applied…" for it. That is expected and harmless (D-029).
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AuthProvider, useAuth } from '../lib/auth/AuthProvider';
import { M3Colors } from '../theme';

const header = {
  headerShown: true,
  headerBackTitle: 'Back',
  headerStyle: { backgroundColor: M3Colors.surface },
  headerTintColor: M3Colors.primary,
} as const;

/** Route → header title, for every screen that shows the standard header. */
const HEADER_TITLES: Record<string, string> = {
  'product/[id]': 'Product Details',
  'company/[id]': 'Company Details',
  'receipt/[id]': 'Receipt Details',
  'receipt-scan': 'Scan Receipt',
  'receipt-results': 'Receipt Results',
  stories: 'Impact Stories',
  settings: 'Settings',
  privacy: 'Privacy',
  help: 'Help & Support',
  about: 'About',
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
      <StatusBar style="dark" />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { session, isLoading, recovering } = useAuth();

  // Guarding before the stored session is read would flash the sign-in screen at signed-in users.
  if (isLoading) {
    return (
      <View style={styles.loading} testID="auth-loading">
        <ActivityIndicator size="large" color={M3Colors.primary} />
      </View>
    );
  }

  const signedIn = !!session;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: M3Colors.surface },
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="auth" />
      </Stack.Protected>
      {/* A password-reset link signs the user in; nothing else opens until the new password is saved. */}
      <Stack.Protected guard={signedIn && recovering}>
        <Stack.Screen name="reset-password" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !recovering}>
        <Stack.Screen name="(tabs)" />
        {/* Web-only admin portal; its own layout checks the role with the server (D-005). */}
        <Stack.Screen name="(admin)" />
        {Object.entries(HEADER_TITLES).map(([name, title]) => (
          <Stack.Screen key={name} name={name} options={{ ...header, headerTitle: title }} />
        ))}
        <Stack.Screen
          name="story/[id]"
          options={{
            headerShown: true,
            headerTitle: '',
            headerTransparent: true,
            headerBackTitle: 'Back',
            // White over the dark cover image the story screen draws behind the header.
            headerTintColor: '#ffffff',
          }}
        />
        <Stack.Screen
          name="profile"
          options={{
            presentation: 'modal',
            headerShown: true,
            headerTitle: 'Profile',
            headerStyle: { backgroundColor: M3Colors.surface },
            headerTintColor: M3Colors.primary,
          }}
        />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: M3Colors.surface,
  },
});
