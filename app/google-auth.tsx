import { useEffect } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { setSessionToken, setUserInfo } from "@/lib/_core/auth";

/** Cada ticket do Google só vale uma vez: evita trocar duas vezes se o Android entregar o link por dois caminhos. */
const handledTickets = new Set<string>();

/**
 * Destino do retorno do login com Google (conectabarra://google-auth?ticket=…).
 * Só funciona se o servidor tiver GOOGLE_WEB_CLIENT_ID/SECRET (guia, passo 8).
 */
export default function GoogleAuthScreen() {
  const colors = useColors();
  const { ticket, error } = useLocalSearchParams<{ ticket?: string; error?: string }>();
  const exchange = trpc.auth.exchangeGoogleTicket.useMutation({
    onSuccess: async (result) => {
      await setSessionToken(result.token);
      await setUserInfo(result.user);
      router.replace(result.user.role === "admin" ? "/admin" : result.profileComplete ? "/(tabs)" : "/(tabs)/profile");
    },
    onError: (err) => { Alert.alert("Não foi possível entrar com o Google", err.message); router.replace("/login"); },
  });

  useEffect(() => {
    if (error) { Alert.alert("Login com Google cancelado", String(error)); router.replace("/login"); return; }
    if (!ticket) { router.replace("/login"); return; }
    if (handledTickets.has(ticket)) return;
    handledTickets.add(ticket);
    exchange.mutate({ ticket });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket, error]);

  return (
    <ScreenContainer>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.muted }}>Concluindo o login com Google…</Text>
      </View>
    </ScreenContainer>
  );
}
