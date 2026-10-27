// Root stack (SPEC › Navigation map). Tab screens draw their own hero; detail and secondary screens get
// the native header (THEME.md › Navigation chrome › Stack headers).
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

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
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: M3Colors.surface },
        }}
      >
        <Stack.Screen name="(tabs)" />
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
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}
