import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { TextInput } from "@/components/text-input";
import { Pressable } from "@/components/pressable";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { GradientHeader } from "@/components/gradient-header";
import { LiveBadge } from "@/components/realtime-provider";
import { QueryState } from "@/components/query-state";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { ResidentAccessLoading, useResidentAccess } from "@/hooks/use-resident-access";
import { trpc } from "@/lib/trpc";
import { CATEGORY_LABELS as categoryLabels, STATUS_LABELS as statusLabels, requestProtocol, type RequestCategory } from "@/shared/categories";
import { SelectionField } from "@/components/selection-field";

const categories = Object.entries(categoryLabels) as [string, string][];
const STEPS = ["received", "reviewing", "forwarded", "in_progress", "completed"] as const;
const FILTERS = [["all", "Todas"], ["open", "Em aberto"], ["completed", "Concluídas"]] as const;
const PAGE_SIZE = 8;

type Request = { id: number; category: string; fullAddress: string; neighborhood?: string | null; referencePoint: string | null; description: string; status: string; adminMessage?: string | null; createdAt: Date; updatedAt: Date };

const statusTone = (status: string, colors: ReturnType<typeof useColors>) =>
  ({ received: { bg: colors.primary + "18", fg: colors.primary }, reviewing: { bg: colors.warning + "22", fg: colors.warning }, forwarded: { bg: "#8B5CF618", fg: "#7C3AED" }, in_progress: { bg: "#0EA5E918", fg: "#0284C7" }, completed: { bg: colors.success + "22", fg: colors.success }, cancelled: { bg: colors.error + "20", fg: colors.error } }[status] ?? { bg: colors.surface, fg: colors.muted });

