import { describePushErrors } from "@/lib/push-diagnostics";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/pressable";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/page-header";

export default function SecurityScreen() {
  const colors = useColors();
  const [allSessionsEnded, setAllSessionsEnded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const sessions = trpc.auth.sessions.useQuery(undefined, { retry: false, staleTime: 5_000 });
  const revoke = trpc.auth.revokeSession.useMutation({ onSuccess: async () => { setSelectedIds(new Set()); await sessions.refetch(); } });
  const testPush = trpc.notifications.testPush.useMutation({ onSuccess: (result) => { const { delivery } = result; const delivered = delivery.delivered ?? delivery.accepted ?? 0; if (delivered > 0) Alert.alert("Push entregue", "O recibo do Expo confirmou a entrega ao serviço de notificações. Se não aparecer, verifique as permissões e o canal Avisos Conecta Barra no Android."); else if (delivery.reason === "no_registered_token") Alert.alert("Aparelho não registrado", "Abra o APK atualizado, permita notificações e permaneça conectado por alguns segundos antes de repetir o teste."); else Alert.alert("Push rejeitado", `O Expo não confirmou a entrega${delivery.receiptErrors ? ` (${delivery.receiptErrors} recibo(s) com erro)` : ""}. ${describePushErrors(delivery.errors) || "Abra o aplicativo novamente para renovar o registro do aparelho."}`); }, onError: (error) => Alert.alert("Não foi possível enviar", error.message) });
  const revokeAll = trpc.auth.revokeAllSessions.useMutation({
    onSuccess: () => {
      setAllSessionsEnded(true);
      router.replace("/login");
    },
  });
  const revokeOne = (id: number) => Alert.alert("Encerrar sessão?", "O dispositivo selecionado precisará fazer login novamente.", [
    { text: "Cancelar", style: "cancel" },
    { text: "Encerrar", style: "destructive", onPress: () => revoke.mutate({ id }) },
  ]);
  const revokeEverything = () => Alert.alert("Encerrar todas as sessões?", "Esta ação desconectará todos os dispositivos, inclusive este aparelho.", [
    { text: "Cancelar", style: "cancel" },
    { text: "Encerrar todas", style: "destructive", onPress: () => { revokeAll.mutate(); } },
  ]);
  const activeSessions = sessions.data ?? [];
  const selectedVisibleIds = activeSessions.filter((session) => selectedIds.has(session.id)).map((session) => session.id);
  const allSelected = activeSessions.length > 0 && selectedVisibleIds.length === activeSessions.length;
  const toggleSession = (id: number) => setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(activeSessions.map((session) => session.id)));
  const revokeSelected = () => Alert.alert("Encerrar sessões selecionadas?", `${selectedVisibleIds.length} acesso(s) serão encerrados.`, [{ text: "Cancelar", style: "cancel" }, { text: "Encerrar", style: "destructive", onPress: async () => { for (const id of selectedVisibleIds) await revoke.mutateAsync({ id }); } }]);

  return <ScreenContainer className="px-0 pt-0" edges={["left", "right", "bottom"]} containerClassName="bg-background"><PageHeader kicker="SEGURANÇA DA CONTA" title="Sessões ativas" subtitle="Onde sua conta está conectada." /><View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 14 }}>
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" accessibilityLabel="Disparar push de teste" disabled={testPush.isPending} onPress={() => testPush.mutate()} style={({ pressed }) => [styles.testPush, { borderColor: colors.primary, backgroundColor: colors.primary + "10" }, pressed && styles.pressed, testPush.isPending && styles.disabled]}><Text style={[styles.testPushText, { color: colors.primary }]}>{testPush.isPending ? "Enviando push…" : "Enviar push de teste"}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Encerrar todas as sessões" onPress={revokeEverything} style={({ pressed }) => [styles.danger, { borderColor: colors.error, backgroundColor: colors.error + "10" }, pressed && styles.pressed]}><Text style={[styles.dangerText, { color: colors.error }]}>Encerrar todas as sessões</Text></Pressable>
      {activeSessions.length > 0 && <View style={styles.selectionBar}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: allSelected }} onPress={toggleAll} style={({ pressed }) => [styles.selectAll, { borderColor: colors.primary, backgroundColor: allSelected ? colors.primary + "16" : colors.surface }, pressed && styles.pressed]}><Text style={[styles.selectAllText, { color: colors.primary }]}>{allSelected ? "Desmarcar todas" : "Selecionar todas"}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Encerrar sessões selecionadas" disabled={!selectedVisibleIds.length || revoke.isPending} onPress={revokeSelected} style={({ pressed }) => [styles.bulkDanger, { borderColor: colors.error }, pressed && styles.pressed, (!selectedVisibleIds.length || revoke.isPending) && styles.disabled]}><Text style={[styles.bulkDangerText, { color: colors.error }]}>Encerrar selecionadas{selectedVisibleIds.length ? ` (${selectedVisibleIds.length})` : ""}</Text></Pressable></View>}
      {sessions.isLoading && <Text style={[styles.state, { color: colors.muted }]}>Carregando sessões…</Text>}
      {revokeAll.isPending && <Text style={[styles.state, { color: colors.warning }]}>Encerrando os acessos…</Text>}
      {sessions.error && <Text style={[styles.state, { color: colors.error }]}>Não foi possível carregar as sessões. Tente novamente.</Text>}
      {!allSessionsEnded && activeSessions.map((session) => <View key={session.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: selectedIds.has(session.id) ? colors.primary : colors.border }]}> 
        <Pressable accessibilityRole="checkbox" accessibilityLabel={`Selecionar sessão ${session.deviceLabel}`} accessibilityState={{ checked: selectedIds.has(session.id) }} onPress={() => toggleSession(session.id)} style={({ pressed }) => [styles.sessionCheck, { borderColor: selectedIds.has(session.id) ? colors.primary : colors.border, backgroundColor: selectedIds.has(session.id) ? colors.primary : "transparent" }, pressed && styles.pressed]}>{selectedIds.has(session.id) && <Text style={styles.sessionCheckMark}>✓</Text>}</Pressable>
        <View style={styles.cardHeader}><Text style={[styles.device, { color: colors.foreground }]} numberOfLines={2}>{session.deviceLabel}</Text><Text style={[styles.platform, { color: colors.primary }]}>{session.platform}</Text></View>
        <Text style={[styles.meta, { color: colors.muted }]}>Último acesso: {new Date(session.lastSeenAt).toLocaleString("pt-BR")}</Text>
        <Text style={[styles.meta, { color: colors.muted }]}>Criada em: {new Date(session.createdAt).toLocaleDateString("pt-BR")}</Text>
        {session.revokedAt ? <Text style={[styles.revoked, { color: colors.error }]}>Sessão encerrada</Text> : <Pressable accessibilityRole="button" accessibilityLabel={`Encerrar sessão ${session.deviceLabel}`} onPress={() => revokeOne(session.id)} style={({ pressed }) => [styles.outline, { borderColor: colors.error }, pressed && styles.pressed]}><Text style={[styles.outlineText, { color: colors.error }]}>Encerrar acesso</Text></Pressable>}
      </View>)}
      {!sessions.isLoading && !sessions.error && (allSessionsEnded || (sessions.data ?? []).length === 0) && <Text style={[styles.state, { color: colors.muted }]}>Nenhuma sessão registrada.</Text>}
    </ScrollView>
  </View></ScreenContainer>;
}

