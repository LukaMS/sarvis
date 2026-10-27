// Floating tab bar config (THEME.md › Navigation chrome › Tab bar). Legacy styled the stock bottom-tabs
// bar through screenOptions rather than drawing its own, and the rebuild keeps that.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppColors, Elevation, M3Colors, Radius, Typography } from '../../theme';

type TabIcon = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Bottom-tabs screen options, taken from expo-router so the app needn't import React Navigation. */
type TabOptions = Exclude<
  NonNullable<ComponentProps<typeof Tabs.Screen>['options']>,
  (...args: never[]) => unknown
>;

export const TABS: {
  /** Route file name under `app/(tabs)/`. */
  name: string;
  /** Used in testIDs: `tab-<id>` on the button, `screen-<id>` on the screen. */
  id: string;
  title: string;
  icon: TabIcon;
  /** Spoken by a screen reader; the visible label alone is too terse. */
  a11yLabel: string;
}[] = [
  { name: 'index', id: 'impact', title: 'Impact', icon: 'leaf', a11yLabel: 'Impact, home' },
  {
    name: 'scan',
    id: 'scan',
    title: 'Scan',
    icon: 'barcode-scan',
    a11yLabel: 'Scan a barcode or receipt',
  },
  {
    name: 'search',
    id: 'search',
    title: 'Search',
    icon: 'magnify',
    a11yLabel: 'Search products and companies',
  },
  {
    name: 'history',
    id: 'history',
    title: 'History',
    icon: 'history',
    a11yLabel: 'Your scan history',
  },
];

const BAR_HEIGHT = 62;

export function useTabScreenOptions(): TabOptions {
  const insets = useSafeAreaInsets();

  return {
    headerShown: false,
    sceneStyle: { backgroundColor: M3Colors.surface },
    tabBarActiveTintColor: M3Colors.primary,
    tabBarInactiveTintColor: AppColors.tabInactive,
    tabBarStyle: {
      backgroundColor: M3Colors.surfaceContainerLowest,
      borderTopWidth: 1,
      borderTopColor: M3Colors.outlineVariant,
      paddingTop: 6,
      // Grows with the inset, so the Android gesture pill doesn't cross the labels.
      height: BAR_HEIGHT + insets.bottom,
      paddingBottom: insets.bottom,
      borderTopLeftRadius: Radius.xxl,
      borderTopRightRadius: Radius.xxl,
      // Content scrolls under the bar.
      position: 'absolute',
      overflow: 'hidden',
      ...Elevation.tabBar,
    },
    tabBarLabelStyle: Typography.tabLabel,
    tabBarItemStyle: {
      borderRadius: Radius.xl,
      marginHorizontal: 4,
      paddingVertical: 4,
    },
  };
}

export function tabOptions(tab: (typeof TABS)[number]): TabOptions {
  return {
    title: tab.title,
    tabBarAccessibilityLabel: tab.a11yLabel,
    tabBarButtonTestID: `tab-${tab.id}`,
    tabBarIcon: ({ color, size }) => (
      <MaterialCommunityIcons name={tab.icon} color={color} size={size} />
    ),
  };
}
