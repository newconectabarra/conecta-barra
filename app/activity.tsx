import { useMemo } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/pressable";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { QueryState } from "@/components/query-state";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/page-header";

const categoryLabels: Record<string, string> = {
  lighting: "Iluminação",
  water_shortage: "Falta de água",
  water_leak: "Vazamento de água",
  sewage_leak: "Vazamento de esgoto",
  mowing: "Roçada",
  paving: "Pavimentação",
  other: "Outro",
};

const categoryEmoji: Record<string, string> = {
  lighting: "💡",
  water_shortage: "💧",
  water_leak: "🚰",
  sewage_leak: "🕳️",
  mowing: "🌿",
  paving: "🛣️",
  other: "📌",
};

const statusLabels: Record<string, string> = {
  received: "Recebida",
  reviewing: "Em análise",
  forwarded: "Encaminhada",
  in_progress: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
};

const statusColors: Record<string, string> = {
  received: "#2563EB",
  reviewing: "#D97706",
  forwarded: "#7C3AED",
  in_progress: "#0891B2",
  completed: "#16A34A",
  cancelled: "#DC2626",
};

type TimelineItem = {
  id: string;
  kind: "request" | "status" | "announcement";
  date: Date;
  title: string;
  body: string;
  color: string;
  icon: "wrench.and.screwdriver.fill" | "clock.fill" | "megaphone.fill";
  status?: string;
};

