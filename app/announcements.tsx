import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/pressable";
import { router, useLocalSearchParams } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { QueryState } from "@/components/query-state";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/page-header";

const labels: Record<string, string> = { event: "Evento", notice: "Aviso", urgent: "Urgente", general: "Geral", civil_defense: "Defesa Civil" };

export default function AnnouncementsScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{ announcementId?: string }>();
  const focusedId = Number(params.announcementId);
  const listRef = useRef<FlatList>(null);
  const [activeLikeId, setActiveLikeId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const announcements = trpc.announcements.list.useQuery(undefined, {
    refetchInterval: 8_000,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
    retry: false,
  });
  const like = trpc.announcements.like.useMutation({
    onMutate: ({ id }) => {
      setActiveLikeId(id);
      setFeedback(null);
    },
    onSuccess: async (result) => {
      await announcements.refetch();
      setActiveLikeId(null);
      setFeedback(result.liked ? "Curtida registrada para este comunicado." : "Sua curtida foi removida.");
    },
    onError: (error) => {
      setActiveLikeId(null);
      Alert.alert("Não foi possível atualizar a curtida", error.message);
    },
  });
  const data = useMemo(() => announcements.data ?? [], [announcements.data]);

  useEffect(() => {
    if (!Number.isInteger(focusedId) || focusedId <= 0 || !data.length) return;
    const index = data.findIndex((item) => item.id === focusedId);
    if (index < 0) return;
    const timer = setTimeout(() => listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.18 }), 80);
    return () => clearTimeout(timer);
  }, [data, focusedId]);

  return (
    <ScreenContainer className="px-0 pt-0" edges={["left", "right", "bottom"]}>
<PageHeader kicker="MURAL" title="Comunicados" subtitle="Avisos locais e do seu bairro, em tempo real." />
<View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 14 }}>
      <View style={[styles.syncHint, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.syncHintText, { color: colors.muted }]}>{announcements.dataUpdatedAt ? `Atualizado às ${new Date(announcements.dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Sincronizando comunicados…"}</Text><Pressable accessibilityRole="button" accessibilityLabel="Atualizar comunicados" onPress={() => void announcements.refetch()} disabled={announcements.isFetching} style={({ pressed }) => [styles.syncButton, { borderColor: colors.primary }, pressed && styles.pressed, announcements.isFetching && styles.disabled]}><Text style={[styles.syncButtonText, { color: colors.primary }]}>{announcements.isFetching ? "…" : "Atualizar"}</Text></Pressable></View>
      {feedback && <Text accessibilityLiveRegion="polite" style={[styles.feedback, { color: colors.success, backgroundColor: colors.success + "14", borderColor: colors.success + "55" }]}>{feedback}</Text>}
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          const isLiked = Boolean(item.likedByMe);
          const isThisLikePending = activeLikeId === item.id;
          return (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: item.id === focusedId ? colors.primary : colors.border }, item.id === focusedId && styles.focusedCard]}>
              <View style={styles.top}>
                <Text style={[styles.category, { color: colors.primary }]}>{labels[item.category] ?? item.category}</Text>
                <Text style={[styles.date, { color: colors.muted }]}>{new Date(item.publishedAt).toLocaleDateString("pt-BR")}</Text>
              </View>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.title}</Text>
              <Text style={[styles.cardText, { color: colors.muted }]}>{item.content}</Text>
              <View style={[styles.reactionBox, { backgroundColor: colors.primary + "0B", borderColor: colors.primary + "30" }]}>
                <View style={styles.reactionCopy}>
                  <Text style={[styles.reactionTitle, { color: colors.foreground }]}>💙 Sua opinião importa</Text>
                  <Text style={[styles.reactionHint, { color: colors.muted }]}>Toque no botão para curtir este comunicado.</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isLiked ? `Remover curtida. ${item.likeCount ?? 0} curtidas` : `Curtir comunicado. ${item.likeCount ?? 0} curtidas`}
                  accessibilityState={{ disabled: like.isPending, selected: isLiked }}
                  disabled={like.isPending}
                  onPress={() => like.mutate({ id: item.id })}
                  style={({ pressed }) => [styles.likeButton, { backgroundColor: isLiked ? colors.error : colors.primary, borderColor: isLiked ? colors.error : colors.primary }, pressed && styles.pressed, like.isPending && styles.disabled]}
                >
                  <Text style={styles.likeButtonText}>{isThisLikePending ? "…" : isLiked ? "♥ Curtido" : "♡ Curtir"}</Text>
                  <Text style={styles.likeCount}>{item.likeCount ?? 0}</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={announcements.isLoading ? <QueryState colors={colors} loading compact loadingText="Carregando comunicados…" /> : announcements.error ? <QueryState colors={colors} loading={false} error={announcements.error} compact errorTitle="Não foi possível carregar os comunicados" onRetry={() => void announcements.refetch()} /> : <QueryState colors={colors} loading={false} empty compact emptyTitle="Nenhum comunicado publicado" emptyText="Os comunicados do Conecta Barra aparecerão aqui." />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={data.length ? undefined : styles.emptyList}
      />
    </View></ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  backButton: { minHeight: 44, borderWidth: 1.5, borderRadius: 15, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  back: { fontSize: 15, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800" },
  intro: { fontSize: 13, lineHeight: 19, marginBottom: 8 },
  syncHint: { minHeight: 38, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  syncHintText: { flex: 1, fontSize: 11, fontWeight: "700" },
  syncButton: { minHeight: 30, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, alignItems: "center", justifyContent: "center" },
  syncButtonText: { fontSize: 11, fontWeight: "900" },
  feedback: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 9, fontSize: 12, fontWeight: "800", marginBottom: 10 },
  card: { borderWidth: 1, borderRadius: 19, padding: 15, marginBottom: 11, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  focusedCard: { borderWidth: 2, shadowColor: "#0B5FD8", shadowOpacity: 0.18, shadowRadius: 8, elevation: 3 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  category: { fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  date: { fontSize: 11 },
  cardTitle: { fontSize: 17, fontWeight: "800", marginTop: 9 },
  cardText: { fontSize: 14, lineHeight: 21, marginTop: 7 },
  reactionBox: { borderWidth: 1, borderRadius: 15, padding: 10, marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  reactionCopy: { flex: 1 },
  reactionTitle: { fontSize: 12, fontWeight: "900" },
  reactionHint: { fontSize: 11, lineHeight: 15, marginTop: 3 },
  likeButton: { minHeight: 44, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  likeButtonText: { color: "#FFFFFF", fontWeight: "900", fontSize: 12 },
  likeCount: { color: "#FFFFFF", fontWeight: "900", fontSize: 12 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
