import { useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { TextInput } from "@/components/text-input";
import { Pressable } from "@/components/pressable";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { QueryState } from "@/components/query-state";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/page-header";

export default function AdminSuggestionsScreen() {
  const colors = useColors();
  const suggestions = trpc.suggestions.all.useQuery(undefined, { refetchInterval: 45_000, refetchIntervalInBackground: false, retry: false });
  const [editing, setEditing] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const update = trpc.suggestions.update.useMutation({
    onSuccess: async () => { setEditing(null); await suggestions.refetch(); Alert.alert("Sugestão atualizada", "As alterações foram salvas."); },
    onError: (error) => Alert.alert("Não foi possível salvar", error.message),
  });
  const remove = trpc.suggestions.delete.useMutation({
    onSuccess: async () => { await suggestions.refetch(); Alert.alert("Sugestão excluída", "O registro foi removido."); },
    onError: (error) => Alert.alert("Não foi possível excluir", error.message),
  });
  const beginEdit = (item: NonNullable<typeof suggestions.data>[number]) => { setEditing(item.id); setTitle(item.title); setDescription(item.description); };
  const cancelEdit = () => { setEditing(null); setTitle(""); setDescription(""); };
  const confirmDelete = (id: number) => Alert.alert("Excluir sugestão?", "Esta ação não pode ser desfeita.", [{ text: "Cancelar", style: "cancel" }, { text: "Excluir", style: "destructive", onPress: () => remove.mutate({ id }) }]);
  const busy = update.isPending || remove.isPending;
  const data = suggestions.data ?? [];

  return <ScreenContainer className="px-0 pt-0" edges={["left", "right", "bottom"]}><PageHeader kicker="PARTICIPAÇÃO" title="Sugestões recebidas" subtitle="Edite, acompanhe ou exclua ideias dos moradores." /><View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 14 }}>
    <FlatList
      data={data}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{editing === item.id ? <><TextInput value={title} onChangeText={setTitle} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} placeholder="Título" placeholderTextColor={colors.muted} /><TextInput value={description} onChangeText={setDescription} multiline style={[styles.input, styles.multiline, { color: colors.foreground, borderColor: colors.border }]} placeholder="Descrição" placeholderTextColor={colors.muted} /><View style={styles.actions}><Pressable onPress={cancelEdit} disabled={busy} style={[styles.secondary, { borderColor: colors.border }]}><Text style={{ color: colors.muted, fontWeight: "800" }}>Cancelar</Text></Pressable><Pressable disabled={busy} onPress={() => update.mutate({ id: item.id, title: title.trim(), description: description.trim() })} style={[styles.primary, { backgroundColor: colors.primary }]}><Text style={styles.white}>{update.isPending ? "Salvando…" : "Salvar"}</Text></Pressable></View></> : <><Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.title}</Text><Text style={[styles.cardText, { color: colors.muted }]}>{item.description}</Text><View style={styles.meta}><Text style={[styles.status, { color: item.status === "reviewing" ? "#D97706" : colors.primary }]}>{item.status === "received" ? "Recebida" : item.status === "reviewing" ? "Em análise" : "Considerada"}</Text><Text style={[styles.date, { color: colors.muted }]}>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</Text></View><View style={styles.actions}><Pressable onPress={() => beginEdit(item)} disabled={busy} style={[styles.secondary, { borderColor: colors.primary }]}><Text style={{ color: colors.primary, fontWeight: "900" }}>Editar</Text></Pressable><Pressable disabled={busy} onPress={() => confirmDelete(item.id)} style={[styles.secondary, { borderColor: colors.error }]}><Text style={{ color: colors.error, fontWeight: "900" }}>{remove.isPending ? "Excluindo…" : "Excluir"}</Text></Pressable></View></>}</View>}
      ListEmptyComponent={suggestions.isLoading ? <QueryState colors={colors} loading compact loadingText="Carregando sugestões…" /> : suggestions.error ? <QueryState colors={colors} loading={false} error={suggestions.error} compact errorTitle="Não foi possível carregar as sugestões" onRetry={() => void suggestions.refetch()} /> : <QueryState colors={colors} loading={false} empty compact emptyTitle="Nenhuma sugestão recebida" emptyText="As ideias enviadas pelos moradores aparecerão aqui." />}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={data.length ? undefined : styles.emptyList}
    />
  </View></ScreenContainer>;
}

const styles = StyleSheet.create({ header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }, backButton: { minHeight: 44, borderWidth: 1.5, borderRadius: 15, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" }, back: { fontSize: 14, fontWeight: "900" }, title: { fontSize: 19, fontWeight: "800" }, intro: { fontSize: 13, lineHeight: 19, marginBottom: 16 }, card: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 11 }, cardTitle: { fontSize: 16, fontWeight: "800" }, cardText: { fontSize: 14, lineHeight: 21, marginTop: 7 }, meta: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 }, status: { fontSize: 11, fontWeight: "900" }, date: { fontSize: 11 }, actions: { flexDirection: "row", gap: 8, marginTop: 14 }, primary: { flex: 1, borderRadius: 12, minHeight: 42, alignItems: "center", justifyContent: "center" }, secondary: { flex: 1, borderWidth: 1, borderRadius: 12, minHeight: 42, alignItems: "center", justifyContent: "center" }, white: { color: "#fff", fontWeight: "900" }, input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15, marginBottom: 10 }, multiline: { minHeight: 100, textAlignVertical: "top" }, emptyList: { flexGrow: 1, justifyContent: "center" }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] } });
