import { useEffect, useMemo, useState } from "react";
import { Reveal, SkeletonCard } from "@/components/ui-kit";
import * as Network from "expo-network";
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/pressable";
import { router, useLocalSearchParams } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { QueryState } from "@/components/query-state";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/page-header";

type Notice = {
  id: number;
  title: string;
  body: string;
  type: string;
  createdAt: Date | string;
  readAt?: Date | string | null;
  trashedAt?: Date | string | null;
  data?: Record<string, unknown>;
};

type ViewMode = "all" | "unread" | "read" | "trash";
type CategoryFilter = "all" | "announcements" | "requests" | "suggestions" | "account";
type DateSort = "newest" | "oldest";

const FILTER_OPTIONS: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "Todas as categorias" },
  { key: "announcements", label: "Comunicados" },
  { key: "requests", label: "Solicitações" },
  { key: "suggestions", label: "Sugestões" },
  { key: "account", label: "Conta" },
];

function categoryForNotificationType(type: string): CategoryFilter {
  if (type.includes("announcement")) return "announcements";
  if (type.includes("suggestion")) return "suggestions";
  if (type.includes("request")) return "requests";
  return "account";
}

function categoryLabel(type: string) {
  const category = categoryForNotificationType(type);
  return category === "announcements" ? "Comunicado" : category === "requests" ? "Solicitação" : category === "suggestions" ? "Sugestão" : "Conta";
}

function shortDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function timestamp(value: Date | string | null | undefined) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function fullDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" });
}

function friendlyError(error: { message?: string }) {
  const message = error.message ?? "";
  if (/html|unexpected character|failed to fetch|network|conexão/i.test(message)) return "A conexão com o servidor falhou. Verifique a internet e tente novamente.";
  return message || "Não foi possível concluir esta ação. Tente novamente.";
}

type NotificationRowProps = {
  item: Notice;
  colors: ReturnType<typeof useColors>;
  mode: ViewMode;
  selected: boolean;
  disabled: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onRead: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
};

