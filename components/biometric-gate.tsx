import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/pressable";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { LinearGradient } from "expo-linear-gradient";
import { getSessionToken, removeSessionToken, clearUserInfo } from "@/lib/_core/auth";
import { AppMark } from "@/components/brand-logo";
import { BRAND } from "@/constants/brand";
import { router } from "expo-router";

const LOCK_KEY = "conecta_app_lock";
const LOCK_AFTER_MS = 30_000;

export async function isAppLockEnabled() {
  if (Platform.OS === "web") return false;
  return (await SecureStore.getItemAsync(LOCK_KEY)) === "1";
}
export async function setAppLockEnabled(enabled: boolean) {
  if (Platform.OS === "web") return;
  if (enabled) await SecureStore.setItemAsync(LOCK_KEY, "1"); else await SecureStore.deleteItemAsync(LOCK_KEY);
}

/**
 * Bloqueio por biometria: ao abrir o app (com sessão salva) e ao voltar depois de 30 s em segundo plano,
 * pede digital/rosto (ou PIN do aparelho). Ativação em Conta → Segurança.
 */
export function BiometricGate() {
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Desbloquear o Conecta Barra", cancelLabel: "Cancelar", fallbackLabel: "Usar PIN", disableDeviceFallback: false });
      if (result.success) setLocked(false);
    } finally { setBusy(false); }
  }, [busy]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    void (async () => { if ((await isAppLockEnabled()) && (await getSessionToken())) { setLocked(true); } })();
    const sub = AppState.addEventListener("change", async (state) => {
      if (state === "background" || state === "inactive") { if (backgroundedAt.current === null) backgroundedAt.current = Date.now(); return; }
      if (state === "active" && backgroundedAt.current !== null) {
        const away = Date.now() - backgroundedAt.current; backgroundedAt.current = null;
        if (away > LOCK_AFTER_MS && (await isAppLockEnabled()) && (await getSessionToken())) setLocked(true);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => { if (locked) void unlock(); }, [locked]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!locked) return null;
  return (
    <LinearGradient colors={BRAND.gradient} style={styles.overlay}>
      <AppMark size={92} />
      <Text style={styles.title}>Conecta Barra</Text>
      <Text style={styles.sub}>Confirme sua identidade para continuar</Text>
      <Pressable accessibilityRole="button" onPress={() => void unlock()} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.8 }]}><Text style={styles.btnText}>{busy ? "Verificando…" : "Usar biometria"}</Text></Pressable>
      <Pressable onPress={() => { void (async () => { await removeSessionToken(); await clearUserInfo(); setLocked(false); router.replace("/login"); })(); }}><Text style={styles.link}>Entrar com outra conta</Text></Pressable>
    </LinearGradient>
  );
}
const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 999, alignItems: "center", justifyContent: "center", gap: 14, padding: 30 },
  title: { color: "#FFFFFF", fontSize: 28, fontWeight: "900", marginTop: 6 },
  sub: { color: "#DDF0FF", fontSize: 15, textAlign: "center" },
  btn: { backgroundColor: "#FFFFFF", borderRadius: 18, paddingHorizontal: 30, paddingVertical: 15, marginTop: 14 },
  btnText: { color: BRAND.navy, fontWeight: "900", fontSize: 16 },
  link: { color: "#FFFFFF", fontWeight: "700", marginTop: 10, textDecorationLine: "underline" },
});
