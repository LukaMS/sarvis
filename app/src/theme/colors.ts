// Colour tokens from docs/legacy/THEME.md. Only tokens legacy actually renders are kept (uses > 0).

/** Material 3 roles from the Stitch export (legacy `M3Colors`). */
export const M3Colors = {
  primary: '#173809',
  onPrimary: '#ffffff',
  primaryContainer: '#2d4f1e',
  primaryFixed: '#c5efad',
  primaryFixedDim: '#a9d293',
  secondary: '#94492c',
  onSecondary: '#ffffff',
  secondaryContainer: '#fe9d7a',
  onSecondaryContainer: '#773318',
  secondaryFixed: '#ffdbcf',
  tertiary: '#2f330e',
  tertiaryContainer: '#454a23',
  onTertiaryContainer: '#b4b988',
  tertiaryFixed: '#e2e7b2',
  error: '#ba1a1a',
  errorContainer: '#ffdad6',
  surface: '#fcf9f4',
  onSurface: '#1c1c19',
  onSurfaceVariant: '#43493e',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f6f3ee',
  surfaceContainerHigh: '#ebe8e3',
  surfaceContainerHighest: '#e5e2dd',
  outline: '#73796d',
  outlineVariant: '#c3c8bb',
  inverseSurface: '#31302d',
  inverseOnSurface: '#f3f0eb',
} as const;

/** Semantic aliases legacy uses, plus the colours it hard-codes outside the tokens. */
export const AppColors = {
  scoreRingTrack: M3Colors.outlineVariant,
  textMuted: M3Colors.outline,
  storyOverlay: 'rgba(23, 56, 9, 0.65)',
  /** Legacy `AppColors.tabInactive` pointed at outline, but the tab bar renders this. */
  tabInactive: 'rgba(28, 28, 25, 0.45)',
  scanBackdrop: 'rgba(0, 0, 0, 0.6)',
  coverGradientTop: 'rgba(0, 0, 0, 0.55)',
  statusBarScrimTail: 'rgba(252, 249, 244, 0)',
  scannerLaser: '#7CFC00',
} as const;

/** Hex alpha suffixes: badges and pills tint their colour at ~9%, pills on images at 25%. */
export const TintAlpha = {
  badge: '18',
  imagePill: '40',
} as const;

/** Appends a two-digit hex alpha to a `#rrggbb` colour, as legacy does (`color + "18"`). */
export function withAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`;
}
