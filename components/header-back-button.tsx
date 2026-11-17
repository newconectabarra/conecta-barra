import { StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { Pressable } from "@/components/pressable";
import { trpc } from "@/lib/trpc";

export function HeaderBackButton() {
  const me = trpc.auth.me.useQuery(undefined, { staleTime: 60_000, retry: false });
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(me.data?.role === "admin" ? "/admin" : "/(tabs)");
  };

  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={goBack} hitSlop={10} style={styles.button}>
      <Text style={styles.arrow}>‹</Text>
      <Text style={styles.label}>Voltar</Text>
    </Pressable>
  );
}

// Botão em "pílula" translúcida: mais visível e fácil de tocar sobre o cabeçalho azul.
const styles = StyleSheet.create({
  button: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 10, paddingRight: 14, borderRadius: 999, backgroundColor: "#FFFFFF24" },
  arrow: { color: "#FFFFFF", fontSize: 26, lineHeight: 28, fontWeight: "400", marginTop: -2 },
  label: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
});
