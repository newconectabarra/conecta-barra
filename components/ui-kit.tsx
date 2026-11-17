import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

/** Entrada suave (desvanece + sobe) para blocos de tela. Use `delay` para escalonar itens. */
export function Reveal({ children, delay = 0, distance = 14, style }: { children: React.ReactNode; delay?: number; distance?: number; style?: StyleProp<ViewStyle> }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 380, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [delay, progress]);
  return (
    <Animated.View style={[style, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Bloco cinza pulsante usado enquanto o conteúdo carrega (no lugar do "spinner"). */
export function Skeleton({ height = 14, width = "100%", radius = 8, style }: { height?: number; width?: DimensionValue; radius?: number; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.95, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ height, width, borderRadius: radius, backgroundColor: colors.border, opacity: pulse }, style]} />;
}

/** Cartão de carregamento (avatar + linhas), imitando a forma do conteúdo final. */
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  const colors = useColors();
  return (
    <View style={[styles.skeletonCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Skeleton width={44} height={44} radius={14} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="60%" height={13} />
        {Array.from({ length: lines }).map((_, index) => <Skeleton key={index} width={index === lines - 1 ? "40%" : "90%"} height={11} />)}
      </View>
    </View>
  );
}

/** Estado vazio/erro com ícone em círculo suave. */
export function IconBadge({ name, color, size = 56 }: { name: React.ComponentProps<typeof IconSymbol>["name"]; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color + "18", alignItems: "center", justifyContent: "center" }}>
      <IconSymbol name={name} size={Math.round(size * 0.46)} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonCard: { flexDirection: "row", gap: 12, alignItems: "center", borderWidth: 1, borderRadius: 22, padding: 14, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
});
