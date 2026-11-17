import AsyncStorage from "@react-native-async-storage/async-storage";
import { dehydrate, hydrate, type QueryClient, type QueryKey } from "@tanstack/react-query";
import superjson from "superjson";
import { createTRPCClient } from "@/lib/trpc";

const CACHE_KEY = "conecta.offline.query-cache.v1";
const QUEUE_KEY = "conecta.offline.mutation-queue.v1";
const CACHEABLE_ROOTS = new Set(["auth", "announcements", "requests", "notifications", "users", "residents"]);

function isCacheableQueryKey(queryKey: QueryKey) {
  const serialized = JSON.stringify(queryKey);
  return [...CACHEABLE_ROOTS].some((root) => serialized.includes(`"${root}"`));
}

export async function restoreOfflineCache(queryClient: QueryClient) {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const persisted = superjson.parse<ReturnType<typeof dehydrate>>(raw);
    hydrate(queryClient, persisted);
    return true;
  } catch (error) {
    console.warn("[Offline] Could not restore cache:", error);
    return false;
  }
}

export function subscribeOfflineCache(queryClient: QueryClient) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const persist = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const state = dehydrate(queryClient, {
        shouldDehydrateQuery: (query) => isCacheableQueryKey(query.queryKey),
      });
      void AsyncStorage.setItem(CACHE_KEY, superjson.stringify(state)).catch((error) => console.warn("[Offline] Could not persist cache:", error));
    }, 250);
  };
  const unsubscribe = queryClient.getQueryCache().subscribe(persist);
  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}

export type OfflineMutation = {
  id: string;
  operation: string;
  payload: unknown;
  createdAt: string;
};

export async function listOfflineMutations() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [] as OfflineMutation[];
    const parsed = superjson.parse<OfflineMutation[]>(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as OfflineMutation[];
  }
}

export async function enqueueOfflineMutation(operation: string, payload: unknown) {
  const existing = await listOfflineMutations();
  const item: OfflineMutation = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, operation, payload, createdAt: new Date().toISOString() };
  await AsyncStorage.setItem(QUEUE_KEY, superjson.stringify([...existing, item].slice(-50)));
  return item;
}

export async function removeOfflineMutation(id: string) {
  const existing = await listOfflineMutations();
  await AsyncStorage.setItem(QUEUE_KEY, superjson.stringify(existing.filter((item) => item.id !== id)));
}

export async function clearOfflineMutations() {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

export async function drainOfflineMutations() {
  const queue = await listOfflineMutations();
  if (!queue.length) return { synced: 0, remaining: 0 };
  const client = createTRPCClient();
  let synced = 0;
  for (const item of queue) {
    try {
      if (item.operation === "requests.create") await client.requests.create.mutate(item.payload as Parameters<typeof client.requests.create.mutate>[0]);
      else if (item.operation === "auth.updateProfile") await client.auth.updateProfile.mutate(item.payload as Parameters<typeof client.auth.updateProfile.mutate>[0]);
      else continue;
      await removeOfflineMutation(item.id);
      synced += 1;
    } catch (error) {
      console.warn("[Offline] Could not sync queued mutation:", item.operation, error);
      break;
    }
  }
  return { synced, remaining: (await listOfflineMutations()).length };
}
