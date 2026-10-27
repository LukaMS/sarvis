// Opaque band behind the status bar and camera cutout, with a 12 px fade (THEME.md › StatusBarScrim).
// The fade is an SVG gradient, so it needs no expo-linear-gradient (D-023).
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { M3Colors } from '../../theme';

const FADE_HEIGHT = 12;

export function StatusBarScrim({ testID }: { testID?: string }) {
  const insets = useSafeAreaInsets();
  if (insets.top === 0) return null;

  return (
    <View
      style={[styles.container, { height: insets.top + FADE_HEIGHT }]}
      pointerEvents="none"
      testID={testID}
    >
      <View style={[styles.solid, { height: insets.top }]} />
      <Svg width="100%" height={FADE_HEIGHT}>
        <Defs>
          <LinearGradient id="statusBarScrimFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={M3Colors.surface} stopOpacity={1} />
            <Stop offset="1" stopColor={M3Colors.surface} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height={FADE_HEIGHT} fill="url(#statusBarScrimFade)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  solid: {
    backgroundColor: M3Colors.surface,
  },
});
