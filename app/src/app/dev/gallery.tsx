// Dev-only component gallery for screenshot checks. Production builds redirect to the home route.
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, type FriendlyError } from '../../components/ui/ErrorState';
import { FilterChips } from '../../components/ui/FilterChips';
import { GradeBadge, type GradeBadgeSize } from '../../components/ui/GradeBadge';
import { PressableScale } from '../../components/ui/PressableScale';
import { RatingPill } from '../../components/ui/RatingPill';
import { ScoreRing } from '../../components/ui/ScoreRing';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { StatusBarScrim } from '../../components/ui/StatusBarScrim';
import {
  FontWeight,
  GRADES,
  M3Colors,
  RATINGS,
  Radius,
  Spacing,
  Typography,
  scoreToGrade,
} from '../../theme';

const BADGE_SIZES: GradeBadgeSize[] = ['sm', 'md', 'lg'];

/** Ring sizes legacy uses (THEME.md › ScoreRing), plus the 64 / 5 default. */
const RING_SIZES = [
  { size: 100, strokeWidth: 7 },
  { size: 80, strokeWidth: 6 },
  { size: 64, strokeWidth: 5 },
  { size: 48, strokeWidth: 4 },
  { size: 40, strokeWidth: 3 },
];

const RING_SCORES = [97, 78, 55, 25, 5, 0];

const HISTORY_FILTERS = ['All', 'Barcode', 'Receipt'] as const;
const SEARCH_FILTERS = ['All', 'Products', 'Companies'] as const;

const OFFLINE_ERROR: FriendlyError = {
  kind: 'offline',
  title: 'You are offline',
  message: 'Check your connection and try again.',
  retryable: true,
};

const NOT_FOUND_ERROR: FriendlyError = {
  kind: 'notFound',
  title: 'We could not find that',
  message: 'It may have been removed from the catalogue.',
  retryable: false,
};

export default function Gallery() {
  if (!__DEV__) return <Redirect href="/" />;
  return <GalleryContent />;
}

function GalleryContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [actionPresses, setActionPresses] = useState(0);
  const [buttonPresses, setButtonPresses] = useState(0);
  const [cardPresses, setCardPresses] = useState(0);
  const [retries, setRetries] = useState(0);
  const [historyFilter, setHistoryFilter] = useState<(typeof HISTORY_FILTERS)[number]>('All');
  const [searchFilter, setSearchFilter] = useState<(typeof SEARCH_FILTERS)[number]>('All');
  const pressButton = () => setButtonPresses((n) => n + 1);
  const pressCard = () => setCardPresses((n) => n + 1);
  const retry = () => setRetries((n) => n + 1);

  return (
    <View style={styles.screen}>
      <StatusBarScrim testID="gallery-status-bar-scrim" />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 48 }}
        testID="gallery"
      >
        <Text style={styles.hero}>Gallery</Text>

        <SectionHeader title="GradeBadge" testID="gallery-section-grade-badge" />
        {BADGE_SIZES.map((size) => (
          <View key={size} style={styles.card}>
            <Text style={styles.caption}>{size}</Text>
            <View style={styles.wrapRow}>
              {GRADES.map((grade) => (
                <GradeBadge
                  key={grade}
                  grade={grade}
                  size={size}
                  testID={`gallery-grade-badge-${size}-${grade}`}
                />
              ))}
              <GradeBadge grade={null} size={size} testID={`gallery-grade-badge-${size}-unrated`} />
            </View>
          </View>
        ))}

        <SectionHeader title="RatingPill" testID="gallery-section-rating-pill" />
        <View style={styles.card}>
          <View style={styles.wrapRow}>
            {RATINGS.map((rating) => (
              <RatingPill key={rating} rating={rating} testID={`gallery-rating-pill-${rating}`} />
            ))}
            <RatingPill rating={null} testID="gallery-rating-pill-unrated" />
          </View>
        </View>

        <SectionHeader title="ScoreRing" testID="gallery-section-score-ring" />
        {RING_SIZES.map(({ size, strokeWidth }) => (
          <View key={size} style={styles.card}>
            <Text style={styles.caption}>
              {size} / {strokeWidth}
            </Text>
            <View style={styles.wrapRow}>
              {RING_SCORES.map((score) => (
                <ScoreRing
                  key={score}
                  score={score}
                  grade={scoreToGrade(score)}
                  size={size}
                  strokeWidth={strokeWidth}
                  testID={`gallery-score-ring-${size}-${score}`}
                />
              ))}
              <ScoreRing
                score={null}
                grade={null}
                size={size}
                strokeWidth={strokeWidth}
                testID={`gallery-score-ring-${size}-unscored`}
              />
            </View>
          </View>
        ))}

        <SectionHeader title="SectionHeader" testID="gallery-section-section-header" />
        <View style={styles.flushCard}>
          <SectionHeader title="Recent Scans" testID="gallery-section-header-plain" />
          <SectionHeader
            title="Ethical Breakdown"
            actionText="See all"
            onAction={() => setActionPresses((n) => n + 1)}
            testID="gallery-section-header-action"
          />
          <Text style={[styles.caption, styles.gutter]} testID="gallery-section-header-presses">
            Action pressed {actionPresses} times
          </Text>
        </View>

        <SectionHeader title="Button" testID="gallery-section-button" />
        <View style={styles.card}>
          <Text style={styles.caption}>pill</Text>
          <View style={styles.wrapRow}>
            <Button label="Primary" onPress={pressButton} testID="gallery-button-primary" />
            <Button
              label="Request"
              icon="plus"
              onPress={pressButton}
              testID="gallery-button-primary-icon"
            />
            <Button
              label="Secondary"
              variant="secondary"
              onPress={pressButton}
              testID="gallery-button-secondary"
            />
            <Button
              label="Text"
              variant="text"
              onPress={pressButton}
              testID="gallery-button-text"
            />
            <Button
              label="Sign Out"
              variant="text"
              icon="logout"
              destructive
              onPress={pressButton}
              testID="gallery-button-destructive"
            />
            <Button
              label="Disabled"
              disabled
              onPress={pressButton}
              testID="gallery-button-disabled"
            />
            <Button label="Loading" loading onPress={pressButton} testID="gallery-button-loading" />
          </View>
          <Text style={styles.caption}>block</Text>
          <Button
            label="Sign In"
            shape="block"
            onPress={pressButton}
            testID="gallery-button-block-primary"
          />
          <Button
            label="Continue with Google"
            shape="block"
            variant="secondary"
            onPress={pressButton}
            testID="gallery-button-block-secondary"
          />
          <Text style={styles.caption} testID="gallery-button-presses">
            Buttons pressed {buttonPresses} times
          </Text>
        </View>

        <SectionHeader title="FilterChips" testID="gallery-section-filter-chips" />
        <View style={styles.flushCard}>
          <FilterChips
            options={HISTORY_FILTERS}
            selected={historyFilter}
            onSelect={setHistoryFilter}
            labelFor={(option) => `Show ${option.toLowerCase()} scans`}
            testID="gallery-chips-history"
          />
          <Text
            style={[styles.caption, styles.gutter, styles.stateCaption]}
            testID="gallery-chips-history-selected"
          >
            History filter: {historyFilter}
          </Text>
          <FilterChips
            options={SEARCH_FILTERS}
            selected={searchFilter}
            onSelect={setSearchFilter}
            testID="gallery-chips-search"
          />
          <Text
            style={[styles.caption, styles.gutter, styles.stateCaption]}
            testID="gallery-chips-search-selected"
          >
            Search filter: {searchFilter}
          </Text>
        </View>

        <SectionHeader title="Card · PressableScale" testID="gallery-section-card" />
        <Card style={styles.inset} testID="gallery-card-static">
          <Text style={styles.cardTitle}>Static card</Text>
          <Text style={styles.caption}>White, radius 16, padding 16, no shadow.</Text>
        </Card>
        <Card
          style={styles.inset}
          onPress={pressCard}
          accessibilityLabel="Pressable card"
          testID="gallery-card-pressable"
        >
          <Text style={styles.cardTitle}>Pressable card</Text>
          <Text style={styles.caption} testID="gallery-card-presses">
            Cards pressed {cardPresses} times
          </Text>
        </Card>
        <PressableScale
          style={[styles.bento, styles.inset]}
          onPress={pressCard}
          accessibilityRole="button"
          accessibilityLabel="Bento card"
          testID="gallery-pressable-scale"
        >
          <Text style={styles.bentoTitle}>PressableScale</Text>
          <Text style={styles.bentoText}>Springs to 0.97 while pressed.</Text>
        </PressableScale>

        <SectionHeader title="EmptyState" testID="gallery-section-empty-state" />
        <View style={styles.flushCard}>
          <EmptyState
            icon="magnify"
            title="No results found"
            message={'Nothing matches "zzqx" yet. Our catalogue is still growing.'}
            testID="gallery-empty-state"
          />
          <EmptyState title="Default icon" testID="gallery-empty-state-default" />
        </View>

        <SectionHeader title="ErrorState" testID="gallery-section-error-state" />
        <View style={styles.flushCard}>
          <ErrorState error={OFFLINE_ERROR} onRetry={retry} testID="gallery-error-state-offline" />
          <ErrorState
            error={NOT_FOUND_ERROR}
            onRetry={retry}
            testID="gallery-error-state-not-retryable"
          />
          <ErrorState
            error={{ ...OFFLINE_ERROR, kind: 'unknown', title: 'Something went wrong' }}
            onRetry={retry}
            compact
            testID="gallery-error-state-compact"
          />
          <Text
            style={[styles.caption, styles.gutter, styles.stateCaption]}
            testID="gallery-error-state-retries"
          >
            Retried {retries} times
          </Text>
        </View>

        <SectionHeader title="RouteErrorBoundary" testID="gallery-section-route-error-boundary" />
        <View style={styles.card}>
          <Text style={styles.caption}>Opens a screen that throws while rendering.</Text>
          <Button
            label="Open error test screen"
            variant="secondary"
            onPress={() => router.push('/dev/error-boundary')}
            testID="gallery-open-error-boundary"
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: M3Colors.surface,
  },
  hero: {
    ...Typography.heroTitle,
    color: M3Colors.primary,
    paddingHorizontal: Spacing.screenGutter,
    marginBottom: Spacing.sectionGap,
  },
  card: {
    backgroundColor: M3Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    marginHorizontal: Spacing.screenGutter,
    marginBottom: Spacing.listRowGap,
    padding: 14,
    gap: 10,
  },
  flushCard: {
    backgroundColor: M3Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    marginHorizontal: Spacing.screenGutter,
    marginBottom: Spacing.listRowGap,
    paddingVertical: 14,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  caption: {
    ...Typography.meta,
    color: M3Colors.outline,
  },
  gutter: {
    paddingHorizontal: Spacing.screenGutter,
  },
  stateCaption: {
    marginTop: 8,
    marginBottom: 12,
  },
  inset: {
    marginHorizontal: Spacing.screenGutter,
    marginBottom: Spacing.listRowGap,
  },
  cardTitle: {
    ...Typography.listTitle,
    color: M3Colors.onSurface,
    marginBottom: 4,
  },
  // Scan-tab bento card look (THEME.md › Screen-level patterns), without the aspect ratio.
  bento: {
    backgroundColor: M3Colors.primary,
    borderRadius: Radius.xl,
    padding: 24,
    gap: 8,
  },
  bentoTitle: {
    fontSize: 20,
    fontWeight: FontWeight.bold,
    color: M3Colors.onPrimary,
  },
  bentoText: {
    fontSize: 13,
    fontWeight: FontWeight.medium,
    color: 'rgba(255, 255, 255, 0.8)',
  },
});
