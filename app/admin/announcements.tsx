import { useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { TextInput } from "@/components/text-input";
import { Pressable } from "@/components/pressable";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { QueryState } from "@/components/query-state";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/page-header";
import { SelectionField } from "@/components/selection-field";

const categories = [
  { value: "general", label: "Geral" },
  { value: "notice", label: "Aviso" },
  { value: "event", label: "Evento" },
  { value: "urgent", label: "Urgente" },
  { value: "civil_defense", label: "Defesa Civil" },
] as const;
type Category = (typeof categories)[number]["value"];
const audiences = [
  { value: "all", label: "Todos" },
  { value: "residents", label: "Moradores" },
  { value: "admins", label: "Administradores" },
] as const;
type Audience = (typeof audiences)[number]["value"];
const categoryLabels: Record<Category, string> = { general: "Geral", notice: "Aviso", event: "Evento", urgent: "Urgente", civil_defense: "Defesa Civil" };
const audienceLabels: Record<Audience, string> = { all: "Todos", residents: "Moradores", admins: "Administradores" };

export default function AdminAnnouncementsScreen() {
  const colors = useColors();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<Category>("general");
  const [audience, setAudience] = useState<Audience>("all");
  const [neighborhood, setNeighborhood] = useState("");
  const bairrosQuery = trpc.neighborhoods.list.useQuery(undefined, { staleTime: 5 * 60_000 });
  const [listCategory, setListCategory] = useState<Category | "all">("all");
  const [listAudience, setListAudience] = useState<Audience | "all">("all");
  const [listNeighborhood, setListNeighborhood] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [selectedLikeAnnouncementId, setSelectedLikeAnnouncementId] = useState<number | null>(null);
  const announcements = trpc.announcements.list.useQuery(undefined, {
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const likeUsers = trpc.announcements.likeUsers.useQuery(
    { id: selectedLikeAnnouncementId ?? 0 },
    {
      enabled: selectedLikeAnnouncementId !== null,
      refetchInterval: 45_000,
      refetchIntervalInBackground: false,
      retry: false,
    },
  );
  const create = trpc.announcements.create.useMutation({
    onSuccess: async () => {
      reset();
      await announcements.refetch();
      Alert.alert("Comunicado publicado", "Os moradores já podem visualizar a informação.");
    },
    onError: (error) => Alert.alert("Não foi possível publicar", error.message),
  });
  const update = trpc.announcements.update.useMutation({
    onSuccess: async () => {
      reset();
      await announcements.refetch();
      Alert.alert("Comunicado atualizado", "As alterações foram salvas.");
    },
    onError: (error) => Alert.alert("Não foi possível salvar", error.message),
  });
  const remove = trpc.announcements.delete.useMutation({
    onSuccess: async () => {
      await announcements.refetch();
      Alert.alert("Comunicado excluído", "O comunicado não aparece mais para os moradores.");
    },
    onError: (error) => Alert.alert("Não foi possível excluir", error.message),
  });

  const reset = () => {
    setTitle("");
    setContent("");
    setCategory("general");
    setAudience("all");
    setNeighborhood("");
    setEditing(null);
  };
  const submit = () => {
    if (title.trim().length < 3 || content.trim().length < 10) {
      Alert.alert("Revise o comunicado", "Informe título e mensagem com conteúdo suficiente.");
      return;
    }
    if (editing !== null) update.mutate({ id: editing, title: title.trim(), content: content.trim(), category, audience, neighborhood: neighborhood.trim() || undefined });
    else create.mutate({ title: title.trim(), content: content.trim(), category, audience, neighborhood: neighborhood.trim() || undefined });
  };
  const beginEdit = (item: NonNullable<typeof announcements.data>[number]) => {
    setEditing(item.id);
    setTitle(item.title);
    setContent(item.content);
    setCategory(item.category as Category);
    setAudience((item.audience as Audience | undefined) ?? "all");
    setNeighborhood(item.neighborhood ?? "");
  };
  const confirmDelete = (id: number) => Alert.alert("Excluir comunicado?", "Esta ação não pode ser desfeita.", [
    { text: "Cancelar", style: "cancel" },
    { text: "Excluir", style: "destructive", onPress: () => remove.mutate({ id }) },
  ]);
  const mutationBusy = create.isPending || update.isPending || remove.isPending;
  const data = announcements.data ?? [];
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const categoryMatches = listCategory === "all" || item.category === listCategory;
      const audienceMatches = listAudience === "all" || item.audience === listAudience;
      const neighborhoodMatches = !listNeighborhood || item.neighborhood === listNeighborhood;
      return categoryMatches && audienceMatches && neighborhoodMatches;
    });
  }, [data, listAudience, listCategory, listNeighborhood]);
  const selectedLikeAnnouncement = data.find((item) => item.id === selectedLikeAnnouncementId);
  const selectedLikeUsers = likeUsers.data ?? [];

  return (
    <ScreenContainer className="px-0 pt-0" edges={["left", "right", "bottom"]}><PageHeader kicker="GESTÃO" title="Comunicados" subtitle="Publique, edite ou exclua as informações oficiais." /><View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 14 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View style={{ width: 55 }} />
          </View>
          <Text style={[styles.formTitle, { color: colors.foreground }]}>{editing !== null ? "Editar comunicado" : "Novo comunicado"}</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Título" placeholderTextColor={colors.muted} style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.surface }]} />
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>Categoria</Text>
          <SelectionField value={category} options={categories} onChange={setCategory} title="Selecione a categoria" placeholder="Escolha uma categoria" accessibilityLabel="Selecionar categoria" />
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>Público do comunicado</Text>
          <SelectionField value={audience} options={audiences} onChange={setAudience} title="Selecione o público" placeholder="Escolha o público" accessibilityLabel="Selecionar público do comunicado" />
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13 }}>Público: bairro</Text>
          <SelectionField value={neighborhood} options={[{ value: "", label: "Toda a cidade" }, ...(bairrosQuery.data?.map((item) => ({ value: item.name, label: item.name })) ?? [])]} onChange={setNeighborhood} title="Selecione o bairro do público" placeholder={bairrosQuery.isLoading ? "Carregando bairros…" : "Toda a cidade"} accessibilityLabel="Selecionar bairro do público" disabled={bairrosQuery.isLoading} emptyText="Nenhum bairro disponível." />
          <TextInput value={content} onChangeText={setContent} placeholder="Mensagem" placeholderTextColor={colors.muted} style={[styles.input, styles.textArea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.surface }]} multiline textAlignVertical="top" />
          <View style={styles.actions}>
            <Pressable onPress={reset} disabled={mutationBusy} style={[styles.secondary, { borderColor: colors.border }, mutationBusy && styles.disabled]}><Text style={{ color: colors.muted, fontWeight: "900" }}>{editing !== null ? "Cancelar" : "Limpar"}</Text></Pressable>
            <Pressable disabled={mutationBusy} onPress={submit} style={[styles.primary, { backgroundColor: colors.primary }, mutationBusy && styles.disabled]}><Text style={styles.white}>{create.isPending || update.isPending ? "Salvando…" : editing !== null ? "Salvar edição" : "Publicar"}</Text></Pressable>
          </View>
          <Text style={[styles.section, { color: colors.foreground }]}>Comunicados publicados</Text>
          <View style={[styles.filterBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.filterTitle, { color: colors.foreground }]}>Filtros administrativos</Text>
            <Text style={[styles.filterLabel, { color: colors.muted }]}>Bairro</Text>
            <SelectionField value={listNeighborhood} options={[{ value: "", label: "Todos os bairros" }, ...(bairrosQuery.data?.map((item) => ({ value: item.name, label: item.name })) ?? [])]} onChange={setListNeighborhood} title="Filtrar por bairro" placeholder="Todos os bairros" accessibilityLabel="Filtrar comunicados por bairro" disabled={bairrosQuery.isLoading} />
            <Text style={[styles.filterLabel, { color: colors.muted }]}>Categoria</Text>
            <SelectionField value={listCategory} options={[{ value: "all", label: "Todas" }, ...categories]} onChange={setListCategory} title="Filtrar por categoria" placeholder="Todas" accessibilityLabel="Filtrar comunicados por categoria" />
            <Text style={[styles.filterLabel, { color: colors.muted }]}>Público</Text>
            <SelectionField value={listAudience} options={[{ value: "all", label: "Todos" }, ...audiences]} onChange={setListAudience} title="Filtrar por público" placeholder="Todos" accessibilityLabel="Filtrar comunicados por público" />
            <Text style={[styles.filterResult, { color: colors.muted }]}>{filteredData.length} comunicado(s) encontrado(s)</Text>
          </View>
          {announcements.isLoading ? <QueryState colors={colors} loading compact loadingText="Carregando comunicados…" /> : announcements.error ? <QueryState colors={colors} loading={false} error={announcements.error} compact errorTitle="Não foi possível carregar os comunicados" onRetry={() => void announcements.refetch()} /> : data.length === 0 ? <QueryState colors={colors} loading={false} empty compact emptyTitle="Nenhum comunicado publicado" emptyText="Os comunicados criados pela gestão aparecerão aqui." /> : filteredData.length === 0 ? <QueryState colors={colors} loading={false} empty compact emptyTitle="Nenhum comunicado corresponde aos filtros" emptyText="Ajuste categoria, público ou bairro para visualizar outros comunicados." /> : filteredData.map((item) => <View key={item.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.title}</Text><Text style={[styles.cardDate, { color: colors.muted }]}>Publicado em {new Date(item.publishedAt).toLocaleString("pt-BR")}{item.updatedAt && new Date(item.updatedAt).getTime() !== new Date(item.publishedAt).getTime() ? ` • atualizado em ${new Date(item.updatedAt).toLocaleDateString("pt-BR")}` : ""}</Text><Text style={[styles.cardAudience, { color: colors.primary }]}>{categoryLabels[item.category as Category] ?? item.category} • {audienceLabels[item.audience as Audience] ?? item.audience}{item.neighborhood ? ` • Bairro: ${item.neighborhood}` : " • Todos os bairros"}</Text><Text style={[styles.cardAuthor, { color: colors.muted }]}>Publicado por: {item.adminName ?? `Administrador #${item.adminId}`}</Text><Text style={[styles.cardText, { color: colors.muted }]}>{item.content}</Text>
<View style={[styles.likeSummary, { backgroundColor: colors.error + "12" }]}><Text style={{ color: colors.error, fontWeight: "900" }}>♥ {item.likeCount ?? 0} curtida(s) compartilhada(s)</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Ver moradores que curtiram ${item.title}`} onPress={() => setSelectedLikeAnnouncementId(item.id)} style={({ pressed }) => [styles.likePeopleButton, { borderColor: colors.error, backgroundColor: colors.error + "0B" }, pressed && styles.pressed]}><Text style={[styles.likePeopleButtonText, { color: colors.error }]}>👥 Ver quem curtiu</Text></Pressable><View style={styles.actions}><Pressable onPress={() => beginEdit(item)} disabled={mutationBusy} style={[styles.secondary, { borderColor: colors.primary }, mutationBusy && styles.disabled]}><Text style={{ color: colors.primary, fontWeight: "900" }}>Editar</Text></Pressable><Pressable onPress={() => confirmDelete(item.id)} disabled={mutationBusy} style={[styles.secondary, { borderColor: colors.error }, mutationBusy && styles.disabled]}><Text style={{ color: colors.error, fontWeight: "900" }}>Excluir</Text></Pressable></View></View>)}
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal visible={selectedLikeAnnouncementId !== null} transparent animationType="fade" onRequestClose={() => setSelectedLikeAnnouncementId(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleCopy}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Moradores que curtiram</Text>
                <Text numberOfLines={2} style={[styles.modalSubtitle, { color: colors.muted }]}>{selectedLikeAnnouncement?.title ?? "Comunicado selecionado"}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Fechar lista de curtidas" onPress={() => setSelectedLikeAnnouncementId(null)} style={({ pressed }) => [styles.modalClose, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.modalCloseText, { color: colors.foreground }]}>×</Text></Pressable>
            </View>
            {likeUsers.isLoading ? <QueryState colors={colors} loading compact loadingText="Carregando nomes…" /> : likeUsers.error ? <QueryState colors={colors} loading={false} error={likeUsers.error} compact errorTitle="Não foi possível carregar os nomes" onRetry={() => void likeUsers.refetch()} /> : selectedLikeUsers.length === 0 ? <QueryState colors={colors} loading={false} empty compact emptyTitle="Nenhuma curtida ainda" emptyText="Os nomes dos moradores aparecerão aqui quando eles curtirem este comunicado." /> : <ScrollView style={styles.likeUsersList} showsVerticalScrollIndicator={false}>{selectedLikeUsers.map((likeUser) => <View key={likeUser.userId} style={[styles.likeUserRow, { borderColor: colors.border }]}><View style={[styles.likeUserAvatar, { backgroundColor: colors.primary + "18" }]}><Text style={[styles.likeUserAvatarText, { color: colors.primary }]}>{likeUser.name.slice(0, 1).toUpperCase()}</Text></View><View style={styles.likeUserCopy}><Text style={[styles.likeUserName, { color: colors.foreground }]}>{likeUser.name}</Text><Text style={[styles.likeUserDate, { color: colors.muted }]}>{new Date(likeUser.likedAt).toLocaleString("pt-BR")}</Text></View><Text style={{ color: colors.error, fontSize: 20 }}>♥</Text></View>)}</ScrollView>}
            <Pressable onPress={() => setSelectedLikeAnnouncementId(null)} style={({ pressed }) => [styles.modalDone, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={styles.white}>Fechar</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View></ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32, gap: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  backButton: { minHeight: 44, borderWidth: 1.5, borderRadius: 15, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  back: { fontSize: 14, fontWeight: "900" },
  title: { fontSize: 20, fontWeight: "800" },
  intro: { fontSize: 13, lineHeight: 19 },
  formTitle: { fontSize: 18, fontWeight: "900", marginTop: 8 },
  fieldLabel: { fontSize: 11, fontWeight: "900", textTransform: "uppercase", marginTop: 4 },
  input: { minHeight: 54, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, fontSize: 14 },
  textArea: { minHeight: 130, paddingTop: 13 },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  category: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  actions: { flexDirection: "row", gap: 8, marginTop: 4 },
  primary: { flex: 1, minHeight: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  secondary: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  white: { color: "#fff", fontWeight: "900" },
  section: { fontSize: 18, fontWeight: "900", marginTop: 14 },
  filterBox: { borderWidth: 1, borderRadius: 18, padding: 13, gap: 8, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  filterTitle: { fontSize: 14, fontWeight: "900" },
  filterInput: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 13 },
  filterLabel: { fontSize: 11, fontWeight: "900", textTransform: "uppercase", marginTop: 2 },
  filterResult: { fontSize: 11, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 20, padding: 15, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: "900" },
  cardDate: { fontSize: 11, marginTop: 3 },
  cardAudience: { fontSize: 11, fontWeight: "900", marginTop: 5 },
  cardAuthor: { fontSize: 11, marginTop: 4 },
  cardText: { fontSize: 13, lineHeight: 19, marginVertical: 9 },
  likeSummary: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  likePeopleButton: { alignSelf: "flex-start", minHeight: 40, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", marginTop: 9 },
  likePeopleButtonText: { fontSize: 12, fontWeight: "900" },
  modalBackdrop: { flex: 1, backgroundColor: "#00000066", justifyContent: "center", padding: 20 },
  modalCard: { borderWidth: 1, borderRadius: 22, padding: 17, maxHeight: "78%", shadowColor: "#000000", shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 14 },
  modalTitleCopy: { flex: 1 },
  modalTitle: { fontSize: 18, fontWeight: "900" },
  modalSubtitle: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  modalClose: { width: 36, height: 36, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  modalCloseText: { fontSize: 25, lineHeight: 28, fontWeight: "400" },
  likeUsersList: { maxHeight: 330 },
  likeUserRow: { minHeight: 58, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  likeUserAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  likeUserAvatarText: { fontSize: 15, fontWeight: "900" },
  likeUserCopy: { flex: 1 },
  likeUserName: { fontSize: 14, fontWeight: "900" },
  likeUserDate: { fontSize: 11, marginTop: 3 },
  modalDone: { minHeight: 44, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 14 },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
