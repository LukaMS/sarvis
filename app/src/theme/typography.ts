// System fonts only (D-015). The look comes from weight and size (THEME.md › Type scale).
import type { TextStyle } from 'react-native';

type TypeRole = Pick<
  TextStyle,
  'fontSize' | 'fontWeight' | 'letterSpacing' | 'lineHeight' | 'textTransform'
>;

export const FontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
  black: '900',
} as const;

export const Typography = {
  heroTitle: { fontSize: 36, fontWeight: FontWeight.black, letterSpacing: -0.5 },
  authTitle: { fontSize: 28, fontWeight: FontWeight.bold },
  largeCardTitle: { fontSize: 24, fontWeight: FontWeight.black },
  wordmark: { fontSize: 20, fontWeight: FontWeight.black, letterSpacing: -0.3 },
  sectionHeader: { fontSize: 20, fontWeight: FontWeight.bold },
  cardTitle: { fontSize: 17, fontWeight: FontWeight.bold },
  listTitle: { fontSize: 15, fontWeight: FontWeight.semibold },
  body: { fontSize: 14, fontWeight: FontWeight.regular, lineHeight: 20 },
  secondary: { fontSize: 13, fontWeight: FontWeight.regular, lineHeight: 18 },
  meta: { fontSize: 12, fontWeight: FontWeight.regular },
  kicker: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  chipLabel: {
    fontSize: 10,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
} as const satisfies Record<string, TypeRole>;
