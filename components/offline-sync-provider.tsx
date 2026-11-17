import * as Network from "expo-network";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { restoreOfflineCache, subscribeOfflineCache, listOfflineMutations, drainOfflineMutations } from "@/lib/offline-cache";

export function OfflineSyncProvider() {
  const queryClient = useQueryClient();
  const networkState = Network.useNetworkState();
  const previousReachability = useRef<boolean | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let active = true;
    void restoreOfflineCache(queryClient).finally(() => {
      if (active) setRestored(true);
    });
    return () => { active = false; };
  }, [queryClient]);

  useEffect(() => subscribeOfflineCache(queryClient), [queryClient]);

  useEffect(() => {
    if (!restored) return;
    const reachable = networkState.isInternetReachable !== false && networkState.isConnected !== false;
    const wasOffline = previousReachability.current === false;
    previousReachability.current = reachable;
    if (!reachable || !wasOffline) return;
    void drainOfflineMutations().finally(() => queryClient.refetchQueries({ type: "active" }));
  }, [networkState.isConnected, networkState.isInternetReachable, queryClient, restored]);

  return null;
}

export async function getOfflineStatus() {
  const network = await Network.getNetworkStateAsync();
  const reachable = network.isInternetReachable !== false && network.isConnected !== false;
  const queue = await listOfflineMutations();
  return { reachable, pendingMutations: queue.length, platform: Platform.OS };
}

export function invalidateOfflineQueries(queryClient: QueryClient) {
  return queryClient.refetchQueries({ type: "active" });
}
