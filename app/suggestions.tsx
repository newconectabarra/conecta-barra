import { useEffect, useRef, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { TextInput } from "@/components/text-input";
import { Pressable } from "@/components/pressable";
import { router, useLocalSearchParams } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { ResidentAccessLoading, useResidentAccess } from "@/hooks/use-resident-access";
import { QueryState } from "@/components/query-state";
import { PageHeader } from "@/components/page-header";

type Suggestion = { id: number; title: string; description: string; createdAt: Date };

export default function SuggestionsScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{ suggestionId?: string }>();
  const focusedId = Number(params.suggestionId);
  const listRef = useRef<FlatList>(null);
  const { allowed, loading, error: accessError, retry: retryAccess } = useResidentAccess();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const suggestions = trpc.suggestions.mine.useQuery(undefined, { refetchInterval: 15000, enabled: allowed });
  const createSuggestion = trpc.suggestions.create.useMutation({ onSuccess: async () => { setTitle(""); setDescription(""); await suggestions.refetch(); Alert.alert("Sugestão enviada", "A gestão recebeu sua ideia."); }, onError: (error) => Alert.alert("Não foi possível enviar", error.message) });
  const updateSuggestion = trpc.suggestions.updateMine.useMutation({ onSuccess: async () => { setEditingId(null); await suggestions.refetch(); Alert.alert("Sugestão atualizada", "Sua ideia foi atualizada."); }, onError: (error) => Alert.alert("Não foi possível salvar", error.message) });

  useEffect(() => {
    const data = suggestions.data ?? [];
    if (!Number.isInteger(focusedId) || focusedId <= 0 || !data.length) return;
    const index = data.findIndex((item) => item.id === focusedId);
    if (index < 0) return;
    const timer = setTimeout(() => listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.18 }), 80);
    return () => clearTimeout(timer);
  }, [focusedId, suggestions.data]);

  if (loading) return <ResidentAccessLoading />;
  if (accessError) return <ScreenContainer className="p-5"><QueryState colors={colors} loading={false} error={accessError} errorTitle="Não foi possível verificar seu acesso" onRetry={() => void retryAccess()} /></ScreenContainer>;
  if (!allowed) return null;

  const submit = () => {
    if (title.trim().length < 3 || description.trim().length < 10) return Alert.alert("Complete os dados", "Informe um título e explique sua sugestão.");
    createSuggestion.mutate({ title: title.trim(), description: description.trim() });
  };
  const beginEdit = (item: Suggestion) => { setEditingId(item.id); setTitle(item.title); setDescription(item.description); };
  const cancelEdit = () => { setEditingId(null); setTitle(""); setDescription(""); };
  const saveEdit = () => { if (editingId === null) return; if (title.trim().length < 3 || description.trim().length < 10) return Alert.alert("Complete os dados", "Informe um título e explique sua sugestão."); updateSuggestion.mutate({ id: editingId, title: title.trim(), description: description.trim() }); };

  const isEditing = editingId !== null;
  return <ScreenContainer className="px-0 pt-0" edges={["left", "right", "bottom"]}><PageHeader kicker="PARTICIPE" title="Sugestões" subtitle="Boas ideias ajudam a transformar o bairro. Revise também as suas sugestões." /><View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 14 }}><Text style={[styles.label, { color: colors.foreground }]}>{isEditing ? "Editando sugestão" : "Nova sugestão"}</Text><TextInput value={title} onChangeText={setTitle} placeholder="Ex.: Mais iluminação na praça" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} /><TextInput value={description} onChangeText={setDescription} multiline placeholder="Explique como essa melhoria pode ajudar" placeholderTextColor={colors.muted} style={[styles.input, styles.textarea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} /><View style={styles.formActions}><Pressable disabled={createSuggestion.isPending || updateSuggestion.isPending} onPress={isEditing ? saveEdit : submit} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={styles.buttonText}>{createSuggestion.isPending || updateSuggestion.isPending ? "Salvando…" : isEditing ? "Salvar alterações" : "Enviar sugestão"}</Text></Pressable>{isEditing && <Pressable onPress={cancelEdit} style={[styles.cancelButton, { borderColor: colors.border }]}><Text style={[styles.cancelText, { color: colors.muted }]}>Cancelar</Text></Pressable>}</View><Text style={[styles.section, { color: colors.foreground }]}>Minhas sugestões</Text><FlatList ref={listRef} data={(suggestions.data ?? []) as Suggestion[]} keyExtractor={(item) => String(item.id)} renderItem={({ item }) => <View style={[styles.card, { backgroundColor: colors.surface, borderColor: item.id === focusedId ? colors.primary : colors.border }, item.id === focusedId && styles.focusedCard]}><Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.title}</Text><Text style={[styles.cardText, { color: colors.muted }]}>{item.description}</Text><View style={styles.cardFooter}><Text style={[styles.date, { color: colors.primary }]}>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</Text><Pressable onPress={() => beginEdit(item)} style={({ pressed }) => [styles.editButton, { borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.editText, { color: colors.primary }]}>Editar</Text></Pressable></View></View>} ListEmptyComponent={<QueryState colors={colors} loading={suggestions.isLoading} error={suggestions.error} empty={!suggestions.isLoading && !suggestions.error} emptyTitle="Nenhuma sugestão" emptyText="Você ainda não enviou sugestões." onRetry={() => void suggestions.refetch()} />} showsVerticalScrollIndicator={false} /> </View></ScreenContainer>;
}

const styles = StyleSheet.create({ header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }, back: { fontSize: 15, fontWeight: "700" }, title: { fontSize: 20, fontWeight: "800" }, intro: { fontSize: 14, lineHeight: 20, marginBottom: 12 }, label: { fontSize: 14, fontWeight: "800", marginTop: 8 }, input: { minHeight: 50, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, fontSize: 14, marginTop: 7 }, textarea: { minHeight: 105, paddingTop: 14, textAlignVertical: "top" }, formActions: { flexDirection: "row", gap: 9, marginTop: 16 }, button: { flex: 1, minHeight: 53, borderRadius: 16, alignItems: "center", justifyContent: "center" }, buttonText: { color: "#FFF", fontWeight: "800", fontSize: 15 }, cancelButton: { minHeight: 53, borderWidth: 1, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }, cancelText: { fontWeight: "800", fontSize: 13 }, section: { fontSize: 18, fontWeight: "800", marginTop: 24, marginBottom: 10 }, card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 }, focusedCard: { borderWidth: 2, shadowColor: "#0B5FD8", shadowOpacity: 0.18, shadowRadius: 8, elevation: 3 }, cardTitle: { fontSize: 15, fontWeight: "800" }, cardText: { fontSize: 13, lineHeight: 19, marginTop: 5 }, cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }, date: { fontSize: 11, fontWeight: "800" }, editButton: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 }, editText: { fontSize: 11, fontWeight: "800" }, empty: { fontSize: 13, paddingVertical: 20 }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] } });
