// Legacy had no spacing scale; these are the literal values it uses consistently (THEME.md › Spacing).
export const Spacing = {
  /** Horizontal padding of every screen, and the side margin of cards. */
  screenGutter: 24,
  /** Added to the top safe-area inset on tab screens. */
  tabScreenTop: 16,
  /** Added to the bottom safe-area inset so content clears the floating tab bar. */
  tabBarClearance: 96,
  listRowGap: 8,
  storyCardGap: 12,
  sectionGap: 24,
  scanSectionGap: 40,
} as const;
