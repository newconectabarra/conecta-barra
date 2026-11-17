import * as Network from "expo-network";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { listOfflineMutations } from "@/lib/offline-cache";
import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/pressable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/use-colors";

/**
 * Non-blocking global network indicator. It deliberately relies on
 * isInternetReachable instead of isConnected so Wi-Fi without internet is
 * reported as offline. Retry invalidates active server queries after the user
 * requests a fresh synchronization.
 */
export function NetworkStatusBanner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const networkState = Network.useNetworkState();
  const [retrying, setRetrying] = useState(false);
  const [pendingMutations, setPendingMutations] = useState(0);
  const isOffline = networkState.isInternetReachable === false || networkState.isConnected === false;

  useEffect(() => {
    let active = true;
    const refreshQueue = async () => {
      const queue = await listOfflineMutations();
      if (active) setPendingMutations(queue.length);
    };
    void refreshQueue();
    const timer = setInterval(() => void refreshQueue(), 2_000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  if (!isOffline && pendingMutations === 0) return null;

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await queryClient.refetchQueries({ type: "active" });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.container, { top: Math.max(insets.top, 8), backgroundColor: colors.error }]}
    >
      <View style={styles.copy}>
        <Text style={styles.title}>{isOffline ? "Sem conexão com a internet" : "Sincronização pendente"}</Text>
        <Text style={styles.message}>{isOffline ? "Os dados podem estar desatualizados. A sincronização será retomada quando a rede voltar." : `${pendingMutations} ação(ões) aguardando sincronização automática.`}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Tentar sincronizar novamente" accessibilityState={{ disabled: retrying }} onPress={() => void retry()} disabled={retrying} style={({ pressed }) => [styles.retry, pressed && styles.pressed, retrying && styles.disabled]}>
        <Text style={styles.retryText}>{retrying ? "Tentando…" : "Tentar novamente"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 100,
    elevation: 8,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  copy: { flex: 1 },
  title: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },
  message: {
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  retry: {
    alignSelf: "flex-start",
    minHeight: 36,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.6 },
});
