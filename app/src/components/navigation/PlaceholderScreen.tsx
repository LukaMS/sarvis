// Stand-ins for the screens Phase 8 builds. Tab screens draw the hero block (no header);
// stack screens sit under the native header.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { APP_NAME } from '@sarvis/core';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StatusBarScrim } from '../ui/StatusBarScrim';
import { FontWeight, M3Colors, Spacing, Typography } from '../../theme';

const PLACEHOLDER_NOTE = 'Placeholder. This screen is built in Phase 8.';

type TabPlaceholderProps = {
  /** testID becomes `screen-<id>`. */
  id: string;
  title: string;
  /** Shows the profile button on the wordmark row, as legacy Home does. */
  showProfile?: boolean;
  /** Draws StatusBarScrim, as legacy Home does. */
  scrim?: boolean;
  children?: ReactNode;
};

export function TabPlaceholder({ id, title, showProfile, scrim, children }: TabPlaceholderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.fill} testID={`screen-${id}`}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.tabScreenTop,
          paddingBottom: insets.bottom + Spacing.tabBarClearance,
          paddingHorizontal: Spacing.screenGutter,
        }}
      >
        <View style={styles.wordmarkRow}>
          <Text style={styles.wordmark} testID={`screen-${id}-wordmark`}>
            {APP_NAME}
          </Text>
          {showProfile ? (
            <Pressable
              onPress={() => router.push('/profile')}
              style={styles.avatarButton}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Your profile"
              testID={`screen-${id}-profile`}
            >
              <MaterialCommunityIcons name="account-circle" size={38} color={M3Colors.primary} />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.heroTitle} testID={`screen-${id}-title`}>
          {title}
        </Text>
        <Text style={styles.heroSubtitle}>{PLACEHOLDER_NOTE}</Text>
        {children}
      </ScrollView>
      {scrim ? <StatusBarScrim /> : null}
    </View>
  );
}

type StackPlaceholderProps = {
  /** testID becomes `screen-<id>`. */
  id: string;
  title: string;
  /** Story detail has a transparent header with a white back arrow, so it gets a dark cover band. */
  cover?: boolean;
};

export function StackPlaceholder({ id, title, cover }: StackPlaceholderProps) {
  const params = useLocalSearchParams<{ id?: string }>();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.sectionGap }}
      testID={`screen-${id}`}
    >
      {cover ? <View style={styles.cover} /> : null}
      <View style={styles.stackBody}>
        <Text style={styles.stackTitle} testID={`screen-${id}-title`}>
          {title}
        </Text>
        {params.id ? (
          <Text style={styles.meta} testID={`screen-${id}-param`}>
            id: {params.id}
          </Text>
        ) : null}
        <Text style={styles.note}>{PLACEHOLDER_NOTE}</Text>
      </View>
    </ScrollView>
  );
}

/** A plain link row, for reaching the stack placeholders before their real entry points exist. */
export function PlaceholderLink({
  href,
  label,
  testID,
}: {
  href: string;
  label: string;
  testID: string;
}) {
  return (
    <Link href={href as never} style={styles.link} testID={testID}>
      {label}
    </Link>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: M3Colors.surface,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    marginBottom: 8,
  },
  avatarButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    ...Typography.wordmark,
    color: M3Colors.primary,
  },
  heroTitle: {
    ...Typography.heroTitle,
    color: M3Colors.primary,
  },
  heroSubtitle: {
    fontSize: 15,
    fontWeight: FontWeight.medium,
    color: M3Colors.onSurfaceVariant,
    marginTop: 4,
  },
  cover: {
    height: 280,
    backgroundColor: M3Colors.inverseSurface,
  },
  stackBody: {
    paddingHorizontal: Spacing.screenGutter,
    paddingTop: Spacing.sectionGap,
    gap: 8,
  },
  stackTitle: {
    ...Typography.sectionHeader,
    color: M3Colors.onSurface,
  },
  meta: {
    ...Typography.meta,
    color: M3Colors.outline,
  },
  note: {
    ...Typography.body,
    color: M3Colors.onSurfaceVariant,
  },
  link: {
    ...Typography.listTitle,
    color: M3Colors.primary,
    paddingVertical: 10,
  },
});