export default function RequestsScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{ requestId?: string }>();
  const focusedId = Number(params.requestId);
  const listRef = useRef<FlatList>(null);
  const { allowed, loading, error: accessError, retry: retryAccess } = useResidentAccess();
  const requests = trpc.requests.mine.useQuery(undefined, { refetchInterval: 30_000, staleTime: 1_000, enabled: allowed });
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [category, setCategory] = useState("other");
  const [address, setAddress] = useState("");
  const [referencePoint, setReferencePoint] = useState("");
  const [description, setDescription] = useState("");
  const updateRequest = trpc.requests.updateMine.useMutation({
    onSuccess: async () => { setEditingId(null); await requests.refetch(); Alert.alert("Solicitação atualizada", "Suas informações foram salvas."); },
    onError: (error) => Alert.alert("Não foi possível salvar", error.message),
  });

  const all = (requests.data ?? []) as Request[];
  const data = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return all.filter((r) => {
      const matchesFilter = filter === "all" || (filter === "completed" ? r.status === "completed" : !["completed", "cancelled"].includes(r.status));
      const searchable = [requestProtocol(r.id, r.createdAt), categoryLabels[r.category], r.description, r.fullAddress, r.neighborhood, statusLabels[r.status]].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
      return matchesFilter && (!query || searchable.includes(query));
    });
  }, [all, filter, search]);
  const visibleData = data.slice(0, visibleCount);
  const openCount = all.filter((r) => !["completed", "cancelled"].includes(r.status)).length;

  useEffect(() => {
    if (!Number.isInteger(focusedId) || focusedId <= 0 || !data.length) return;
    const index = data.findIndex((item) => item.id === focusedId);
    if (index < 0) return;
    const timer = setTimeout(() => listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.18 }), 80);
    return () => clearTimeout(timer);
  }, [focusedId, data]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filter, search]);

  if (loading) return <ResidentAccessLoading />;
  if (accessError) return <ScreenContainer className="p-5"><QueryState colors={colors} loading={false} error={accessError} errorTitle="Não foi possível verificar seu acesso" onRetry={() => void retryAccess()} /></ScreenContainer>;
  if (!allowed) return null;

  const beginEdit = (item: Request) => { setEditingId(item.id); setCategory(item.category); setAddress(item.fullAddress); setReferencePoint(item.referencePoint ?? ""); setDescription(item.description); };
  const saveEdit = () => {
    if (editingId === null) return;
    if (description.trim().length < 10 || address.trim().length < 5) return Alert.alert("Complete os dados", "Informe o endereço e uma descrição com pelo menos 10 caracteres.");
    updateRequest.mutate({ id: editingId, category: category as RequestCategory, fullAddress: address.trim(), referencePoint: referencePoint.trim() || undefined, description: description.trim() });
  };
  const input = [styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <FlatList
        ref={listRef}
        data={visibleData}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 28 }}
        onScrollToIndexFailed={() => undefined}
        ListHeaderComponent={
          <View>
            <GradientHeader minHeight={150}>
              <View style={styles.topRow}><Text style={styles.kicker}>MEUS PEDIDOS</Text><LiveBadge /></View>
              <Text style={styles.title}>Minhas solicitações</Text>
              <Text style={styles.sub}>{all.length === 0 ? "Acompanhe cada pedido até a solução." : `${openCount} em aberto • ${all.length - openCount} concluídas`}</Text>
            </GradientHeader>
            <View style={styles.filters}>
              <SelectionField value={filter} options={FILTERS.map(([value, label]) => ({ value, label }))} onChange={setFilter} title="Filtrar minhas solicitações" placeholder="Todas" accessibilityLabel="Filtrar solicitações por status" />
              <TextInput value={search} onChangeText={setSearch} placeholder="Buscar por protocolo, assunto, bairro ou endereço" placeholderTextColor={colors.muted} accessibilityLabel="Buscar minhas solicitações" returnKeyType="search" style={[styles.searchInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} />
              <Text style={[styles.resultSummary, { color: colors.muted }]}>{data.length === all.length ? `${data.length} solicitação(ões)` : `${data.length} encontradas de ${all.length}`} · mostrando {visibleData.length}</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push("/request")} style={[styles.newBtn, { backgroundColor: colors.primary }]}><Text style={styles.newText}>+ Nova</Text></Pressable>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const tone = statusTone(item.status, colors);
          const isEditing = editingId === item.id;
          const step = STEPS.indexOf(item.status as (typeof STEPS)[number]);
          return (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: item.id === focusedId ? colors.primary : colors.border }, item.id === focusedId && styles.focused]}>
              <View style={styles.top}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.protocol, { color: colors.primary }]}>{requestProtocol(item.id, item.createdAt)}</Text>
                  <Text style={[styles.category, { color: colors.foreground }]}>{categoryLabels[item.category] ?? item.category}</Text>
                </View>
                <View style={[styles.pill, { backgroundColor: tone.bg }]}><Text style={[styles.pillText, { color: tone.fg }]}>{statusLabels[item.status] ?? item.status}</Text></View>
              </View>

              {step >= 0 && !isEditing && (
                <View style={styles.stepper} accessibilityLabel={`Etapa ${step + 1} de ${STEPS.length}`}>
                  {STEPS.map((s, i) => <View key={s} style={[styles.stepBar, { backgroundColor: i <= step ? colors.primary : colors.border }]} />)}
                </View>
              )}

              {isEditing ? (
                <>
                  <Text style={[styles.label, { color: colors.foreground }]}>Tipo de solicitação</Text>
                  <SelectionField value={category} options={categories.map(([value, label]) => ({ value, label }))} onChange={setCategory} title="Selecione o tipo de solicitação" placeholder="Escolha uma categoria" accessibilityLabel="Selecionar tipo de solicitação" />
                  <Text style={[styles.label, { color: colors.foreground }]}>Endereço completo</Text>
                  <TextInput value={address} onChangeText={setAddress} style={input} />
                  <Text style={[styles.label, { color: colors.foreground }]}>Ponto de referência</Text>
                  <TextInput value={referencePoint} onChangeText={setReferencePoint} placeholder="Opcional" placeholderTextColor={colors.muted} style={input} />
                  <Text style={[styles.label, { color: colors.foreground }]}>Descrição</Text>
                  <TextInput value={description} onChangeText={setDescription} multiline style={[...input, styles.textarea]} />
                  <View style={styles.actions}>
                    <Pressable onPress={() => setEditingId(null)} style={[styles.cancel, { borderColor: colors.border }]}><Text style={{ color: colors.muted, fontWeight: "800" }}>Cancelar</Text></Pressable>
                    <Pressable disabled={updateRequest.isPending} onPress={saveEdit} style={[styles.save, { backgroundColor: colors.primary }]}><Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{updateRequest.isPending ? "Salvando…" : "Salvar alterações"}</Text></Pressable>
                  </View>
                </>
              ) : (
                <>
                  {item.neighborhood ? <Text style={[styles.hood, { color: colors.primary, backgroundColor: colors.primary + "14" }]}>📍 {item.neighborhood}</Text> : null}
                  <Text style={[styles.description, { color: colors.foreground }]}>{item.description}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{item.fullAddress}</Text>
                  {item.referencePoint ? <Text style={{ color: colors.muted, fontSize: 12 }}>Referência: {item.referencePoint}</Text> : null}
                  {item.adminMessage ? <View style={[styles.reply, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "40" }]}><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900" }}>RESPOSTA DA GESTÃO</Text><Text style={{ color: colors.foreground, fontSize: 14, marginTop: 2 }}>{item.adminMessage}</Text></View> : null}
                  <View style={styles.footerRow}>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>Atualizada em {new Date(item.updatedAt).toLocaleDateString("pt-BR")}</Text>
                    {!["completed", "cancelled"].includes(item.status) && <Pressable onPress={() => beginEdit(item)} style={({ pressed }) => [styles.editBtn, { borderColor: colors.primary }, pressed && { opacity: 0.7 }]}><Text style={{ color: colors.primary, fontWeight: "900", fontSize: 12 }}>Editar</Text></Pressable>}
                  </View>
                </>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 18 }}>
            {requests.isLoading ? <QueryState colors={colors} loading compact loadingText="Carregando solicitações…" />
              : requests.error ? <QueryState colors={colors} loading={false} error={requests.error} compact errorTitle="Não foi possível carregar suas solicitações" onRetry={() => void requests.refetch()} />
              : <QueryState colors={colors} loading={false} empty compact emptyTitle="Nenhuma solicitação" emptyText={filter === "all" ? "Toque em “+ Nova” para pedir um reparo no seu bairro." : "Nada nesta categoria."} />}
          </View>
        }
        ListFooterComponent={data.length > visibleData.length ? <Pressable accessibilityRole="button" onPress={() => setVisibleCount((count) => count + PAGE_SIZE)} style={[styles.loadMore, { borderColor: colors.primary, backgroundColor: colors.surface }]}><Text style={{ color: colors.primary, fontWeight: "900" }}>Carregar mais ({data.length - visibleData.length})</Text></Pressable> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  kicker: { color: "#DDF0FF", fontWeight: "900", fontSize: 12, letterSpacing: 1.2 },
  title: { color: "#FFFFFF", fontSize: 27, fontWeight: "900", letterSpacing: -0.4 },
  sub: { color: "#DDF0FF", fontSize: 14, marginTop: 4 },
  filters: { gap: 8, paddingHorizontal: 18, paddingVertical: 14, alignItems: "stretch" },
  searchInput: { borderWidth: 1, borderRadius: 16, minHeight: 48, paddingHorizontal: 14, fontSize: 14 },
  resultSummary: { fontSize: 12, fontWeight: "700" },
  newBtn: { alignSelf: "flex-end", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  newText: { color: "#FFFFFF", fontWeight: "900", fontSize: 13 },
  card: { marginHorizontal: 18, marginBottom: 12, borderWidth: 1, borderRadius: 24, padding: 16, gap: 8, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  focused: { borderWidth: 2 },
  top: { flexDirection: "row", alignItems: "center", gap: 10 },
  protocol: { fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  category: { fontSize: 16, fontWeight: "900" },
  pill: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  pillText: { fontSize: 11, fontWeight: "900" },
  stepper: { flexDirection: "row", gap: 4 },
  stepBar: { flex: 1, height: 5, borderRadius: 3 },
  hood: { alignSelf: "flex-start", fontSize: 12, fontWeight: "800", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  description: { fontSize: 15, lineHeight: 21 },
  reply: { borderWidth: 1, borderRadius: 14, padding: 10 },
  footerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 },
  editBtn: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  label: { fontSize: 13, fontWeight: "800", marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  input: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, minHeight: 54, fontSize: 14 },
  textarea: { minHeight: 90, textAlignVertical: "top", paddingTop: 10 },
  actions: { flexDirection: "row", gap: 10, marginTop: 6 },
  cancel: { flex: 1, borderWidth: 1.5, borderRadius: 14, alignItems: "center", justifyContent: "center", minHeight: 46 },
  save: { flex: 2, borderRadius: 14, alignItems: "center", justifyContent: "center", minHeight: 46 },
  loadMore: { marginHorizontal: 18, marginTop: 2, marginBottom: 16, minHeight: 48, borderWidth: 1.5, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
