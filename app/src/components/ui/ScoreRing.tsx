// 0–100 score ring in the grade colour (THEME.md › ScoreRing). Unscored shows the track and "–".
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { AppColors, FontWeight, gradeToColor } from '../../theme';

interface ScoreRingProps {
  /** Null when the item has never been scored. */
  score: number | null | undefined;
  grade: string | null | undefined;
  size?: number;
  strokeWidth?: number;
  testID?: string;
}

export function ScoreRing({ score, grade, size = 64, strokeWidth = 5, testID }: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const hasScore = typeof score === 'number' && Number.isFinite(score);
  const clamped = hasScore ? Math.round(Math.max(0, Math.min(100, score))) : 0;
  const progress = (clamped / 100) * circumference;
  const color = hasScore ? gradeToColor(grade) : AppColors.scoreRingTrack;

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      accessibilityLabel={hasScore ? `Score ${clamped} of 100` : 'Not rated'}
      testID={testID}
    >
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={AppColors.scoreRingTrack}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {hasScore && clamped > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${progress} ${circumference - progress}`}
            strokeDashoffset={circumference / 4}
            strokeLinecap="round"
          />
        )}
      </Svg>
      <View style={styles.label}>
        <Text
          style={[
            styles.scoreText,
            { fontSize: size * 0.25, color: hasScore ? color : AppColors.textMuted },
          ]}
        >
          {hasScore ? clamped : '–'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // With the quarter dash offset above, the arc starts at 9 o'clock, as in the legacy baselines.
  svg: {
    transform: [{ rotate: '-90deg' }],
  },
  label: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontWeight: FontWeight.bold,
  },
});
