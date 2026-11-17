import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/pressable";
import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { BRAND } from "@/constants/brand";
import { useColors } from "@/hooks/use-colors";

type IconName = React.ComponentProps<typeof IconSymbol>["name"];
const ICONS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: "house.fill", label: "Início" },
  requests: { icon: "list.bullet.rectangle.fill", label: "Pedidos" },
  portal: { icon: "building.2.fill", label: "Portal local" },
  notifications: { icon: "bell.fill", label: "Avisos" },
  profile: { icon: "person.crop.circle.fill", label: "Conta" },
};

/** Barra de navegação flutuante, arredondada, com pílula animada na aba ativa e badge de avisos. */
export function FloatingTabBar({ state, navigation, badges }: BottomTabBarProps & { badges?: Record<string, number> }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const visible = state.routes.filter((route) => ICONS[route.name]);
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={[styles.bar, { backgroundColor: colors.surface + "F5", borderColor: colors.border }]}>
        {visible.map((route) => {
          const focused = state.routes[state.index]?.key === route.key;
          const meta = ICONS[route.name];
          const badge = badges?.[route.name] ?? 0;
          return (
            <TabItem key={route.key} focused={focused} icon={meta.icon} label={meta.label} badge={badge}
              onPress={() => {
                void Haptics.selectionAsync().catch(() => undefined);
                const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
              }}
              onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })} />
          );
        })}
      </View>
    </View>
  );
}

function TabItem({ focused, icon, label, badge, onPress, onLongPress }: { focused: boolean; icon: IconName; label: string; badge: number; onPress: () => void; onLongPress: () => void }) {
  const colors = useColors();
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: focused ? 1 : 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [focused, progress]);
  const width = progress.interpolate({ inputRange: [0, 1], outputRange: [48, 118] });
  const bg = progress.interpolate({ inputRange: [0, 1], outputRange: ["rgba(11,95,216,0)", BRAND.blue] });
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={badge ? `${label}, ${badge} novos` : label} onPress={onPress} onLongPress={onLongPress} hitSlop={4}>
      <Animated.View style={[styles.item, { width, backgroundColor: bg }]}>
        <View>
          <Animated.View style={{ transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }}><IconSymbol name={icon} size={23} color={focused ? "#FFFFFF" : colors.muted} /></Animated.View>
          {badge > 0 && !focused && <View style={[styles.badge, { backgroundColor: colors.error }]}><Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text></View>}
        </View>
        {focused && <Text numberOfLines={1} style={styles.label}>{label}</Text>}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", paddingHorizontal: 14 },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", maxWidth: 460, borderRadius: 34, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 8, shadowColor: "#062B5E", shadowOpacity: 0.26, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: Platform.OS === "android" ? 14 : 0 },
  item: { height: 48, borderRadius: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, overflow: "hidden" },
  label: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "800", letterSpacing: 0.1 },
  badge: { position: "absolute", top: -7, right: -9, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 3, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#FFFFFF" },
  badgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
});
