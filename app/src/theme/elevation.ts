// Flat design: cards have no shadow. Only these two exist in legacy (THEME.md › Elevation).
import { AppColors, M3Colors } from './colors';

export const Elevation = {
  /** Upward shadow on the floating tab bar. `elevation: 0`, so it shows on iOS and web only. */
  tabBar: {
    shadowColor: M3Colors.onSurface,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 0,
  },
  scannerLaserGlow: {
    shadowColor: AppColors.scannerLaser,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
} as const;