function toDate(value: Date | string | number) {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function formatDate(value: Date) {
  if (value.getTime() === 0) return "Data indisponível";
  return value.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ActivityScreen() {
  const colors = useColors();
  const me = trpc.auth.me.useQuery(undefined, { retry: false, staleTime: 30_000 });
  const userId = me.data?.id ?? 0;
  const authReady = !me.isLoading;
  const queriesEnabled = authReady && userId > 0;
  const activity = trpc.requests.activity.useQuery(undefined, { enabled: queriesEnabled, refetchInterval: 10_000, refetchIntervalInBackground: false, staleTime: 2_000, retry: false });
  const announcements = trpc.announcements.list.useQuery(undefined, { enabled: queriesEnabled, refetchInterval: 45_000, refetchIntervalInBackground: false, staleTime: 2_000, retry: false });
  const notifications = trpc.notifications.list.useQuery(undefined, { enabled: queriesEnabled, refetchInterval: 10_000, refetchIntervalInBackground: false, staleTime: 2_000, retry: false });
  const requests = activity.data?.requests ?? [];
  const unreadCount = (notifications.data ?? []).filter((item) => !item.readAt).length;
  const activeCount = requests.filter((item) => !["completed", "cancelled"].includes(item.status)).length;
  const completedCount = requests.filter((item) => item.status === "completed").length;
  const timeline = useMemo<TimelineItem[]>(() => {
    const requestItems = activity.data?.requests ?? [];
    const updateItems = activity.data?.updates ?? [];
    return [
    ...requestItems.map((item) => ({
      id: `request-${item.id}`,
      kind: "request" as const,
      date: toDate(item.createdAt),
      title: `${categoryEmoji[item.category] ?? "📌"} Solicitação registrada`,
      body: `${categoryLabels[item.category] ?? "Solicitação"} · ${item.description}`,
      color: statusColors[item.status] ?? colors.primary,
      icon: "wrench.and.screwdriver.fill" as const,
      status: item.status,
    })),
    ...updateItems.map((item) => ({
      id: `status-${item.id}`,
      kind: "status" as const,
      date: toDate(item.createdAt),
      title: `${categoryEmoji[item.category] ?? "📌"} Status atualizado`,
      body: item.message ? `Solicitação #${item.requestId}: ${item.message}` : `Solicitação #${item.requestId} recebeu uma nova atualização.`,
      color: statusColors[item.status] ?? colors.primary,
      icon: "clock.fill" as const,
      status: item.status,
    })),
    ...(announcements.data ?? []).slice(0, 8).map((item) => ({
      id: `announcement-${item.id}`,
      kind: "announcement" as const,
      date: toDate(item.publishedAt),
      title: "📣 Novo comunicado",
      body: `${item.title}: ${item.content}`,
      color: colors.primary,
      icon: "megaphone.fill" as const,
    })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [activity.data?.requests, activity.data?.updates, announcements.data, colors.primary]);

  const refresh = async () => {
    if (me.error || !userId) {
      await me.refetch();
      return;
    }
    await Promise.all([activity.refetch(), announcements.refetch(), notifications.refetch()]);
  };
  const isLoading = me.isLoading || (queriesEnabled && (activity.isLoading || announcements.isLoading || notifications.isLoading));
  const hasError = Boolean(me.error || activity.isError || announcements.isError || notifications.isError);
  const sessionMissing = !me.isLoading && !me.error && !userId;

  return (
    <ScreenContainer className="px-0 pt-0" edges={["left", "right", "bottom"]}>
<PageHeader kicker="LINHA DO TEMPO" title="Minha atividade" subtitle="Tudo o que você enviou e recebeu." />
<View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 14 }}>
      <FlatList
        data={timeline}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={activity.isRefetching || announcements.isRefetching || notifications.isRefetching} onRefresh={() => void refresh()} tintColor={colors.primary} colors={[colors.primary]} />}
        ListHeaderComponent={
          <View>
            <Text style={[styles.intro, { color: colors.muted }]}>Acompanhe o que foi enviado, atualizado e comunicado pela gestão.</Text>
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "44" }]}><Text style={[styles.statValue, { color: colors.primary }]}>{requests.length}</Text><Text style={[styles.statLabel, { color: colors.muted }]}>Solicitações</Text></View>
              <View style={[styles.statCard, { backgroundColor: colors.warning + "16", borderColor: colors.warning + "55" }]}><Text style={[styles.statValue, { color: colors.warning }]}>{activeCount}</Text><Text style={[styles.statLabel, { color: colors.muted }]}>Em acompanhamento</Text></View>
              <View style={[styles.statCard, { backgroundColor: colors.success + "16", borderColor: colors.success + "55" }]}><Text style={[styles.statValue, { color: colors.success }]}>{completedCount}</Text><Text style={[styles.statLabel, { color: colors.muted }]}>Concluídas</Text></View>
            </View>
            <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}><IconSymbol name="bell.fill" size={19} color={colors.primary} /><Text style={[styles.noticeText, { color: colors.foreground }]}>{unreadCount ? `${unreadCount} aviso(s) não lido(s) na sua central.` : "Você está em dia com a central de avisos."}</Text></View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Linha do tempo</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.timelineCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.timelineIcon, { backgroundColor: item.color + "18" }]}><IconSymbol name={item.icon} size={20} color={item.color} /></View>
            <View style={styles.timelineCopy}>
              <Text style={[styles.timelineTitle, { color: colors.foreground }]}>{item.title}</Text>
              <Text style={[styles.timelineDate, { color: colors.muted }]}>{formatDate(item.date)}</Text>
              <Text style={[styles.timelineBody, { color: colors.muted }]} numberOfLines={4}>{item.body}</Text>
              {item.status && <View style={[styles.statusChip, { backgroundColor: (statusColors[item.status] ?? colors.primary) + "18" }]}><Text style={[styles.statusText, { color: statusColors[item.status] ?? colors.primary }]}>{statusLabels[item.status] ?? item.status}</Text></View>}
            </View>
          </View>
        )}
        ListEmptyComponent={isLoading ? <QueryState colors={colors} loading compact loadingText="Carregando sua atividade…" /> : hasError ? <QueryState colors={colors} loading={false} error={me.error ?? activity.error ?? announcements.error ?? notifications.error} compact errorTitle="Não foi possível carregar sua atividade" onRetry={() => void refresh()} /> : sessionMissing ? <QueryState colors={colors} loading={false} empty compact emptyTitle="Sessão não identificada" emptyText="Entre novamente para consultar sua atividade." onRetry={() => router.replace("/login")} retryLabel="Voltar ao login" /> : <QueryState colors={colors} loading={false} empty compact emptyTitle="Nenhuma atividade registrada" emptyText="Quando você enviar uma solicitação ou a gestão publicar um comunicado, tudo aparecerá aqui." />}
      />
    </View></ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 9 },
  backButton: { minHeight: 44, borderWidth: 1.5, borderRadius: 15, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  backText: { fontSize: 14, fontWeight: "900" },
  title: { fontSize: 20, fontWeight: "900" },
  headerSpacer: { width: 74 },
  listContent: { paddingBottom: 35, gap: 10 },
  intro: { fontSize: 13, lineHeight: 19, marginBottom: 15 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  statCard: { flex: 1, minHeight: 78, borderWidth: 1, borderRadius: 19, padding: 11, justifyContent: "center", shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  statValue: { fontSize: 23, lineHeight: 27, fontWeight: "900" },
  statLabel: { fontSize: 10, lineHeight: 14, fontWeight: "800", marginTop: 3 },
  notice: { minHeight: 48, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 18 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  sectionTitle: { fontSize: 18, fontWeight: "900", marginBottom: 2 },
  timelineCard: { borderWidth: 1, borderRadius: 21, padding: 14, flexDirection: "row", gap: 11, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  timelineIcon: { width: 41, height: 41, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  timelineCopy: { flex: 1, gap: 3 },
  timelineTitle: { fontSize: 14, lineHeight: 19, fontWeight: "900" },
  timelineDate: { fontSize: 11, fontWeight: "700" },
  timelineBody: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  statusChip: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, marginTop: 5 },
  statusText: { fontSize: 10, fontWeight: "900" },
  empty: { borderWidth: 1, borderRadius: 22, padding: 24, alignItems: "center", marginTop: 12, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  emptyTitle: { fontSize: 16, fontWeight: "900", marginTop: 10, textAlign: "center" },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 6 },
  retryButton: { marginTop: 14, minHeight: 44, paddingHorizontal: 18, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  retryText: { color: "#FFFFFF", fontWeight: "900", fontSize: 13 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
