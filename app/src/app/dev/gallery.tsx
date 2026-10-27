// Dev-only component gallery for screenshot checks. Production builds redirect to the home route.
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradeBadge, type GradeBadgeSize } from '../../components/ui/GradeBadge';
import { RatingPill } from '../../components/ui/RatingPill';
import { ScoreRing } from '../../components/ui/ScoreRing';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { GRADES, M3Colors, RATINGS, Radius, Spacing, Typography, scoreToGrade } from '../../theme';

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

export default function Gallery() {
  if (!__DEV__) return <Redirect href="/" />;
  return <GalleryContent />;
}

function GalleryContent() {
  const insets = useSafeAreaInsets();
  const [actionPresses, setActionPresses] = useState(0);

  return (
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
    </ScrollView>
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
});
