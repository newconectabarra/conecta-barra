import { useEffect, useState } from "react";
import { AppState, Platform, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/pressable";
import * as Updates from "expo-updates";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BRAND } from "@/constants/brand";

/**
 * Atualizações reais por OTA (EAS Update): verifica ao abrir e ao voltar ao app, baixa em segundo plano e
 * oferece "Reiniciar agora". Só ativa em builds de release (em desenvolvimento o expo-updates fica desligado).
 */
export function UpdateBanner() {
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web" || __DEV__ || !Updates.isEnabled) return;
    let running = false;
    const check = async () => {
      if (running) return; running = true;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) { await Updates.fetchUpdateAsync(); setReady(true); }
      } catch (error) { console.warn("[Update] Falha ao verificar atualização:", error); } finally { running = false; }
    };
    void check();
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") void check(); });
    return () => sub.remove();
  }, []);

  if (!ready) return null;
  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]}>
      <Text style={styles.text}>Nova versão do Conecta Barra pronta.</Text>
      <Pressable disabled={busy} onPress={() => { setBusy(true); void Updates.reloadAsync(); }} style={styles.btn}><Text style={styles.btnText}>{busy ? "Reiniciando…" : "Reiniciar agora"}</Text></Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 14, right: 14, zIndex: 50, backgroundColor: BRAND.navy, borderRadius: 18, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, elevation: 10 },
  text: { color: "#FFFFFF", fontWeight: "700", flex: 1, fontSize: 13 },
  btn: { backgroundColor: "#38A6FF", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  btnText: { color: "#062B5E", fontWeight: "900", fontSize: 12 },
});
