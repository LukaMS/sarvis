// Pressable that springs down while pressed (THEME.md › PressableScale). Uses RN Animated, not Reanimated (D-023).
import { useRef } from 'react';
import {
  Animated,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SPRING = { damping: 20, stiffness: 300, mass: 1, useNativeDriver: true } as const;

interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Scale applied while pressed. Default 0.97. */
  activeScale?: number;
}

export function PressableScale({
  style,
  activeScale = 0.97,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const springTo = (toValue: number) => Animated.spring(scale, { toValue, ...SPRING }).start();

  return (
    <AnimatedPressable
      {...rest}
      // The style (margins included) sits on the Pressable, so the touch area matches the card.
      style={[style, { transform: [{ scale }] }]}
      onPressIn={(e: GestureResponderEvent) => {
        springTo(activeScale);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        springTo(1);
        onPressOut?.(e);
      }}
    />
  );
}