function NotificationRow({ item, colors, mode, selected, disabled, onToggleSelect, onOpen, onRead, onTrash, onRestore, onPermanentDelete }: NotificationRowProps) {
  const isRead = Boolean(item.readAt);
  const statusColor = isRead ? colors.success : colors.primary;
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: selected ? colors.primary : colors.border }]}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`Selecionar aviso ${item.title}`} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onToggleSelect} style={({ pressed }) => [styles.checkbox, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : "transparent" }, pressed && styles.pressed]}>
        {selected && <Text style={styles.checkboxMark}>✓</Text>}
      </Pressable>
      <View style={styles.statusCell}>
        <View style={[styles.statusDot, { backgroundColor: mode === "trash" ? colors.error : statusColor }]} />
        <Text style={[styles.statusText, { color: mode === "trash" ? colors.error : statusColor }]}>{mode === "trash" ? "Lixeira" : isRead ? "Lido" : "Não lido"}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Abrir aviso ${item.title}`} onPress={onOpen} disabled={disabled} style={({ pressed }) => [styles.contentCell, pressed && styles.pressed]}>
        <View style={styles.rowTitleLine}><Text numberOfLines={1} style={[styles.rowTitle, { color: colors.foreground }]}>{item.title}</Text><Text style={[styles.category, { color: colors.muted }]}>{categoryLabel(item.type)}</Text></View>
        <Text numberOfLines={2} style={[styles.rowBody, { color: colors.muted }]}>{item.body}</Text>
        <Text style={[styles.rowDate, { color: colors.muted }]}>{shortDate(mode === "trash" ? item.trashedAt : item.createdAt)}</Text>
      </Pressable>
      <View style={styles.rowActions}>
        {mode !== "trash" && !isRead && <Pressable accessibilityRole="button" accessibilityLabel="Marcar aviso como lido" disabled={disabled} onPress={onRead} style={({ pressed }) => [styles.iconAction, { borderColor: colors.success }, pressed && styles.pressed, disabled && styles.disabled]}><Text style={[styles.iconActionText, { color: colors.success }]}>✓</Text></Pressable>}
        {mode === "trash" ? <><Pressable accessibilityRole="button" accessibilityLabel="Restaurar aviso" disabled={disabled} onPress={onRestore} style={({ pressed }) => [styles.iconAction, { borderColor: colors.primary }, pressed && styles.pressed, disabled && styles.disabled]}><Text style={[styles.iconActionText, { color: colors.primary }]}>↩</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Excluir aviso definitivamente" disabled={disabled} onPress={onPermanentDelete} style={({ pressed }) => [styles.iconAction, { borderColor: colors.error }, pressed && styles.pressed, disabled && styles.disabled]}><Text style={[styles.iconActionText, { color: colors.error }]}>×</Text></Pressable></> : <Pressable accessibilityRole="button" accessibilityLabel="Mover aviso para a lixeira" disabled={disabled} onPress={onTrash} style={({ pressed }) => [styles.iconAction, { borderColor: colors.error }, pressed && styles.pressed, disabled && styles.disabled]}><Text style={[styles.iconActionText, { color: colors.error }]}>⌫</Text></Pressable>}
      </View>
    </View>
  );
}

export default function NotificationsScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{ notificationId?: string }>();
  const focusedNotificationId = Number(params.notificationId);
  const networkState = Network.useNetworkState();
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const userId = me.data?.id ?? 0;
  const activeQuery = trpc.notifications.list.useQuery(undefined, { enabled: userId > 0, refetchInterval: 30_000, refetchIntervalInBackground: false, staleTime: 2_000, retry: false });
  const trashQuery = trpc.notifications.trash.useQuery(undefined, { enabled: userId > 0, refetchInterval: 30_000, refetchIntervalInBackground: false, staleTime: 2_000, retry: false });
  const weeklySummary = trpc.notifications.weeklySummary.useQuery(undefined, { enabled: userId > 0, refetchInterval: 30_000, refetchIntervalInBackground: false, staleTime: 15_000, retry: false });
  const [mode, setMode] = useState<ViewMode>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [dateSort, setDateSort] = useState<DateSort>("newest");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (!Number.isInteger(focusedNotificationId) || focusedNotificationId <= 0 || !activeQuery.data) return;
    const target = (activeQuery.data as Notice[]).find((item) => item.id === focusedNotificationId);
    if (!target) return;
    setSelectedNotice(target);
    if (!target.readAt) markRead.mutate({ id: target.id });
  }, [activeQuery.data, focusedNotificationId]);

  const moveToTrash = trpc.notifications.moveToTrash.useMutation({ onSuccess: async () => { setBusyId(null); await Promise.all([activeQuery.refetch(), trashQuery.refetch()]); }, onError: (error) => { setBusyId(null); Alert.alert("Não foi possível mover", friendlyError(error)); } });
  const moveToTrashMany = trpc.notifications.moveToTrashMany.useMutation({ onSuccess: async () => { setSelectedIds(new Set()); await Promise.all([activeQuery.refetch(), trashQuery.refetch()]); }, onError: (error) => Alert.alert("Não foi possível mover", friendlyError(error)) });
  const restore = trpc.notifications.restore.useMutation({ onSuccess: async () => { setBusyId(null); await Promise.all([activeQuery.refetch(), trashQuery.refetch()]); }, onError: (error) => { setBusyId(null); Alert.alert("Não foi possível restaurar", friendlyError(error)); } });
  const restoreMany = trpc.notifications.restoreMany.useMutation({ onSuccess: async () => { setSelectedIds(new Set()); await Promise.all([activeQuery.refetch(), trashQuery.refetch()]); }, onError: (error) => Alert.alert("Não foi possível restaurar", friendlyError(error)) });
  const permanentDelete = trpc.notifications.deletePermanently.useMutation({ onSuccess: async () => { setBusyId(null); await trashQuery.refetch(); }, onError: (error) => { setBusyId(null); Alert.alert("Não foi possível excluir", friendlyError(error)); } });
  const permanentDeleteMany = trpc.notifications.deletePermanentlyMany.useMutation({ onSuccess: async () => { setSelectedIds(new Set()); await trashQuery.refetch(); }, onError: (error) => Alert.alert("Não foi possível excluir", friendlyError(error)) });
  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: async () => { setBusyId(null); await activeQuery.refetch(); }, onError: (error) => { setBusyId(null); Alert.alert("Não foi possível marcar", friendlyError(error)); } });
  const markAllRead = trpc.notifications.markAllRead.useMutation({ onSuccess: async () => { await activeQuery.refetch(); }, onError: (error) => Alert.alert("Não foi possível marcar", friendlyError(error)) });

  const activeItems = (activeQuery.data ?? []) as Notice[];
  const trashItems = (trashQuery.data ?? []) as Notice[];
  const unreadItems = activeItems.filter((item) => !item.readAt);
  const unreadCount = unreadItems.length;
  const readItems = activeItems.filter((item) => Boolean(item.readAt));
  const modeItems = mode === "trash" ? trashItems : mode === "unread" ? unreadItems : mode === "read" ? readItems : activeItems;
  const items = useMemo(() => {
    const filtered = modeItems.filter((item) => categoryFilter === "all" || categoryForNotificationType(item.type) === categoryFilter);
    return [...filtered].sort((left, right) => {
      const leftDate = timestamp(mode === "trash" ? left.trashedAt ?? left.createdAt : left.createdAt);
      const rightDate = timestamp(mode === "trash" ? right.trashedAt ?? right.createdAt : right.createdAt);
      return dateSort === "newest" ? rightDate - leftDate : leftDate - rightDate;
    });
  }, [categoryFilter, dateSort, mode, modeItems]);
  const selectedVisibleIds = items.filter((item) => selectedIds.has(item.id)).map((item) => item.id);
  const allSelected = items.length > 0 && selectedVisibleIds.length === items.length;
  const isOffline = networkState.isInternetReachable === false || networkState.isConnected === false;
  const isBusy = busyId !== null || moveToTrashMany.isPending || restoreMany.isPending || permanentDeleteMany.isPending || markRead.isPending || markAllRead.isPending || moveToTrash.isPending || restore.isPending || permanentDelete.isPending;
  const refetchAll = () => void Promise.all([activeQuery.refetch(), trashQuery.refetch(), weeklySummary.refetch()]);

  const setView = (next: ViewMode) => { setMode(next); setSelectedIds(new Set()); setSelectedNotice(null); };
  const toggleSelect = (id: number) => setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleSelectAll = () => setSelectedIds((current) => { const next = new Set(current); if (allSelected) items.forEach((item) => next.delete(item.id)); else items.forEach((item) => next.add(item.id)); return next; });
  const ensureOnline = () => { if (!isOffline) return true; Alert.alert("Sem conexão", "Conecte-se à internet para alterar os avisos."); return false; };
  const askMoveToTrash = (ids: number[]) => { if (isBusy || !ids.length || !ensureOnline()) return; Alert.alert("Mover para a lixeira?", `${ids.length} aviso(s) poderão ser restaurado(s) depois.`, [{ text: "Cancelar", style: "cancel" }, { text: "Mover", style: "destructive", onPress: () => moveToTrashMany.mutate({ ids }) }]); };
  const askRestore = (ids: number[]) => { if (isBusy || !ids.length || !ensureOnline()) return; Alert.alert("Restaurar avisos?", `${ids.length} aviso(s) voltarão à lista ativa.`, [{ text: "Cancelar", style: "cancel" }, { text: "Restaurar", onPress: () => restoreMany.mutate({ ids }) }]); };
  const askPermanentDelete = (ids: number[]) => { if (isBusy || !ids.length || !ensureOnline()) return; Alert.alert("Excluir definitivamente?", "Depois desta ação, os avisos não poderão ser recuperados.", [{ text: "Cancelar", style: "cancel" }, { text: "Excluir definitivamente", style: "destructive", onPress: () => permanentDeleteMany.mutate({ ids }) }]); };
  const handleTrashOne = (id: number) => { if (isBusy || !ensureOnline()) return; setBusyId(id); Alert.alert("Mover aviso para a lixeira?", "Você poderá restaurá-lo depois.", [{ text: "Cancelar", style: "cancel", onPress: () => setBusyId(null) }, { text: "Mover", style: "destructive", onPress: () => moveToTrash.mutate({ id }) }]); };
  const handleRestoreOne = (id: number) => { if (isBusy || !ensureOnline()) return; setBusyId(id); restore.mutate({ id }); };
  const handlePermanentDeleteOne = (id: number) => { if (isBusy || !ensureOnline()) return; setBusyId(id); Alert.alert("Excluir definitivamente?", "Este aviso será removido permanentemente.", [{ text: "Cancelar", style: "cancel", onPress: () => setBusyId(null) }, { text: "Excluir", style: "destructive", onPress: () => permanentDelete.mutate({ id }) }]); };
  const handleReadOne = (id: number) => { if (isBusy) return; setBusyId(id); markRead.mutate({ id }); };
  const handleMarkAllRead = () => { if (!unreadItems.length || isBusy) return; markAllRead.mutate(); };
  const openRelatedContent = () => {
    if (!selectedNotice) return;
    const notice = selectedNotice;
    const screen = typeof notice.data?.screen === "string" ? notice.data.screen : "";
    const requestId = Number(notice.data?.requestId);
    const announcementId = Number(notice.data?.announcementId);
    setSelectedNotice(null);
    if (screen === "announcements" || notice.type.includes("announcement")) router.push({ pathname: me.data?.role === "admin" ? "/admin/announcements" : "/announcements", params: announcementId > 0 ? { announcementId: String(announcementId) } : undefined } as never);
    else if (screen === "requests" || notice.type.includes("request")) router.push(me.data?.role === "admin" && requestId > 0 ? { pathname: "/admin/request-detail", params: { id: String(requestId) } } : { pathname: "/requests", params: requestId > 0 ? { requestId: String(requestId) } : undefined } as never);
    else if (screen === "suggestions" || notice.type.includes("suggestion")) router.push(me.data?.role === "admin" ? "/admin/suggestions" : "/suggestions");
    else if (screen === "profile") router.push("/(tabs)/profile");
  };

  if (me.isLoading) return <ScreenContainer className="px-5 pt-5"><QueryState colors={colors} loading loadingText="Carregando avisos…" /></ScreenContainer>;
  if (me.error) return <ScreenContainer className="px-5 pt-5"><QueryState colors={colors} loading={false} error={me.error} errorTitle="Não foi possível verificar sua sessão" onRetry={() => void me.refetch()} /></ScreenContainer>;
  if (!userId) return <ScreenContainer className="px-5 pt-5"><QueryState colors={colors} loading={false} empty emptyTitle="Entre para ver seus avisos" emptyText="Faça login para consultar e organizar suas notificações." onRetry={() => router.replace("/login")} retryLabel="Voltar ao login" /></ScreenContainer>;

  const tabOptions: { key: ViewMode; label: string; count: number; icon: "bell.fill" | "checkmark.circle.fill" | "tray.fill" | "clock.fill" }[] = [
    { key: "all", label: "Todos", count: activeItems.length, icon: "bell.fill" },
    { key: "unread", label: "Não lidos", count: unreadCount, icon: "bell.fill" },
    { key: "read", label: "Lidos", count: readItems.length, icon: "checkmark.circle.fill" },
    { key: "trash", label: "Lixeira", count: trashItems.length, icon: "tray.fill" },
  ];

  return (
    <ScreenContainer className="px-0 pt-0" edges={["left", "right", "bottom"]}>
<PageHeader kicker="HISTÓRICO DE ALERTAS" title="Avisos recebidos" subtitle="Leia e organize os alertas enviados pela gestão." right={<Pressable accessibilityRole="button" accessibilityLabel="Abrir Configuração" onPress={() => router.push("/configuration")} style={{ backgroundColor: "#FFFFFF24", borderRadius: 999, padding: 9 }}><IconSymbol name="gearshape.fill" size={20} color="#FFFFFF" /></Pressable>} />
<View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 14 }}>
      <ScrollView style={styles.screenScroll} contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={true} nestedScrollEnabled>

        <View style={[styles.summaryCard, { backgroundColor: colors.primary, borderColor: colors.primary }]}> 
        <View style={styles.summaryCopy}><Text style={styles.summaryEyebrow}>SEUS ALERTAS</Text><Text style={styles.summaryTitle}>{unreadCount ? `${unreadCount} não lido(s)` : "Tudo em dia"}</Text><Text style={styles.summaryText}>{activeItems.length} recebido(s) • {trashItems.length} na lixeira</Text></View>
        <View style={styles.summaryIcon}><IconSymbol name="bell.fill" size={28} color="#FFFFFF" /></View>
      </View>

      <View style={[styles.weeklyCard, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityLabel="Resumo dos avisos dos últimos sete dias">
        <View style={styles.weeklyHeader}><View style={styles.weeklyCopy}><Text style={[styles.weeklyTitle, { color: colors.foreground }]}>Resumo da semana</Text><Text style={[styles.weeklySubtitle, { color: colors.muted }]}>Últimos 7 dias{weeklySummary.data?.since ? ` • desde ${new Date(weeklySummary.data.since).toLocaleDateString("pt-BR")}` : ""}</Text></View><Text style={[styles.weeklyTotal, { color: colors.primary }]}>{weeklySummary.data?.total ?? 0}</Text></View>
        <View style={styles.weeklyGrid}>
          {([
            ["Comunicados", weeklySummary.data?.byCategory.announcements ?? 0, colors.primary],
            ["Solicitações", weeklySummary.data?.byCategory.requests ?? 0, colors.warning],
            ["Sugestões", weeklySummary.data?.byCategory.suggestions ?? 0, colors.success],
            ["Conta", weeklySummary.data?.byCategory.account ?? 0, colors.muted],
          ] as const).map(([label, value, color]) => <View key={label} style={[styles.weeklyMetric, { backgroundColor: color + "12", borderColor: color + "40" }]}><Text style={[styles.weeklyMetricValue, { color }]}>{value}</Text><Text style={[styles.weeklyMetricLabel, { color: colors.muted }]}>{label}</Text></View>)}
        </View>
        <Text style={[styles.weeklyHint, { color: colors.muted }]}>{weeklySummary.data?.unread ?? 0} não lido(s) no período</Text>
      </View>

      <View style={[styles.syncBar, { backgroundColor: isOffline ? colors.error + "12" : colors.surface, borderColor: isOffline ? colors.error : colors.border }]} accessibilityLiveRegion="polite"><View style={styles.syncCopy}><Text style={[styles.syncTitle, { color: isOffline ? colors.error : colors.foreground }]}>{isOffline ? "Sem conexão" : "Sincronização online"}</Text><Text style={[styles.syncText, { color: colors.muted }]}>{activeQuery.dataUpdatedAt ? `Última sincronização: ${new Date(activeQuery.dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Aguardando atualização"}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Atualizar avisos agora" onPress={refetchAll} disabled={isBusy || activeQuery.isFetching || trashQuery.isFetching} style={({ pressed }) => [styles.syncButton, { borderColor: isOffline ? colors.error : colors.primary }, pressed && styles.pressed, isBusy && styles.disabled]}>{activeQuery.isFetching || trashQuery.isFetching ? <ActivityIndicator size="small" color={isOffline ? colors.error : colors.primary} /> : <Text style={[styles.syncButtonText, { color: isOffline ? colors.error : colors.primary }]}>Atualizar</Text>}</Pressable></View>

      <View style={styles.modeRow} accessibilityRole="tablist">
        {tabOptions.map((option) => { const active = mode === option.key; return <Pressable key={option.key} accessibilityRole="tab" accessibilityLabel={`${option.label}, ${option.count}`} accessibilityState={{ selected: active }} onPress={() => setView(option.key)} style={({ pressed }) => [styles.modeTab, { backgroundColor: active ? "#EAF4FF" : colors.surface, borderColor: active ? colors.primary : colors.border }, pressed && styles.pressed]}><IconSymbol name={option.icon} size={16} color={active ? colors.primary : colors.muted} /><Text style={[styles.modeLabel, { color: active ? colors.primary : colors.foreground }]}>{option.label}</Text><Text style={[styles.modeCount, { color: active ? colors.primary : colors.muted, backgroundColor: active ? "#FFFFFF" : colors.background }]}>{option.count}</Text></Pressable>; })}
      </View>

      <View style={styles.filterHeading}><Text style={[styles.filterHeadingText, { color: colors.foreground }]}>Filtros e ordenação</Text><Text style={[styles.filterResultText, { color: colors.muted }]}>{items.length} aviso(s) visível(is)</Text></View>
      <View style={styles.filterRow} accessibilityLabel="Filtrar avisos por categoria">{FILTER_OPTIONS.map((option) => { const active = categoryFilter === option.key; return <Pressable key={option.key} accessibilityRole="tab" accessibilityLabel={`Categoria ${option.label}`} accessibilityState={{ selected: active }} onPress={() => { setCategoryFilter(option.key); setSelectedIds(new Set()); }} style={({ pressed }) => [styles.filterChip, { backgroundColor: active ? colors.primary + "16" : colors.surface, borderColor: active ? colors.primary : colors.border }, pressed && styles.pressed]}><Text numberOfLines={2} style={[styles.filterLabel, { color: active ? colors.primary : colors.foreground }]}>{option.label}</Text></Pressable>; })}</View>
      <View style={styles.sortRow}><Text style={[styles.sortTitle, { color: colors.muted }]}>Ordenar por data:</Text><Pressable accessibilityRole="radio" accessibilityLabel="Mais recentes primeiro" accessibilityState={{ selected: dateSort === "newest" }} onPress={() => { setDateSort("newest"); setSelectedIds(new Set()); }} style={({ pressed }) => [styles.sortChip, { backgroundColor: dateSort === "newest" ? colors.primary : colors.surface, borderColor: dateSort === "newest" ? colors.primary : colors.border }, pressed && styles.pressed]}><IconSymbol name="arrow.down.circle.fill" size={14} color={dateSort === "newest" ? "#FFFFFF" : colors.muted} /><Text style={[styles.sortLabel, { color: dateSort === "newest" ? "#FFFFFF" : colors.foreground }]}>Mais recentes</Text></Pressable><Pressable accessibilityRole="radio" accessibilityLabel="Mais antigos primeiro" accessibilityState={{ selected: dateSort === "oldest" }} onPress={() => { setDateSort("oldest"); setSelectedIds(new Set()); }} style={({ pressed }) => [styles.sortChip, { backgroundColor: dateSort === "oldest" ? colors.primary : colors.surface, borderColor: dateSort === "oldest" ? colors.primary : colors.border }, pressed && styles.pressed]}><IconSymbol name="arrow.up.circle.fill" size={14} color={dateSort === "oldest" ? "#FFFFFF" : colors.muted} /><Text style={[styles.sortLabel, { color: dateSort === "oldest" ? "#FFFFFF" : colors.foreground }]}>Mais antigos</Text></Pressable></View>

      <View style={[styles.tableHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.tableHeaderText, { color: colors.muted }]}>SEL.</Text><Text style={[styles.tableHeaderText, styles.tableStatusHeader, { color: colors.muted }]}>STATUS</Text><Text style={[styles.tableHeaderText, styles.tableMainHeader, { color: colors.muted }]}>AVISO</Text><Text style={[styles.tableHeaderText, styles.tableActionHeader, { color: colors.muted }]}>AÇÕES</Text></View>
      {items.length > 0 && <View style={styles.bulkBar}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: allSelected, disabled: isBusy }} onPress={toggleSelectAll} disabled={isBusy} style={({ pressed }) => [styles.bulkButton, { borderColor: colors.primary, backgroundColor: colors.primary + "0D" }, pressed && styles.pressed, isBusy && styles.disabled]}><Text style={[styles.bulkText, { color: colors.primary }]}>{allSelected ? "Desmarcar todos" : "Selecionar todos"}</Text></Pressable>{mode === "trash" ? <><Pressable onPress={() => askRestore(selectedVisibleIds)} disabled={!selectedVisibleIds.length || isBusy} style={({ pressed }) => [styles.bulkButton, { borderColor: colors.primary }, pressed && styles.pressed, (!selectedVisibleIds.length || isBusy) && styles.disabled]}><Text style={[styles.bulkText, { color: colors.primary }]}>Restaurar{selectedVisibleIds.length ? ` (${selectedVisibleIds.length})` : ""}</Text></Pressable><Pressable onPress={() => askPermanentDelete(selectedVisibleIds)} disabled={!selectedVisibleIds.length || isBusy} style={({ pressed }) => [styles.bulkButton, { borderColor: colors.error }, pressed && styles.pressed, (!selectedVisibleIds.length || isBusy) && styles.disabled]}><Text style={[styles.bulkText, { color: colors.error }]}>Excluir definitivamente{selectedVisibleIds.length ? ` (${selectedVisibleIds.length})` : ""}</Text></Pressable></> : <><Pressable onPress={() => askMoveToTrash(selectedVisibleIds)} disabled={!selectedVisibleIds.length || isBusy} style={({ pressed }) => [styles.bulkButton, { borderColor: colors.error }, pressed && styles.pressed, (!selectedVisibleIds.length || isBusy) && styles.disabled]}><Text style={[styles.bulkText, { color: colors.error }]}>Mover para lixeira{selectedVisibleIds.length ? ` (${selectedVisibleIds.length})` : ""}</Text></Pressable><Pressable onPress={handleMarkAllRead} disabled={!unreadItems.length || isBusy} style={({ pressed }) => [styles.bulkButton, { borderColor: colors.success }, pressed && styles.pressed, (!unreadItems.length || isBusy) && styles.disabled]}><Text style={[styles.bulkText, { color: colors.success }]}>Marcar todas como lidas</Text></Pressable></>}</View>}

      {items.length > 0 ? <View style={styles.list}>{items.map((item, index) => <Reveal key={item.id} delay={Math.min(index, 8) * 45}><NotificationRow item={item} colors={colors} mode={mode} selected={selectedIds.has(item.id)} disabled={isBusy} onToggleSelect={() => toggleSelect(item.id)} onOpen={() => { if (!item.readAt) markRead.mutate({ id: item.id }); setSelectedNotice(item); }} onRead={() => handleReadOne(item.id)} onTrash={() => handleTrashOne(item.id)} onRestore={() => handleRestoreOne(item.id)} onPermanentDelete={() => handlePermanentDeleteOne(item.id)} /></Reveal>)}</View> : <View style={styles.emptyContent}>{activeQuery.isLoading || trashQuery.isLoading ? <View style={{ gap: 10, alignSelf: "stretch" }}><SkeletonCard lines={2} /><SkeletonCard lines={2} /><SkeletonCard lines={1} /></View> : activeQuery.isError || trashQuery.isError ? <><Text style={[styles.emptyTitle, { color: colors.error }]}>Não foi possível carregar esta lista</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Verifique a conexão e tente novamente.</Text><Pressable onPress={refetchAll} style={({ pressed }) => [styles.retryButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={styles.retryText}>Tentar novamente</Text></Pressable></> : <><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{mode === "trash" ? "Lixeira vazia" : mode === "unread" ? "Nenhum aviso não lido" : mode === "read" ? "Nenhum aviso lido" : "Nenhum aviso disponível"}</Text><Text style={[styles.emptyText, { color: colors.muted }]}>{mode === "trash" ? "Os avisos movidos para a lixeira aparecerão aqui." : "Quando a gestão publicar um comunicado, ele aparecerá nesta lista."}</Text></>}</View>}
      </ScrollView>

      <Modal visible={selectedNotice !== null} transparent animationType="fade" onRequestClose={() => setSelectedNotice(null)} accessibilityViewIsModal><View style={styles.modalBackdrop}>{selectedNotice && <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.modalHeader}><View style={styles.modalCopy}><Text style={[styles.modalEyebrow, { color: colors.primary }]}>{mode === "trash" ? "AVISO NA LIXEIRA" : "AVISO DO CONECTA BARRA"}</Text><Text style={[styles.modalTitle, { color: colors.foreground }]}>{selectedNotice.title}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Fechar aviso" onPress={() => setSelectedNotice(null)} style={({ pressed }) => [styles.closeButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.closeText, { color: colors.foreground }]}>×</Text></Pressable></View><View style={styles.modalMeta}><View style={[styles.statusPill, { backgroundColor: mode === "trash" ? colors.error + "18" : selectedNotice.readAt ? colors.success + "18" : colors.primary + "18", borderColor: mode === "trash" ? colors.error : selectedNotice.readAt ? colors.success : colors.primary }]}><View style={[styles.statusDot, { backgroundColor: mode === "trash" ? colors.error : selectedNotice.readAt ? colors.success : colors.primary }]} /><Text style={[styles.statusPillText, { color: mode === "trash" ? colors.error : selectedNotice.readAt ? colors.success : colors.primary }]}>{mode === "trash" ? "Na lixeira" : selectedNotice.readAt ? "Lido" : "Não lido"}</Text></View><Text style={[styles.modalDate, { color: colors.muted }]}>{fullDate(selectedNotice.createdAt)}</Text></View><ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}><Text selectable style={[styles.modalBody, { color: colors.foreground }]}>{selectedNotice.body}</Text></ScrollView><View style={styles.modalActions}>{(selectedNotice.data?.screen || selectedNotice.type.includes("announcement") || selectedNotice.type.includes("request") || selectedNotice.type.includes("suggestion")) && mode !== "trash" && <Pressable accessibilityRole="button" accessibilityLabel="Abrir conteúdo relacionado" onPress={openRelatedContent} style={({ pressed }) => [styles.modalAction, { backgroundColor: colors.primary + "12", borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.modalActionText, { color: colors.primary }]}>Abrir conteúdo relacionado</Text></Pressable>}{mode === "trash" ? <><Pressable onPress={() => { setSelectedNotice(null); handleRestoreOne(selectedNotice.id); }} disabled={isBusy} style={({ pressed }) => [styles.modalAction, { backgroundColor: colors.primary, borderColor: colors.primary }, pressed && styles.pressed, isBusy && styles.disabled]}><Text style={styles.modalLightText}>Restaurar</Text></Pressable><Pressable onPress={() => { setSelectedNotice(null); handlePermanentDeleteOne(selectedNotice.id); }} disabled={isBusy} style={({ pressed }) => [styles.modalAction, { backgroundColor: colors.error + "12", borderColor: colors.error }, pressed && styles.pressed, isBusy && styles.disabled]}><Text style={[styles.modalActionText, { color: colors.error }]}>Excluir definitivamente</Text></Pressable></> : <><Pressable onPress={() => { if (!selectedNotice.readAt) handleReadOne(selectedNotice.id); setSelectedNotice(null); }} disabled={isBusy || Boolean(selectedNotice.readAt)} style={({ pressed }) => [styles.modalAction, { backgroundColor: colors.success, borderColor: colors.success }, pressed && styles.pressed, (isBusy || Boolean(selectedNotice.readAt)) && styles.disabled]}><Text style={styles.modalLightText}>{selectedNotice.readAt ? "Já lido" : "Marcar como lido"}</Text></Pressable><Pressable onPress={() => { setSelectedNotice(null); handleTrashOne(selectedNotice.id); }} disabled={isBusy} style={({ pressed }) => [styles.modalAction, { backgroundColor: colors.error + "12", borderColor: colors.error }, pressed && styles.pressed, isBusy && styles.disabled]}><Text style={[styles.modalActionText, { color: colors.error }]}>Mover para lixeira</Text></Pressable></>}<Pressable onPress={() => setSelectedNotice(null)} style={({ pressed }) => [styles.modalAction, { backgroundColor: colors.background, borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.modalActionText, { color: colors.foreground }]}>Fechar</Text></Pressable></View></View>}</View></Modal>
    </View></ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenScroll: { flex: 1 },
  screenContent: { flexGrow: 1, paddingBottom: 40, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  backButton: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  backText: { fontSize: 14, fontWeight: "900" },
  headerCopy: { flex: 1, gap: 1 },
  eyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1.3 },
  title: { fontSize: 27, lineHeight: 32, fontWeight: "900" },
  subtitle: { fontSize: 12, lineHeight: 18 },
  configButton: { width: 44, height: 44, borderWidth: 1.5, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  summaryCard: { minHeight: 92, borderWidth: 1, borderRadius: 23, padding: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  summaryCopy: { flex: 1, gap: 2 },
  summaryEyebrow: { color: "#DCEBFF", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  summaryTitle: { color: "#FFFFFF", fontSize: 22, lineHeight: 27, fontWeight: "900" },
  summaryText: { color: "#E8F1FF", fontSize: 11 },
  summaryIcon: { width: 52, height: 52, borderRadius: 17, backgroundColor: "#FFFFFF25", alignItems: "center", justifyContent: "center" },
  weeklyCard: { borderWidth: 1, borderRadius: 20, padding: 13, marginBottom: 10, gap: 9, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  weeklyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  weeklyCopy: { flex: 1, gap: 2 },
  weeklyTitle: { fontSize: 15, fontWeight: "900" },
  weeklySubtitle: { fontSize: 10, lineHeight: 15 },
  weeklyTotal: { fontSize: 25, lineHeight: 29, fontWeight: "900" },
  weeklyGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  weeklyMetric: { width: "48.5%", minHeight: 47, borderWidth: 1, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 7, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  weeklyMetricValue: { fontSize: 18, fontWeight: "900" },
  weeklyMetricLabel: { fontSize: 10, fontWeight: "800", textAlign: "right", flex: 1 },
  weeklyHint: { fontSize: 10, fontWeight: "800" },
  syncBar: { minHeight: 49, borderWidth: 1, borderRadius: 15, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 },
  syncCopy: { flex: 1, gap: 1 },
  syncTitle: { fontSize: 11, fontWeight: "900" },
  syncText: { fontSize: 10 },
  syncButton: { minWidth: 72, minHeight: 34, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 9 },
  syncButtonText: { fontSize: 11, fontWeight: "900" },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 11 },
  modeTab: { width: "48%", minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  modeLabel: { fontSize: 11, fontWeight: "900" },
  modeCount: { minWidth: 19, height: 19, paddingHorizontal: 4, borderRadius: 10, textAlign: "center", textAlignVertical: "center", fontSize: 10, fontWeight: "900" },
  filterHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 4, paddingHorizontal: 2, paddingBottom: 7 },
  filterHeadingText: { fontSize: 12, fontWeight: "900" },
  filterResultText: { fontSize: 10, fontWeight: "900", color: "#000000" },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, paddingBottom: 9 },
  filterChip: { width: "48.5%", minHeight: 42, borderWidth: 1.5, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 7, alignItems: "center", justifyContent: "center" },
  filterLabel: { fontSize: 11, lineHeight: 14, fontWeight: "900", color: "#000000", textAlign: "center" },
  sortRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, paddingBottom: 9 },
  sortTitle: { width: "100%", fontSize: 10, fontWeight: "900", color: "#000000", marginRight: 1 },
  sortChip: { minHeight: 32, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  sortLabel: { fontSize: 10, fontWeight: "900", color: "#000000" },
  tableHeader: { minHeight: 30, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  tableHeaderText: { fontSize: 9, lineHeight: 11, fontWeight: "900", letterSpacing: 0.4, width: 31 },
  tableStatusHeader: { width: 54, textAlign: "center" },
  tableMainHeader: { flex: 1 },
  tableActionHeader: { width: 40, textAlign: "center" },
  bulkBar: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingBottom: 8 },
  bulkButton: { minHeight: 35, borderWidth: 1, borderRadius: 11, paddingHorizontal: 9, alignItems: "center", justifyContent: "center" },
  bulkText: { fontSize: 10, fontWeight: "900" },
  listFlex: { flex: 1, minHeight: 0 },
  list: { gap: 7, paddingBottom: 34 },
  emptyList: { flexGrow: 1, paddingBottom: 34 },
  row: { minHeight: 94, borderWidth: 1, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 8 },
  checkbox: { width: 26, height: 26, borderWidth: 1.5, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  checkboxMark: { color: "#FFFFFF", fontSize: 15, lineHeight: 18, fontWeight: "900" },
  statusCell: { width: 54, alignItems: "center", gap: 3 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 8, lineHeight: 10, fontWeight: "900", textAlign: "center" },
  contentCell: { flex: 1, minWidth: 0, gap: 2 },
  rowTitleLine: { alignItems: "flex-start", gap: 2 },
  rowTitle: { fontSize: 12, lineHeight: 16, fontWeight: "900" },
  category: { fontSize: 8, fontWeight: "800" },
  rowBody: { fontSize: 10, lineHeight: 14 },
  rowDate: { fontSize: 9, marginTop: 1 },
  rowActions: { width: 40, alignItems: "center", gap: 5 },
  iconAction: { width: 32, height: 32, borderWidth: 1.3, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  iconActionText: { fontSize: 17, lineHeight: 19, fontWeight: "900" },
  emptyContent: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "900", textAlign: "center" },
  emptyText: { fontSize: 12, lineHeight: 18, textAlign: "center", maxWidth: 300 },
  retryButton: { minHeight: 42, marginTop: 6, paddingHorizontal: 17, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  retryText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.58)", justifyContent: "center", padding: 18 },
  modalCard: { maxHeight: "88%", borderWidth: 1, borderRadius: 25, padding: 17, gap: 12, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  modalCopy: { flex: 1, gap: 3 },
  modalEyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  modalTitle: { fontSize: 20, lineHeight: 26, fontWeight: "900" },
  closeButton: { width: 35, height: 35, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  closeText: { fontSize: 24, lineHeight: 26, fontWeight: "500" },
  modalMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  statusPill: { minHeight: 29, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  statusPillText: { fontSize: 10, fontWeight: "900" },
  modalDate: { flex: 1, fontSize: 10, textAlign: "right" },
  modalScroll: { maxHeight: 330 },
  modalScrollContent: { paddingVertical: 4 },
  modalBody: { fontSize: 16, lineHeight: 25 },
  modalActions: { gap: 8 },
  modalAction: { minHeight: 44, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  modalLightText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  modalActionText: { fontSize: 12, fontWeight: "900", textAlign: "center" },
  pressed: { opacity: 0.74, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.5 },
});
