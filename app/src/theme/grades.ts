// Letter grades (D-004). Thresholds and colours match legacy `scoreToGrade` and `GradeColors`.
import { M3Colors } from './colors';

export const GRADES = [
  'A+',
  'A',
  'A-',
  'B+',
  'B',
  'B-',
  'C+',
  'C',
  'C-',
  'D+',
  'D',
  'D-',
  'F',
] as const;

export type Grade = (typeof GRADES)[number];

/** Lowest score (0–100) for each grade, best first. Anything below 10 is F. */
export const GRADE_THRESHOLDS: readonly (readonly [number, Grade])[] = [
  [95, 'A+'],
  [90, 'A'],
  [85, 'A-'],
  [80, 'B+'],
  [75, 'B'],
  [70, 'B-'],
  [60, 'C+'],
  [50, 'C'],
  [40, 'C-'],
  [30, 'D+'],
  [20, 'D'],
  [10, 'D-'],
];

export function scoreToGrade(score: number): Grade {
  for (const [min, grade] of GRADE_THRESHOLDS) {
    if (score >= min) return grade;
  }
  return 'F';
}

export const GradeColors: Record<Grade, string> = {
  'A+': M3Colors.primaryContainer,
  A: M3Colors.primaryContainer,
  'A-': M3Colors.primaryContainer,
  'B+': M3Colors.tertiaryContainer,
  B: M3Colors.tertiaryContainer,
  'B-': M3Colors.tertiaryContainer,
  'C+': M3Colors.secondary,
  C: M3Colors.secondary,
  'C-': M3Colors.secondary,
  'D+': M3Colors.onSecondaryContainer,
  D: M3Colors.onSecondaryContainer,
  'D-': M3Colors.onSecondaryContainer,
  F: M3Colors.error,
};

/** Colour for unknown or unrated grades. */
export const UNRATED_GRADE_COLOR = M3Colors.outline;

export function gradeToColor(grade: string | null | undefined): string {
  return (grade && GradeColors[grade as Grade]) || UNRATED_GRADE_COLOR;
}
