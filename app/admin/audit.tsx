import { useMemo, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { TextInput } from "@/components/text-input";
import { Pressable } from "@/components/pressable";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { QueryState } from "@/components/query-state";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/page-header";

const actionLabels: Record<string, string> = {
  request_status: "Status de solicitação",
  request_delete: "Exclusão de solicitação",
  suggestion_update: "Atualização de sugestão",
  suggestion_delete: "Exclusão de sugestão",
  announcement_create: "Novo comunicado",
  announcement_update: "Comunicado atualizado",
  announcement_delete: "Comunicado excluído",
  user_status: "Status de usuário",
  user_delete: "Exclusão de usuário",
};

function dateTime(value: Date | string | null) {
  if (!value) return "Data não informada";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data não informada" : date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminAuditScreen() {
  const colors = useColors();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const audit = trpc.audit.list.useQuery({ limit: 250 }, { refetchInterval: 30_000, refetchIntervalInBackground: false, staleTime: 2_000, retry: false });
  const deleteOne = trpc.audit.delete.useMutation({
    onSuccess: async () => { setSelectedIds(new Set()); await audit.refetch(); },
    onError: (error) => Alert.alert("Não foi possível apagar", error.message),
  });
  const deleteMany = trpc.audit.deleteMany.useMutation({
    onSuccess: async () => { setSelectedIds(new Set()); await audit.refetch(); },
    onError: (error) => Alert.alert("Não foi possível apagar", error.message),
  });
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (audit.data ?? []).filter((item) => !term || [item.summary, item.action, item.adminName, String(item.targetUserId ?? "")].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(term));
  }, [audit.data, search]);
  const allSelected = rows.length > 0 && rows.every((item) => selectedIds.has(item.id));
  const busy = deleteOne.isPending || deleteMany.isPending;
  const toggleSelected = (id: number) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelectedIds((current) => {
    const next = new Set(current);
    if (allSelected) rows.forEach((item) => next.delete(item.id));
    else rows.forEach((item) => next.add(item.id));
    return next;
  });
  const confirmDeleteOne = (id: number) => Alert.alert("Apagar registro?", "Esse registro do histórico administrativo será removido permanentemente.", [
    { text: "Cancelar", style: "cancel" },
    { text: "Apagar", style: "destructive", onPress: () => deleteOne.mutate({ id }) },
  ]);
  const confirmDeleteSelected = () => {
    const ids = rows.filter((item) => selectedIds.has(item.id)).map((item) => item.id);
    if (!ids.length || busy) return;
    Alert.alert("Apagar registros selecionados?", `${ids.length} registro(s) serão removidos permanentemente.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Apagar", style: "destructive", onPress: () => deleteMany.mutate({ ids }) },
    ]);
  };

  return (
    <ScreenContainer className="px-0 pt-0" edges={["left", "right", "bottom"]}><PageHeader kicker="SEGURANÇA E TRANSPARÊNCIA" title="Histórico administrativo" subtitle="Alterações importantes feitas no painel." /><View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 14 }}>
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.content}
        refreshing={audit.isFetching}
        onRefresh={() => void audit.refetch()}
        ListHeaderComponent={(
          <View>
            <View style={styles.header}>
              
              <View style={[styles.live, { backgroundColor: colors.success + "18", borderColor: colors.success + "45" }]}><View style={[styles.liveDot, { backgroundColor: colors.success }]} /><Text style={[styles.liveText, { color: colors.success }]}>Online</Text></View>
            </View>
            <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.searchGlyph, { color: colors.primary }]}>⌕</Text><TextInput value={search} onChangeText={setSearch} placeholder="Buscar ação, resumo ou usuário" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground }]} autoCapitalize="none" returnKeyType="search" accessibilityLabel="Buscar no histórico administrativo" />{search.length > 0 && <Pressable onPress={() => setSearch("")} accessibilityLabel="Limpar busca" style={styles.clear}><Text style={[styles.clearText, { color: colors.muted }]}>×</Text></Pressable>}</View>
            <View style={styles.summary}><Text style={[styles.summaryTitle, { color: colors.foreground }]}>{rows.length} registro(s) encontrado(s)</Text><Text style={[styles.summaryHint, { color: colors.muted }]}>Selecione registros individuais ou todos os resultados filtrados.</Text></View>
            {rows.length > 0 && <View style={styles.bulkBar}>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: allSelected, disabled: busy }} onPress={toggleAll} disabled={busy} style={({ pressed }) => [styles.bulkButton, { borderColor: colors.primary, backgroundColor: colors.primary + "0B" }, pressed && styles.pressed, busy && styles.disabled]}><Text style={[styles.bulkButtonText, { color: colors.primary }]}>{allSelected ? "Desmarcar todos" : "Selecionar todos"}</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Apagar registros selecionados" onPress={confirmDeleteSelected} disabled={!selectedIds.size || busy} style={({ pressed }) => [styles.bulkButton, { borderColor: colors.error, backgroundColor: colors.error + "0B" }, pressed && styles.pressed, (!selectedIds.size || busy) && styles.disabled]}><Text style={[styles.bulkButtonText, { color: colors.error }]}>{deleteMany.isPending ? "Apagando…" : `Apagar${selectedIds.size ? ` (${selectedIds.size})` : " selecionados"}`}</Text></Pressable>
            </View>}
          </View>
        )}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: selectedIds.has(item.id) ? colors.error : colors.border }]}>
            <View style={styles.cardHeader}>
              <Pressable accessibilityRole="checkbox" accessibilityLabel={`Selecionar registro ${item.id}`} accessibilityState={{ checked: selectedIds.has(item.id), disabled: busy }} onPress={() => toggleSelected(item.id)} disabled={busy} style={({ pressed }) => [styles.selectBox, { borderColor: selectedIds.has(item.id) ? colors.error : colors.border, backgroundColor: selectedIds.has(item.id) ? colors.error : "transparent" }, pressed && styles.pressed]}><Text style={styles.check}>{selectedIds.has(item.id) ? "✓" : ""}</Text></Pressable>
              <View style={[styles.icon, { backgroundColor: colors.primary + "18" }]}><Text style={[styles.iconText, { color: colors.primary }]}>✓</Text></View>
              <View style={styles.cardCopy}><Text style={[styles.action, { color: colors.primary }]}>{actionLabels[item.action] ?? item.action}</Text><Text style={[styles.when, { color: colors.muted }]}>{dateTime(item.createdAt)}</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Apagar registro ${item.id}`} onPress={() => confirmDeleteOne(item.id)} disabled={busy} style={({ pressed }) => [styles.deleteButton, { borderColor: colors.error }, pressed && styles.pressed, busy && styles.disabled]}><Text style={[styles.deleteText, { color: colors.error }]}>Apagar</Text></Pressable>
            </View>
            <Text style={[styles.summaryText, { color: colors.foreground }]}>{item.summary}</Text>
            <Text style={[styles.meta, { color: colors.muted }]}>Administrador: {item.adminName ?? `#${item.adminId}`} {item.targetUserId ? `• Usuário afetado: #${item.targetUserId}` : ""}</Text>
          </View>
        )}
        ListEmptyComponent={audit.isLoading ? <QueryState colors={colors} loading compact loadingText="Carregando histórico…" /> : audit.error ? <QueryState colors={colors} loading={false} error={audit.error} compact errorTitle="Não foi possível carregar o histórico" onRetry={() => void audit.refetch()} /> : <QueryState colors={colors} loading={false} empty compact emptyTitle="Nenhum registro encontrado" emptyText={search ? "Tente buscar por outro termo." : "As próximas ações administrativas aparecerão aqui."} />}
      />
    </View></ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 36 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 17 },
  backButton: { minHeight: 44, borderWidth: 1.5, borderRadius: 15, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  back: { fontSize: 14, fontWeight: "900" },
  live: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 5 },
  liveText: { fontSize: 11, fontWeight: "900" },
  eyebrow: { fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  title: { fontSize: 29, lineHeight: 35, fontWeight: "900", marginTop: 5 },
  intro: { fontSize: 14, lineHeight: 20, marginTop: 7, marginBottom: 16 },
  search: { minHeight: 50, borderRadius: 16, borderWidth: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },
  searchGlyph: { fontSize: 25, fontWeight: "800" },
  input: { flex: 1, minWidth: 0, fontSize: 14, paddingHorizontal: 10, paddingVertical: 12 },
  clear: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  clearText: { fontSize: 26, lineHeight: 26 },
  summary: { marginTop: 19, marginBottom: 10 },
  summaryTitle: { fontSize: 18, fontWeight: "900" },
  summaryHint: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  bulkBar: { flexDirection: "row", gap: 9, marginBottom: 14 },
  bulkButton: { flex: 1, minHeight: 44, borderRadius: 13, borderWidth: 1.5, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  bulkButtonText: { fontSize: 12, fontWeight: "900", textAlign: "center" },
  card: { borderWidth: 1.5, borderRadius: 20, padding: 15, marginBottom: 11, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  selectBox: { width: 26, height: 26, borderWidth: 1.5, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  check: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  iconText: { fontSize: 19, fontWeight: "900" },
  cardCopy: { flex: 1, minWidth: 0 },
  action: { fontSize: 14, lineHeight: 19, fontWeight: "900" },
  when: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  deleteButton: { minHeight: 36, borderWidth: 1.3, borderRadius: 10, paddingHorizontal: 9, alignItems: "center", justifyContent: "center" },
  deleteText: { fontSize: 11, fontWeight: "900" },
  summaryText: { fontSize: 16, lineHeight: 23, fontWeight: "800", marginTop: 13 },
  meta: { fontSize: 12, lineHeight: 18, marginTop: 9 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.55 },
});
