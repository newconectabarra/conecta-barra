import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BRAND } from "@/constants/brand";

/** Cabeçalho azul → azul claro com cantos inferiores arredondados. */
export function GradientHeader({ children, style, minHeight = 150 }: { children: React.ReactNode; style?: ViewStyle; minHeight?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={BRAND.gradient} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: insets.top + 14, minHeight }, style]}>
      <View style={styles.bubble1} /><View style={styles.bubble2} /><View style={styles.bubble3} />
      {children}
    </LinearGradient>
  );
}
const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 26, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: "hidden" },
  bubble1: { position: "absolute", right: -40, top: -30, width: 170, height: 170, borderRadius: 85, backgroundColor: "#FFFFFF14" },
  bubble3: { position: "absolute", right: 60, bottom: -40, width: 90, height: 90, borderRadius: 45, backgroundColor: "#FFFFFF0C" },
  bubble2: { position: "absolute", left: -50, bottom: -70, width: 150, height: 150, borderRadius: 75, backgroundColor: "#FFFFFF10" },
});
