import { StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GradientHeader } from "@/components/gradient-header";

/** Cabeçalho visual de conteúdo; a navegação de retorno fica no cabeçalho global do app. */
export function PageHeader({ kicker, title, subtitle, right }: { kicker?: string; title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <>
      <StatusBar style="light" />
      <GradientHeader minHeight={right ? 138 : 120} style={{ paddingBottom: 22 }}>
        {right && <View style={styles.top}><View />{right}</View>}
        {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </GradientHeader>
    </>
  );
}
const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, minHeight: 36 },
  kicker: { color: "#DDF0FF", fontWeight: "900", fontSize: 11, letterSpacing: 1.2, marginBottom: 2 },
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "900", letterSpacing: -0.4 },
  sub: { color: "#DDF0FF", fontSize: 14, marginTop: 4, lineHeight: 20 },
});