const styles = StyleSheet.create({ content: { gap: 14, paddingBottom: 40 }, back: { alignSelf: "flex-start", minHeight: 48, paddingHorizontal: 16, borderWidth: 2, borderRadius: 16, justifyContent: "center" }, backText: { fontSize: 17, fontWeight: "800" }, eyebrow: { fontSize: 13, fontWeight: "800", letterSpacing: 1.4, marginTop: 8 }, title: { fontSize: 34, lineHeight: 40, fontWeight: "900" }, subtitle: { fontSize: 16, lineHeight: 24 }, testPush: { minHeight: 48, borderWidth: 1.5, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }, testPushText: { fontSize: 15, fontWeight: "900" }, danger: { minHeight: 52, borderWidth: 2, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }, dangerText: { fontSize: 16, fontWeight: "900" }, selectionBar: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, selectAll: { minHeight: 44, borderWidth: 1.5, borderRadius: 13, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }, selectAllText: { fontSize: 13, fontWeight: "900" }, bulkDanger: { minHeight: 44, borderWidth: 1.5, borderRadius: 13, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }, bulkDangerText: { fontSize: 13, fontWeight: "900" }, card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 8, position: "relative" }, sessionCheck: { position: "absolute", top: 14, right: 14, width: 27, height: 27, borderWidth: 1.5, borderRadius: 8, alignItems: "center", justifyContent: "center", zIndex: 2 }, sessionCheckMark: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" }, cardHeader: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingRight: 38 }, device: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: "800" }, platform: { fontSize: 13, fontWeight: "800" }, meta: { fontSize: 14, lineHeight: 20 }, revoked: { fontSize: 14, fontWeight: "800" }, outline: { minHeight: 46, borderWidth: 2, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 4 }, outlineText: { fontSize: 15, fontWeight: "800" }, state: { fontSize: 16, lineHeight: 24 }, disabled: { opacity: 0.5 }, pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] } });
