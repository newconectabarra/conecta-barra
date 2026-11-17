import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { warmUpServer } from "@/lib/warmup";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Platform } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { NetworkStatusBanner } from "@/components/network-status-banner";
import { PushNotificationBridge } from "@/components/push-notification-bridge";
import { AnimatedLogoSplash } from "@/components/animated-logo-splash";
import { OfflineSyncProvider } from "@/components/offline-sync-provider";
import { RealtimeProvider } from "@/components/realtime-provider";
import { BiometricGate } from "@/components/biometric-gate";
import { UpdateBanner } from "@/components/update-banner";
import { HeaderBackButton } from "@/components/header-back-button";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  // Acorda o servidor (Render gratuito hiberna) assim que o app abre.
  useEffect(() => { warmUpServer(); }, []);
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets] = useState<EdgeInsets>(initialInsets);
  const [frame] = useState<Rect>(initialFrame);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Atualização em tempo real via WebSocket (lib/realtime.ts); o polling é só uma rede de segurança.
            staleTime: 2_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            refetchOnMount: true,
            retry: (failureCount, error) => {
              const code = (error as { data?: { code?: string } } | undefined)?.data?.code;
              return code !== "UNAUTHORIZED" && failureCount < 2;
            },
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <AnimatedLogoSplash>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {/* Um cabeçalho nativo comum mantém o botão Voltar acessível em todas as rotas. */}
          <Stack screenOptions={{ animation: "slide_from_right", animationDuration: 260, gestureEnabled: true, headerShown: true, headerTitle: "Conecta Barra", headerTitleStyle: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" }, headerStyle: { backgroundColor: "#0B5FD8" }, headerTintColor: "#FFFFFF", headerShadowVisible: false, headerBackVisible: false, headerLeft: () => <HeaderBackButton /> }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: true }} />
            <Stack.Screen name="login" options={{ animation: "fade" }} />
          </Stack>
          <PushNotificationBridge />
          <RealtimeProvider />
          <UpdateBanner />
          <BiometricGate />
          <OfflineSyncProvider />
          <NetworkStatusBanner />
          <StatusBar style="auto" />
        </QueryClientProvider>
      </trpc.Provider>
      </GestureHandlerRootView>
    </AnimatedLogoSplash>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}
