import { useEffect } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export function useResidentAccess() {
  const colors = useColors();
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const profileComplete = Boolean(me.data?.role === "admin" || (me.data?.name && me.data.phone && me.data.cep && me.data.street && me.data.number && me.data.neighborhood && me.data.sex));
  const allowed = Boolean(me.data?.id && (me.data.role === "admin" || (me.data.residentStatus !== "blocked" && profileComplete)));
  useEffect(() => {
    if (me.isLoading || me.error || me.data === undefined) return;
    if (!me.data?.id) {
      Alert.alert("Entre para continuar", "Faça login ou crie seu cadastro para acessar esta função.");
      router.replace("/login");
    } else if (!allowed) {
      Alert.alert(me.data.residentStatus === "blocked" ? "Cadastro bloqueado" : "Complete seus dados", me.data.residentStatus === "blocked" ? "Procure a gestão do Conecta Barra para regularizar o acesso." : "Complete nome, telefone e endereço no Meu perfil antes de usar os serviços.");
      router.replace("/(tabs)");
    }
  }, [allowed, me.data, me.error, me.isLoading]);
  return { allowed, profileComplete, loading: me.isLoading, error: me.error, retry: me.refetch, colors };
}

export function ResidentAccessLoading() {
  const colors = useColors();
  return <View style={[styles.loading, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /><Text style={[styles.loadingText, { color: colors.muted }]}>Verificando acesso…</Text></View>;
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }, loadingText: { fontSize: 13 } });
