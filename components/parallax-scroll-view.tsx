import { ReactElement, PropsWithChildren, useRef } from "react";
import { Animated, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/use-colors";

const HEADER_HEIGHT = 250;

type Props = PropsWithChildren<{
  headerImage: ReactElement;
  headerBackgroundColor?: string;
}>;

/**
 * Scroll view com cabeçalho em paralaxe usando apenas Animated nativo.
 * A implementação não depende de Reanimated ou Worklets.
 */
export default function ParallaxScrollView({
  children,
  headerImage,
  headerBackgroundColor,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const scrollOffset = useRef(new Animated.Value(0)).current;
  const headerHeight = HEADER_HEIGHT + insets.top;

  const translateY = scrollOffset.interpolate({
    inputRange: [-headerHeight, 0, headerHeight],
    outputRange: [-headerHeight / 2, 0, headerHeight * 0.75],
    extrapolate: "clamp",
  });
  const scale = scrollOffset.interpolate({
    inputRange: [-headerHeight, 0, headerHeight],
    outputRange: [2, 1, 1],
    extrapolate: "clamp",
  });

  return (
    <Animated.ScrollView
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollOffset } } }], {
        useNativeDriver: true,
      })}
      scrollEventThrottle={16}
      style={{ backgroundColor: colors.background, flex: 1 }}
      contentContainerStyle={{
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <Animated.View
        style={{
          overflow: "hidden",
          backgroundColor: headerBackgroundColor ?? colors.primary,
          height: headerHeight,
          paddingTop: insets.top,
          transform: [{ translateY }, { scale }],
        }}
      >
        {headerImage}
      </Animated.View>
      <View className="flex-1 gap-4 overflow-hidden bg-background p-8">{children}</View>
    </Animated.ScrollView>
  );
}
