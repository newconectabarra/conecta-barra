import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { subscribeAuthChange } from "@/lib/_core/auth";
import * as Auth from "@/lib/_core/auth";
import { realtime, type RealtimeStatus } from "@/lib/realtime";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";

/** Mantém o canal de tempo real ligado enquanto houver sessão e recarrega só o que mudou. */
export function RealtimeProvider() {
  const utils = trpc.useUtils();

  useEffect(() => {
    const sync = async () => { (await Auth.getSessionToken()) ? realtime.start() : realtime.stop(); };
    void sync();
    const unsubscribeAuth = subscribeAuthChange(() => { realtime.stop(); void sync(); });
    const unsubscribeScopes = realtime.onScopes((scopes) => {
      const set = new Set(scopes);
      if (set.has("requests")) void utils.requests.invalidate();
      if (set.has("suggestions")) void utils.suggestions.invalidate();
      if (set.has("announcements")) void utils.announcements.invalidate();
      if (set.has("notifications")) void utils.notifications.invalidate();
      if (set.has("residents")) { void utils.residents.invalidate(); void utils.users.invalidate(); }
      if (set.has("dashboard")) { void utils.admin.invalidate(); void utils.neighborhoods.overview.invalidate(); }
      if (set.has("neighborhoods")) void utils.neighborhoods.invalidate();
      if (set.has("social")) void utils.social.invalidate();
      if (set.has("me")) void utils.auth.me.invalidate();
    });
    return () => { unsubscribeAuth(); unsubscribeScopes(); realtime.stop(); };
  }, [utils]);

  return null;
}

export function useRealtimeStatus(): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>(realtime.getStatus());
  useEffect(() => realtime.onStatus(setStatus), []);
  return status;
}

/** Selo “Ao vivo” para cabeçalhos. */
export function LiveBadge() {
  const status = useRealtimeStatus();
  const colors = useColors();
  if (status === "idle") return null; // sem sessão iniciada: não há tempo real para mostrar
  const color = status === "live" ? "#35E0A1" : status === "connecting" ? "#FFC857" : "#9FB3CF";
  const label = status === "live" ? "Ao vivo" : status === "connecting" ? "Conectando…" : "Sem tempo real";
  return (
    <View style={[styles.badge, { backgroundColor: "#FFFFFF22" }]} accessibilityLabel={`Atualizações em tempo real: ${label}`}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color: "#FFFFFF" }]}>{label}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 11, fontWeight: "800" },
});
