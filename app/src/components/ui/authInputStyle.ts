// The text input look shared by the auth screens (legacy auth.tsx, baseline 01 and 02).
import type { TextStyle } from 'react-native';

import { M3Colors, Radius } from '../../theme';

export const authInputStyle: TextStyle = {
  height: 48,
  borderWidth: 1,
  borderColor: M3Colors.outlineVariant,
  borderRadius: Radius.lg,
  paddingHorizontal: 16,
  fontSize: 16,
  color: M3Colors.onSurface,
  backgroundColor: M3Colors.surfaceContainerLow,
};
