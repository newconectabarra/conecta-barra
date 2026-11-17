import { useEffect, useState } from "react";
import { Alert, Platform, StyleSheet, Switch, Text, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { isAppLockEnabled, setAppLockEnabled } from "@/components/biometric-gate";

/** Liga/desliga o bloqueio do app por biometria (digital/rosto ou PIN do aparelho). */
export function AppLockCard() {
  const colors = useColors();
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    if (Platform.OS === "web") { setSupported(false); return; }
    void (async () => {
      setEnabled(await isAppLockEnabled());
      setSupported((await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync()));
    })();
  }, []);
  if (Platform.OS === "web") return null;
  const toggle = async (next: boolean) => {
    if (next) {
      const check = await LocalAuthentication.authenticateAsync({ promptMessage: "Confirme para ativar o bloqueio" });
      if (!check.success) return;
    }
    await setAppLockEnabled(next);
    setEnabled(next);
  };
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.icon, { backgroundColor: colors.primary + "16" }]}><IconSymbol name="fingerprint" size={24} color={colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.foreground }]}>Bloqueio por biometria</Text>
        <Text style={[styles.hint, { color: colors.muted }]}>{supported ? "Pede digital ou rosto ao abrir o app." : "Cadastre uma biometria ou PIN nas configurações do Android para usar."}</Text>
      </View>
      <Switch value={enabled} disabled={!supported} onValueChange={(v) => void toggle(v).catch(() => Alert.alert("Biometria", "Não foi possível alterar o bloqueio."))} trackColor={{ true: colors.primary }} />
    </View>
  );
}
const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 24, padding: 14, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  icon: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: "900" },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 2 },
});
