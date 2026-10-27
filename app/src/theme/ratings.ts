// Category ratings (D-004). Mixed text is terracotta but its card is olive: legacy does this, so it stays.
import { M3Colors } from './colors';

export const RATINGS = ['Good', 'Mixed', 'Poor'] as const;

export type Rating = (typeof RATINGS)[number];

export const RatingColors: Record<Rating, string> = {
  Good: M3Colors.primaryContainer,
  Mixed: M3Colors.secondary,
  Poor: M3Colors.error,
};

export const RatingBgColors: Record<Rating, string> = {
  Good: M3Colors.primaryFixed,
  Mixed: M3Colors.tertiaryFixed,
  Poor: M3Colors.errorContainer,
};

export const UNRATED_RATING_COLOR = M3Colors.outline;
export const UNRATED_RATING_BG_COLOR = M3Colors.surfaceContainerHigh;

export function ratingToColor(rating: string | null | undefined): string {
  return (rating && RatingColors[rating as Rating]) || UNRATED_RATING_COLOR;
}

export function ratingToBgColor(rating: string | null | undefined): string {
  return (rating && RatingBgColors[rating as Rating]) || UNRATED_RATING_BG_COLOR;
}
