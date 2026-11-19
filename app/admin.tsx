import { describePushErrors } from "@/lib/push-diagnostics";
import { ensureDeviceRegistered } from "@/lib/push-register";
import { getCurrentPushToken } from "@/lib/push-token";
import * as Device from "expo-device";
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { TextInput } from "@/components/text-input";
import { Pressable } from "@/components/pressable";
import { useEffect, useMemo, useState } from "react";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Image } from "expo-image";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { clearUserInfo, removeSessionToken } from "@/lib/_core/auth";
import { QueryState } from "@/components/query-state";
import { CATEGORY_LABELS as categoryLabels, STATUS_LABELS as statusLabels } from "@/shared/categories";
import { GradientHeader } from "@/components/gradient-header";
import { LiveBadge } from "@/components/realtime-provider";
import { PrefeituraBadge } from "@/components/brand-logo";
import { SelectionField } from "@/components/selection-field";
import { AdminDetailSheet, DetailEmpty, DetailRow } from "@/components/admin-detail-sheet";
import { requestProtocol } from "@/shared/categories";

type DetailKind = "open" | "in_progress" | "completed" | "pending_residents" | "open_requests" | "unread_notifications" | "email_failures";
const OPEN_STATUSES = ["received", "reviewing", "forwarded"];
const emailPurposeLabels: Record<string, string> = { verification: "Confirmação de cadastro", admin_registration: "Aviso de novo cadastro", password_reset: "Recuperação de senha", test: "E-mail de teste" };
const escapeHtml = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const formatDateTime = (value: Date | string) => new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const statusFilters = [
  { value: "all", label: "Todos" },
  { value: "reviewing", label: "Em análise" },
  { value: "in_progress", label: "Em andamento" },
  { value: "completed", label: "Concluídas" },
] as const;
const periodFilters = [
  { value: "all", label: "Todo período" },
  { value: "today", label: "Hoje" },
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
] as const;
const QUEUE_PAGE_SIZE = 8;

export default function AdminDashboard() {
  const colors = useColors();
  const [statusFilter, setStatusFilter] = useState<(typeof statusFilters)[number]["value"]>("all");
  const [periodFilter, setPeriodFilter] = useState<(typeof periodFilters)[number]["value"]>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [queueLimit, setQueueLimit] = useState(QUEUE_PAGE_SIZE);
  const shortageReport = trpc.reports.waterShortage.useQuery(undefined, { enabled: false });
  const [bairro, setBairro] = useState<string | undefined>(undefined);
  const bairros = trpc.neighborhoods.list.useQuery(undefined, { staleTime: 5 * 60_000 });
  const allRequests = trpc.requests.all.useQuery(bairro ? { neighborhood: bairro } : undefined, { refetchInterval: 30_000, refetchIntervalInBackground: false, staleTime: 2_000, retry: false });
  const residentsQuery = trpc.residents.all.useQuery(bairro ? { neighborhood: bairro } : undefined, { refetchInterval: 30_000, refetchIntervalInBackground: false, staleTime: 20_000, retry: false });
  const notificationQuery = trpc.notifications.list.useQuery(undefined, { refetchInterval: 30_000, refetchIntervalInBackground: false, staleTime: 2_000, retry: false });
  const adminSummary = trpc.admin.dashboard.useQuery(bairro ? { neighborhood: bairro } : undefined, { refetchInterval: 45_000, refetchIntervalInBackground: false, staleTime: 8_000, retry: false });
  const [detail, setDetail] = useState<DetailKind | null>(null);
  const [testEmailTo, setTestEmailTo] = useState("");
  const emailLogs = trpc.admin.emailDelivery.useQuery({ limit: 60 }, { enabled: detail === "email_failures", staleTime: 0, retry: false });
  const emailStatus = trpc.admin.emailStatus.useQuery(undefined, { enabled: detail === "email_failures", retry: false });
  const sendTestEmail = trpc.admin.testEmail.useMutation({
    onSuccess: (result) => { Alert.alert("E-mail enviado", `O provedor ${result.provider} aceitou a mensagem. Confira a caixa de entrada (e o spam) de ${testEmailTo.trim()}.`); void emailLogs.refetch(); },
    onError: (error) => { Alert.alert("Falha no envio", error.message); void emailLogs.refetch(); },
  });
  const emailDelivery = trpc.admin.emailDelivery.useQuery({ limit: 5 }, { refetchInterval: 45_000, refetchIntervalInBackground: false, staleTime: 8_000, retry: false });
  const unreadNotificationCount = (notificationQuery.data ?? []).filter((item) => !item.readAt).length;
  const requestRows = useMemo(() => allRequests.data ?? [], [allRequests.data]);
  const overdueRequests = useMemo(() => requestRows.filter((item) => !["completed", "cancelled"].includes(item.status) && Date.now() - new Date(item.createdAt).getTime() >= 5 * 24 * 60 * 60 * 1000), [requestRows]);
  const metrics = useMemo(() => [
    { label: "Em aberto", value: String(requestRows.filter((item) => ["received", "reviewing", "forwarded"].includes(item.status)).length), tone: "warning" as const, icon: "tray.fill" as const, kind: "open" as DetailKind },
    { label: "Em andamento", value: String(requestRows.filter((item) => item.status === "in_progress").length), tone: "primary" as const, icon: "arrow.triangle.2.circlepath" as const, kind: "in_progress" as DetailKind },
    { label: "Concluídas", value: String(requestRows.filter((item) => item.status === "completed").length), tone: "success" as const, icon: "checkmark.circle.fill" as const, kind: "completed" as DetailKind },
    { label: "Aguardando há 5+ dias", value: String(overdueRequests.length), tone: "error" as const, icon: "exclamationmark.triangle.fill" as const, kind: "open" as DetailKind },
  ], [overdueRequests.length, requestRows]);
  const filteredRows = useMemo(() => {
    const cutoff = periodFilter === "all" ? null : periodFilter === "today" ? new Date(new Date().setHours(0, 0, 0, 0)).getTime() : Date.now() - Number(periodFilter) * 24 * 60 * 60 * 1000;
    return requestRows.filter((item) => {
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesPeriod = cutoff === null || new Date(item.createdAt).getTime() >= cutoff;
      const normalizedSearch = searchQuery.trim().toLocaleLowerCase("pt-BR");
      const searchable = [item.requesterName, item.requesterUsername, item.fullAddress, item.description, categoryLabels[item.category]].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
      const matchesSearch = !normalizedSearch || searchable.includes(normalizedSearch);
      return matchesStatus && matchesPeriod && matchesSearch;
    });
  }, [periodFilter, requestRows, searchQuery, statusFilter]);
  const visibleRows = filteredRows.slice(0, queueLimit);
  useEffect(() => { setQueueLimit(QUEUE_PAGE_SIZE); }, [bairro, periodFilter, searchQuery, statusFilter]);
  const residentMatches = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLocaleLowerCase("pt-BR");
    if (normalizedSearch.length < 2) return [];
    return (residentsQuery.data ?? []).filter((resident) => [resident.name, resident.username, resident.email, resident.phone, resident.address].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(normalizedSearch)).slice(0, 5);
  }, [residentsQuery.data, searchQuery]);
  const statusBreakdown = useMemo(() => [
    { label: "Recebidas", value: requestRows.filter((item) => item.status === "received").length, color: colors.primary },
    { label: "Em análise", value: requestRows.filter((item) => item.status === "reviewing").length, color: colors.warning },
    { label: "Em andamento", value: requestRows.filter((item) => item.status === "in_progress").length, color: "#0284C7" },
    { label: "Concluídas", value: requestRows.filter((item) => item.status === "completed").length, color: colors.success },
  ], [colors.primary, colors.success, colors.warning, requestRows]);
  const categoryBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    requestRows.forEach((item) => counts.set(item.category, (counts.get(item.category) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key, value]) => ({ label: categoryLabels[key] ?? key, value }));
  }, [requestRows]);
  const regionBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    requestRows.forEach((item) => {
      const region = item.fullAddress.split(",")[0]?.trim() || "Endereço informado";
      counts.set(region, (counts.get(region) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({ label, value }));
  }, [requestRows]);
  const maxChartValue = Math.max(1, ...statusBreakdown.map((item) => item.value), ...categoryBreakdown.map((item) => item.value), ...regionBreakdown.map((item) => item.value));
  const updateStatus = trpc.requests.updateStatus.useMutation({ onSuccess: () => void allRequests.refetch(), onError: (error) => Alert.alert("Não foi possível atualizar", error.message) });
  const deleteRequest = trpc.requests.delete.useMutation({ onSuccess: () => void allRequests.refetch(), onError: (error) => Alert.alert("Não foi possível excluir", error.message) });
  const registerDevice = trpc.notifications.registerDevice.useMutation();
  const testPush = trpc.notifications.testPush.useMutation({
    onSuccess: (result) => {
      const { delivery } = result;
      const delivered = delivery.delivered ?? delivery.accepted ?? 0;
      if (delivered > 0) Alert.alert("Push enviado", "O serviço de notificações aceitou o teste. Verifique o aparelho conectado e as permissões do Android.");
      else if (delivery.reason === "no_registered_token") Alert.alert("Aparelho não registrado", "Abra a versão atualizada do aplicativo, permita notificações e mantenha a conta conectada por alguns segundos antes de repetir.");
      else Alert.alert("Push não confirmado", `O serviço não confirmou a entrega${delivery.receiptErrors ? ` (${delivery.receiptErrors} recibo(s) com erro)` : ""}. ${describePushErrors(delivery.errors) || "Abra o aplicativo novamente para renovar o registro."}`);
    },
    onError: (error) => Alert.alert("Não foi possível enviar o push", error.message),
  });
  const utils = trpc.useUtils();
  const sendTestPush = async () => {
    if (testPush.isPending || registerDevice.isPending) return;
    try {
      // Registra este aparelho pela mesma rotina do app (FCM direto quando disponível, senão Expo) e dispara o teste.
      if (Platform.OS !== "web" && Device.isDevice) await ensureDeviceRegistered(utils.client);
      else if (!getCurrentPushToken()) throw new Error("O aparelho ainda não possui um token de push. Abra o aplicativo, mantenha a conta conectada por alguns segundos e tente novamente.");
      testPush.mutate();
    } catch (error) {
      Alert.alert("Não foi possível preparar o push", error instanceof Error ? error.message : "Abra o aplicativo novamente e tente outra vez.");
    }
  };
  const confirmDeleteRequest = (id: number) => Alert.alert("Excluir solicitação?", "Esta ação remove o registro administrativo e não pode ser desfeita.", [{ text: "Cancelar", style: "cancel" }, { text: "Excluir", style: "destructive", onPress: () => deleteRequest.mutate({ id }) }]);
  const logout = trpc.auth.logout.useMutation();
  const signOut = () => Alert.alert("Sair do painel?", "Você precisará fazer login novamente para acessar as funções administrativas.", [{ text: "Cancelar", style: "cancel" }, { text: "Sair", style: "destructive", onPress: () => { void (async () => { await Promise.race([logout.mutateAsync({ pushToken: getCurrentPushToken() ?? undefined }).catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 3000))]); await removeSessionToken(); await clearUserInfo(); router.replace("/login"); })(); } }]);
  const openRequestActions = (item: (typeof requestRows)[number]) => { router.push({ pathname: "/admin/request-detail", params: { id: String(item.id) } }); };
  const openRequestStatusActions = (item: (typeof requestRows)[number]) => Alert.alert(categoryLabels[item.category] ?? "Solicitação", "Atualizar andamento", [
    { text: "Em análise", onPress: () => updateStatus.mutate({ id: item.id, status: "reviewing" }) },
    { text: "Em andamento", onPress: () => updateStatus.mutate({ id: item.id, status: "in_progress" }) },
    { text: "Concluída", onPress: () => updateStatus.mutate({ id: item.id, status: "completed" }) },
    { text: "Excluir registro", style: "destructive", onPress: () => confirmDeleteRequest(item.id) },
    { text: "Cancelar", style: "cancel" },
  ]);
  const toneColor = (tone: "warning" | "primary" | "success" | "error") => colors[tone];
  const statusColor = (status: string) => ({ received: colors.primary, reviewing: "#D97706", forwarded: "#7C3AED", in_progress: "#0284C7", completed: colors.success, cancelled: colors.error }[status] ?? colors.muted);

  const exportWaterShortagePdf = async () => {
    try {
      const result = await shortageReport.refetch();
      const rows = (result.data ?? []).map((item) => `<tr><td>${escapeHtml(item.fullAddress)}</td><td>${escapeHtml(item.description)}</td><td>${item.createdAt.toLocaleDateString("pt-BR")}</td></tr>`).join("");
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial;color:#17202A;padding:28px}h1{color:#0B5FD8}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #D9E2EC;padding:10px;text-align:left;font-size:12px}th{background:#F0F5F9}</style></head><body><h1>Moradores com falta de água</h1><p>Conecta Barra · Barra do Piraí-RJ</p><table><tr><th>Endereço</th><th>Descrição</th><th>Registro</th></tr>${rows || "<tr><td colspan=\"3\">Nenhum registro encontrado.</td></tr>"}</table></body></html>`;
      const file = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: "Compartilhar relatório" });
      else Alert.alert("PDF gerado", file.uri);
    } catch (error) {
      Alert.alert("Não foi possível gerar o PDF", error instanceof Error ? error.message : "Tente novamente.");
    }
  };

  return (
    <ScreenContainer className="px-0 pt-0" edges={["left", "right", "bottom"]} containerClassName="bg-background">
      <GradientHeader minHeight={130} style={{ paddingBottom: 22 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><PrefeituraBadge light compact /><LiveBadge /></View>
        <Text style={{ color: "#DDF0FF", fontWeight: "900", fontSize: 11, letterSpacing: 1.2 }}>PAINEL DE GESTÃO</Text>
        <Text style={{ color: "#FFFFFF", fontSize: 26, fontWeight: "900", letterSpacing: -0.4 }}>Conecta Barra</Text>
        <Text style={{ color: "#DDF0FF", fontSize: 14, marginTop: 4 }}>{bairro ? `Filtrando pelo bairro ${bairro}` : "Visão geral da cidade"}</Text>
      </GradientHeader>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingHorizontal: 20, paddingTop: 14 }]}>
        <View style={styles.header}>

          <View style={styles.headerActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Alterar senha administrativa" onPress={() => router.push("/(tabs)/profile" as never)} style={({ pressed }) => [styles.securityButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
              <Text style={[styles.securityButtonText, { color: colors.primary }]}>Senha</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Abrir notificações${unreadNotificationCount ? `, ${unreadNotificationCount} não lidas` : ""}`} onPress={() => router.push("/notifications")} style={({ pressed }) => [styles.notificationButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
              <IconSymbol name="bell.fill" size={21} color={colors.primary} />
              {unreadNotificationCount > 0 && <View style={[styles.notificationBadge, { backgroundColor: colors.error }]}><Text style={styles.notificationBadgeText}>{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</Text></View>}
            </Pressable>
            <Pressable onPress={signOut} style={({ pressed }) => [styles.close, { backgroundColor: colors.error, borderColor: colors.error }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Sair do painel">
              <Text style={styles.signOutText}>Sair</Text>
            </Pressable>
          </View>
        </View>
        <View style={{ gap: 8, paddingVertical: 4 }}>
          <SelectionField value={bairro ?? ""} options={[{ value: "", label: "Toda a cidade" }, ...(bairros.data?.map((item) => ({ value: item.name, label: item.name })) ?? [])]} onChange={(value) => setBairro(value || undefined)} title="Filtrar painel por bairro" placeholder="Toda a cidade" accessibilityLabel="Filtrar painel por bairro" disabled={bairros.isLoading} emptyText="Nenhum bairro disponível." />
          <Pressable accessibilityRole="button" onPress={() => router.push("/admin/neighborhoods" as never)} style={{ borderWidth: 1.5, borderStyle: "dashed", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, borderColor: colors.primary }}><Text style={{ color: colors.primary, fontWeight: "800", fontSize: 12 }}>⚙ Gerenciar bairros</Text></Pressable>
        </View>

        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroKicker}>VISÃO GERAL • HOJE</Text>
            <Text style={styles.heroTitle}>A comunidade está sendo ouvida.</Text>
            <Text style={styles.heroBody}>Veja o que precisa de atenção e mantenha os moradores informados.</Text>
          </View>
          <View style={styles.heroMark}><Image source={require("../assets/images/icon.png")} style={styles.heroLogo} contentFit="contain" /></View>
        </View>

        <View style={[styles.adminSummaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Indicadores de gestão</Text>
              <Text style={[styles.chartSubtitle, { color: colors.muted }]}>Toque em um card para ver os detalhes · atualiza sozinho</Text>
            </View>
            <Text style={[styles.updated, { color: colors.muted }]}>{adminSummary.isFetching ? "Sincronizando…" : "Online"}</Text>
          </View>
          <View style={styles.adminSummaryGrid}>
            {[
              { label: "Cadastros pendentes", value: adminSummary.data?.pendingResidents ?? 0, color: colors.warning, kind: "pending_residents" as DetailKind },
              { label: "Solicitações abertas", value: adminSummary.data?.openRequests ?? 0, color: colors.primary, kind: "open_requests" as DetailKind },
              { label: "Avisos não lidos", value: adminSummary.data?.unreadNotifications ?? 0, color: colors.error, kind: "unread_notifications" as DetailKind },
              { label: "E-mails com falha", value: adminSummary.data?.email.failed ?? 0, color: adminSummary.data?.email.failed ? colors.error : colors.success, kind: "email_failures" as DetailKind },
            ].map((item) => (
              <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={`${item.label}: ${item.value}. Toque para ver os detalhes`} onPress={() => setDetail(item.kind)} style={({ pressed }) => [styles.adminSummaryItem, { backgroundColor: item.color + "12" }, pressed && styles.pressed]}>
                <Text style={[styles.adminSummaryValue, { color: item.color }]}>{item.value}</Text>
                <Text style={styles.adminSummaryLabel}>{item.label} ›</Text>
              </Pressable>
            ))}
          </View>
          {emailDelivery.data && emailDelivery.data.length > 0 && (
            <View style={[styles.emailLogBox, { borderTopColor: colors.border }]}>
              <Text style={[styles.emailLogTitle, { color: colors.foreground }]}>Últimas tentativas de e-mail</Text>
              {emailDelivery.data.slice(0, 3).map((item) => (
                <View key={item.id} style={styles.emailLogRow}>
                  <View style={[styles.emailStatusDot, { backgroundColor: item.status === "sent" ? colors.success : colors.error }]} />
                  <Text style={[styles.emailLogText, { color: colors.muted }]} numberOfLines={1}>{emailPurposeLabels[item.purpose] ?? "E-mail"}</Text>
                  <Text style={[styles.emailLogStatus, { color: item.status === "sent" ? colors.success : colors.error }]}>{item.status === "sent" ? "Enviado" : "Falhou"}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={[styles.pushTestCard, { backgroundColor: "#F1F7FF", borderColor: "#111827" }]}>
          <View style={styles.pushTestCopy}>
            <Text style={[styles.pushTestTitle, { color: colors.foreground }]}>Diagnóstico de notificações</Text>
            <Text style={[styles.pushTestSubtitle, { color: colors.muted }]}>Envie um alerta real para o aparelho do administrador e confirme o funcionamento do push.</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Enviar notificação push de teste" disabled={testPush.isPending || registerDevice.isPending} onPress={() => void sendTestPush()} style={({ pressed }) => [styles.pushTestButton, { backgroundColor: colors.primary }, pressed && styles.pressed, (testPush.isPending || registerDevice.isPending) && styles.disabled]}>
            <IconSymbol name="bell.fill" size={18} color="#FFFFFF" />
            <Text style={styles.pushTestButtonText}>{registerDevice.isPending ? "Registrando aparelho…" : testPush.isPending ? "Enviando…" : "Enviar push de teste"}</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Resumo rápido</Text>
          <Text style={[styles.updated, { color: colors.muted }]}>Atualizado agora</Text>
        </View>
        <View style={styles.metrics}>
          {metrics.map((metric) => (
              <Pressable key={metric.label} accessibilityRole="button" accessibilityLabel={`${metric.label}: ${metric.value}. Toque para ver as solicitações`} onPress={() => setDetail(metric.kind)} style={({ pressed }) => [styles.metric, { backgroundColor: toneColor(metric.tone) }, pressed && styles.pressed]}>
              <View style={[styles.metricIcon, { backgroundColor: "#FFFFFF30" }]}><IconSymbol name={metric.icon} size={19} color="#FFFFFF" /></View>
              <Text style={[styles.metricValue, { color: "#FFFFFF" }]}>{metric.value}</Text>
              <Text style={[styles.metricLabel, { color: "#FFFFFF" }]}>{metric.label} ›</Text>
            </Pressable>
          ))}
        </View>
        {overdueRequests.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`${overdueRequests.length} solicitações aguardam resposta há mais de cinco dias`} onPress={() => setDetail("open")} style={({ pressed }) => [styles.overdueAlert, { backgroundColor: colors.error + "12", borderColor: colors.error }, pressed && styles.pressed]}><IconSymbol name="exclamationmark.triangle.fill" size={21} color={colors.error} /><View style={styles.overdueCopy}><Text style={[styles.overdueTitle, { color: colors.error }]}>Atenção: há solicitações sem resposta</Text><Text style={[styles.overdueText, { color: colors.foreground }]}>{overdueRequests.length} solicitação(ões) estão abertas há mais de 5 dias. Toque para revisar.</Text></View><Text style={[styles.overdueArrow, { color: colors.error }]}>›</Text></Pressable>}

        <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.chartTitle, { color: colors.foreground }]}>Distribuição das solicitações</Text>
          <Text style={[styles.chartSubtitle, { color: colors.muted }]}>Dados atuais do banco compartilhado</Text>
          {statusBreakdown.map((item) => (
            <View key={item.label} style={styles.chartRow}>
              <Text style={[styles.chartLabel, { color: colors.muted }]}>{item.label}</Text>
              <View style={[styles.chartTrack, { backgroundColor: colors.border }]}><View style={[styles.chartBar, { width: `${(item.value / maxChartValue) * 100}%`, backgroundColor: item.color }]} /></View>
              <Text style={[styles.chartValue, { color: colors.foreground }]}>{item.value}</Text>
            </View>
          ))}
          {categoryBreakdown.length > 0 && <Text style={[styles.chartGroupLabel, { color: colors.foreground }]}>Tipos mais frequentes</Text>}
          {categoryBreakdown.map((item) => (
            <View key={`category-${item.label}`} style={styles.chartRow}>
              <Text style={[styles.chartLabel, { color: colors.muted }]} numberOfLines={1}>{item.label}</Text>
              <View style={[styles.chartTrack, { backgroundColor: colors.border }]}><View style={[styles.chartBar, { width: `${(item.value / maxChartValue) * 100}%`, backgroundColor: colors.primary }]} /></View>
              <Text style={[styles.chartValue, { color: colors.foreground }]}>{item.value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Fila de atenção</Text>
          <Text style={[styles.filterSummary, { color: colors.muted }]}>{filteredRows.length} encontradas · mostrando {visibleRows.length}</Text>
        </View>
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            accessibilityLabel="Buscar solicitações e moradores"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Buscar morador, usuário, endereço ou assunto"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.foreground }]}
          />
        </View>
        {searchQuery.trim().length >= 2 && <View style={[styles.globalSearchCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.globalSearchHeader}><Text style={[styles.globalSearchTitle, { color: colors.foreground }]}>Moradores encontrados</Text><Text style={[styles.filterSummary, { color: colors.muted }]}>{residentMatches.length}</Text></View>{residentsQuery.isLoading ? <Text style={[styles.globalSearchHint, { color: colors.muted }]}>Buscando moradores…</Text> : residentMatches.length > 0 ? residentMatches.map((resident) => <Pressable key={resident.id} accessibilityRole="button" accessibilityLabel={`Abrir cadastro de ${resident.name ?? resident.username ?? "morador"}`} onPress={() => router.push("/admin/residents")} style={({ pressed }) => [styles.globalSearchRow, { borderTopColor: colors.border }, pressed && styles.pressed]}><View style={[styles.globalSearchAvatar, { backgroundColor: colors.primary + "18" }]}><Text style={[styles.globalSearchAvatarText, { color: colors.primary }]}>{(resident.name ?? resident.username ?? "M").trim().charAt(0).toUpperCase()}</Text></View><View style={styles.globalSearchCopy}><Text style={[styles.globalSearchName, { color: colors.foreground }]} numberOfLines={1}>{resident.name ?? resident.username ?? "Morador"}</Text><Text style={[styles.globalSearchMeta, { color: colors.muted }]} numberOfLines={1}>{resident.username ? `@${resident.username}` : resident.email ?? resident.phone ?? "Cadastro sem contato"}</Text></View><Text style={[styles.globalSearchArrow, { color: colors.primary }]}>›</Text></Pressable>) : <Text style={[styles.globalSearchHint, { color: colors.muted }]}>Nenhum morador corresponde à busca.</Text>}<Text style={[styles.globalSearchHint, { color: colors.muted }]}>Os resultados de solicitações aparecem logo abaixo com os filtros aplicados.</Text></View>}
        <Text style={[styles.filterLabel, { color: colors.muted }]}>Status</Text>
        <SelectionField value={statusFilter} options={statusFilters} onChange={setStatusFilter} title="Filtrar por status" placeholder="Todos" accessibilityLabel="Filtrar solicitações por status" />
        <Text style={[styles.filterLabel, { color: colors.muted }]}>Pesquisar por data de criação</Text>
        <SelectionField value={periodFilter} options={periodFilters} onChange={setPeriodFilter} title="Filtrar por período" placeholder="Todo período" accessibilityLabel="Filtrar solicitações por período" />
        {allRequests.isLoading ? <QueryState colors={colors} loading compact loadingText="Carregando solicitações…" /> : allRequests.error ? <QueryState colors={colors} loading={false} error={allRequests.error} compact errorTitle="Não foi possível carregar a fila" onRetry={() => void allRequests.refetch()} /> : <>{visibleRows.map((item) => { const color = statusColor(item.status); return <View key={item.id} style={[styles.queueItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.queueAccent, { backgroundColor: color }]} />
          <View style={styles.queueContent}>
            <View style={styles.queueHeaderRow}><Text style={[styles.queueTitle, { color: colors.foreground }]} numberOfLines={2}>{categoryLabels[item.category] ?? item.category}</Text><View style={[styles.statusBadge, { backgroundColor: color + "18" }]}><Text style={[styles.statusBadgeText, { color }]}>{statusLabels[item.status] ?? item.status}</Text></View></View>
            <Text style={[styles.queuePlace, { color: colors.muted }]}>{item.fullAddress}</Text>
            <Text style={[styles.queueRequester, { color: colors.foreground }]} numberOfLines={2}>👤 {item.requesterName?.trim() || item.requesterUsername?.trim() || "Morador não identificado"}</Text>
            <View style={styles.queueFooter}><Text style={[styles.queueTime, { color: colors.muted }]}>{item.createdAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</Text><View style={styles.queueActions}><Pressable onPress={() => confirmDeleteRequest(item.id)} style={({ pressed }) => [styles.visibleDelete, { borderColor: colors.error }, pressed && styles.pressed]}><Text style={[styles.visibleDeleteText, { color: colors.error }]}>Excluir</Text></Pressable><Pressable onPress={() => openRequestActions(item)} onLongPress={() => openRequestStatusActions(item)} style={({ pressed }) => [styles.moreButton, { backgroundColor: colors.primary + "16" }, pressed && styles.pressed]}><Text style={[styles.moreText, { color: colors.primary }]}>Abrir</Text></Pressable></View></View>
          </View>
        </View>; })}{filteredRows.length === 0 && <Text style={[styles.queuePlace, { color: colors.muted }]}>{requestRows.length === 0 ? "Nenhuma solicitação cadastrada." : "Nenhuma solicitação corresponde aos filtros."}</Text>}{filteredRows.length > visibleRows.length && <Pressable accessibilityRole="button" onPress={() => setQueueLimit((limit) => limit + QUEUE_PAGE_SIZE)} style={({ pressed }) => [styles.loadMoreQueue, { borderColor: colors.primary, backgroundColor: colors.surface }, pressed && styles.pressed]}><Text style={{ color: colors.primary, fontWeight: "900" }}>Carregar mais ({filteredRows.length - visibleRows.length})</Text></Pressable>}</>}
        <View style={styles.actionCardsSection}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Ações rápidas</Text><View style={styles.actionCards}>{[
          ["drop.fill", "Acompanhar atendimentos de água", () => router.push("/admin/water-shortage"), colors.primary], ["megaphone.fill", "Gerar relatório de falta de água", exportWaterShortagePdf, colors.warning], ["megaphone.fill", "Criar comunicado", () => router.push("/admin/announcements"), colors.primary], ["person.3.fill", "Abrir painel de usuários", () => router.push("/admin/residents"), colors.success], ["lightbulb.fill", "Ver sugestões recebidas", () => router.push("/admin/suggestions"), colors.warning], ["clock.fill", "Ver histórico administrativo", () => router.push("/admin/audit" as never), colors.primary], ["chart.bar.fill", "Relatórios CSV e PDF", () => router.push("/admin/reports" as never), colors.success], ["lock.fill", "Sessões e segurança", () => router.push("/admin/security" as never), colors.error], ["externaldrive.fill", "Backup e restauração", () => router.push("/admin/backup" as never), colors.success], ["textformat.size", "Acessibilidade e tamanho do texto", () => router.push("/accessibility" as never), colors.primary], ["link", "Configurar Instagram, Facebook e WhatsApp", () => router.push("/admin/social-links"), colors.warning],
        ].map(([icon, label, onPress, color]) => <Pressable key={String(label)} accessibilityRole="button" onPress={onPress as () => void} style={({ pressed }) => [styles.actionCard, { backgroundColor: `${String(color)}18`, borderColor: `${String(color)}45` }, pressed && styles.pressed]}><View style={[styles.actionCardIcon, { backgroundColor: `${String(color)}20` }]}><IconSymbol name={icon as never} size={20} color={String(color)} /></View><Text style={styles.actionCardText}>{String(label)}</Text></Pressable>)}</View></View>
      </ScrollView>

      <AdminDetailSheet
        visible={detail !== null}
        onClose={() => setDetail(null)}
        title={{ open: "Solicitações em aberto", in_progress: "Solicitações em andamento", completed: "Solicitações concluídas", pending_residents: "Cadastros pendentes", open_requests: "Solicitações abertas", unread_notifications: "Avisos não lidos", email_failures: "E-mails e diagnóstico" }[detail ?? "open"]}
        subtitle={bairro ? `Bairro: ${bairro}` : "Toda a cidade"}
      >
        {detail && ["open", "in_progress", "completed", "open_requests"].includes(detail) && (() => {
          const wanted = detail === "open" ? OPEN_STATUSES : detail === "in_progress" ? ["in_progress"] : detail === "completed" ? ["completed"] : [...OPEN_STATUSES, "in_progress"];
          const rows = requestRows.filter((item) => wanted.includes(item.status));
          if (!rows.length) return <DetailEmpty text="Nenhuma solicitação nesta situação." />;
          return rows.map((item) => (
            <DetailRow key={item.id} title={`${categoryLabels[item.category] ?? item.category}`} badge={statusLabels[item.status] ?? item.status}
              lines={[`${requestProtocol(item.id, item.createdAt)} · ${formatDateTime(item.createdAt)}`, item.fullAddress, item.requesterName ? `Morador: ${item.requesterName}` : ""]}
              onPress={() => { setDetail(null); openRequestActions(item); }} />
          ));
        })()}
        {detail === "pending_residents" && (() => {
          const rows = (residentsQuery.data ?? []).filter((item) => item.role === "user" && item.residentStatus === "pending");
          if (!rows.length) return <DetailEmpty text="Nenhum cadastro aguardando aprovação. (Por padrão novos moradores entram aprovados; para exigir aprovação, ative REQUIRE_RESIDENT_APPROVAL no servidor.)" />;
          return rows.map((item) => <DetailRow key={item.id} title={item.name ?? item.username ?? "Morador"} badge="Pendente" lines={[item.username ? `@${item.username}` : "", item.phone ?? "", item.address ?? ""]} onPress={() => { setDetail(null); router.push("/admin/residents"); }} />);
        })()}
        {detail === "unread_notifications" && (() => {
          const rows = (notificationQuery.data ?? []).filter((item) => !item.readAt);
          if (!rows.length) return <DetailEmpty text="Nenhum aviso não lido." />;
          return rows.map((item) => <DetailRow key={item.id} title={item.title} lines={[item.body, formatDateTime(item.createdAt)]} onPress={() => { setDetail(null); router.push({ pathname: "/notifications", params: { notificationId: String(item.id) } }); }} />);
        })()}
        {detail === "email_failures" && (
          <>
            <DetailRow title={emailStatus.data ? (emailStatus.data.provider === "none" ? "E-mail NÃO configurado no servidor" : `Provedor de e-mail: ${emailStatus.data.provider}`) : "Verificando configuração…"}
              lines={emailStatus.data ? [emailStatus.data.provider === "none" ? "Defina BREVO_API_KEY e BREVO_SENDER_EMAIL no servidor (guia, passo 6). Sem isso o cadastro entra sem confirmação por e-mail." : `Remetente: ${emailStatus.data.sender ?? "não definido"} · Confirmação no cadastro: ${emailStatus.data.verificationRequired ? "ativada" : "desativada"}`] : []}
              badge={emailStatus.data ? (emailStatus.data.provider === "none" ? "Atenção" : "OK") : undefined} badgeColor={emailStatus.data?.provider === "none" ? colors.warning : colors.success} />
            <View style={{ gap: 8 }}>
              <TextInput value={testEmailTo} onChangeText={setTestEmailTo} placeholder={emailStatus.data?.adminNotificationEmail ?? "seu-email@exemplo.com"} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} accessibilityLabel="E-mail para receber o teste" style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, minHeight: 48, color: colors.foreground, backgroundColor: colors.surface }} placeholderTextColor={colors.muted} />
              <Pressable accessibilityRole="button" accessibilityLabel="Enviar e-mail de teste" disabled={sendTestEmail.isPending} onPress={() => { const to = (testEmailTo.trim() || emailStatus.data?.adminNotificationEmail || "").trim(); if (!to) { Alert.alert("Informe um e-mail", "Digite o e-mail que deve receber o teste."); return; } setTestEmailTo(to); sendTestEmail.mutate({ to }); }} style={({ pressed }) => [{ minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary }, (pressed || sendTestEmail.isPending) && { opacity: 0.7 }]}>
                <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{sendTestEmail.isPending ? "Enviando…" : "Enviar e-mail de teste"}</Text>
              </Pressable>
            </View>
            {emailLogs.isLoading ? <DetailEmpty text="Carregando tentativas…" /> : !(emailLogs.data ?? []).length ? <DetailEmpty text="Nenhuma tentativa de e-mail registrada ainda." /> : [...(emailLogs.data ?? [])].sort((a, b) => Number(b.status === "failed") - Number(a.status === "failed")).map((item) => (
              <DetailRow key={item.id} title={emailPurposeLabels[item.purpose] ?? item.purpose} badge={item.status === "sent" ? "Enviado" : "Falhou"} badgeColor={item.status === "sent" ? colors.success : colors.error}
                lines={[`${formatDateTime(item.createdAt)} · ${item.provider}`, item.status === "failed" ? (item.errorMessage ?? "Motivo não registrado") : ""]} />
            ))}
          </>
        )}
      </AdminDetailSheet>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 38, gap: 24 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, flexShrink: 0, paddingTop: 1, width: 184 },
  securityButton: { minWidth: 54, height: 42, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  securityButtonText: { fontSize: 12, fontWeight: "900" },
  notificationButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  notificationBadge: { position: "absolute", top: -5, right: -3, minWidth: 21, height: 21, paddingHorizontal: 5, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  notificationBadgeText: { color: "#FFFFFF", fontSize: 10, lineHeight: 12, fontWeight: "900" },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1, marginBottom: 6 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: "900", letterSpacing: -0.7, flexShrink: 1 },
  subtitle: { marginTop: 5, fontSize: 15 },
  close: { width: 64, height: 44, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  signOutText: { fontSize: 13, fontWeight: "900", color: "#FFFFFF" },
  hero: { minHeight: 164, borderRadius: 24, padding: 22, flexDirection: "row" },
  heroCopy: { flex: 1, paddingRight: 10 },
  heroKicker: { color: "#BFE2F4", fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 10 },
  heroTitle: { color: "#FFFFFF", fontSize: 22, lineHeight: 27, fontWeight: "800" },
  heroBody: { color: "#DCEFFA", fontSize: 13, lineHeight: 18, marginTop: 8 },
  heroMark: { width: 66, height: 66, borderRadius: 18, backgroundColor: "#FFFFFF30", alignItems: "center", justifyContent: "center", alignSelf: "flex-end" },
  heroLogo: { width: 52, height: 52, borderRadius: 12 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  sectionTitle: { fontSize: 18, fontWeight: "900" },
  adminSummaryCard: { borderWidth: 0, borderRadius: 21, padding: 14, marginBottom: 2, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  adminSummaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  adminSummaryItem: { width: "48%", minHeight: 72, borderWidth: 0, borderRadius: 14, padding: 10, justifyContent: "center" },
  adminSummaryValue: { fontSize: 23, lineHeight: 27, fontWeight: "900" },
  adminSummaryLabel: { fontSize: 11, lineHeight: 15, marginTop: 3, fontWeight: "900", color: "#000000" },
  emailLogBox: { borderTopWidth: 1, marginTop: 14, paddingTop: 12 },
  emailLogTitle: { fontSize: 13, fontWeight: "900", marginBottom: 6 },
  emailLogRow: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 7 },
  emailStatusDot: { width: 8, height: 8, borderRadius: 4 },
  emailLogText: { flex: 1, fontSize: 11 },
  emailLogStatus: { fontSize: 11, fontWeight: "900" },
  chartCard: { borderWidth: 1, borderRadius: 21, padding: 14, marginBottom: 18, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  chartTitle: { fontSize: 15, fontWeight: "900" },
  chartSubtitle: { fontSize: 11, lineHeight: 16, marginTop: 3, marginBottom: 10 },
  chartGroupLabel: { fontSize: 12, fontWeight: "900", marginTop: 12, marginBottom: 5 },
  chartRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 27 },
  chartLabel: { width: 108, fontSize: 11, fontWeight: "900", color: "#000000" },
  chartTrack: { flex: 1, height: 8, borderRadius: 5, overflow: "hidden" },
  chartBar: { height: "100%", borderRadius: 5, minWidth: 3 },
  chartValue: { width: 24, textAlign: "right", fontSize: 12, fontWeight: "900" },
  searchBox: { borderWidth: 1, borderRadius: 14, minHeight: 46, paddingHorizontal: 12, justifyContent: "center", marginBottom: 10 },
  searchInput: { fontSize: 13, minHeight: 42 },
  globalSearchCard: { borderWidth: 1, borderRadius: 18, padding: 12, gap: 7, marginBottom: 4, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  globalSearchHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  globalSearchTitle: { fontSize: 13, fontWeight: "900" },
  globalSearchHint: { fontSize: 11, lineHeight: 16 },
  globalSearchRow: { minHeight: 49, borderTopWidth: 1, paddingTop: 7, flexDirection: "row", alignItems: "center", gap: 8 },
  globalSearchAvatar: { width: 31, height: 31, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  globalSearchAvatarText: { fontSize: 14, fontWeight: "900" },
  globalSearchCopy: { flex: 1, minWidth: 0, gap: 2 },
  globalSearchName: { fontSize: 12, fontWeight: "900" },
  globalSearchMeta: { fontSize: 10 },
  globalSearchArrow: { fontSize: 22, fontWeight: "700" },
  updated: { fontSize: 12 },
  link: { fontWeight: "800", fontSize: 14 },
  filterSummary: { fontSize: 12, fontWeight: "900", color: "#000000" },
  filterLabel: { fontSize: 11, fontWeight: "900", color: "#000000", marginTop: -9 },
  metrics: { flexDirection: "row", gap: 10 },
  metric: { flex: 1, borderRadius: 20, borderWidth: 0, padding: 14, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  metricIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  metricValue: { fontSize: 27, lineHeight: 32, fontWeight: "900" },
  metricLabel: { fontSize: 11, marginTop: 3, fontWeight: "900", color: "#000000" },
  filterRow: { flexDirection: "row", gap: 7, borderBottomWidth: 1, paddingBottom: 3 },
  filter: { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 9 },
  filterText: { fontSize: 12, fontWeight: "900", color: "#000000" },
  queueItem: { minHeight: 150, borderRadius: 20, borderWidth: 1, flexDirection: "row", alignItems: "stretch", padding: 0, overflow: "hidden", shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  loadMoreQueue: { minHeight: 48, borderWidth: 1.5, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 2 },
  queueAccent: { width: 7 },
  queueContent: { flex: 1, minWidth: 0, padding: 14, gap: 6 },
  queueHeaderRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  queueTitle: { flex: 1, fontSize: 16, lineHeight: 20, fontWeight: "900" },
  queuePlace: { fontSize: 12, lineHeight: 18 },
  queueRequester: { fontSize: 13, lineHeight: 18, fontWeight: "800" },
  queueFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 3 },
  queueActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  queueTime: { flex: 1, fontSize: 10 },
  statusBadge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, marginTop: 8 },
  statusBadgeText: { fontSize: 10, fontWeight: "900", color: "#000000" },
  visibleDelete: { borderWidth: 1, borderRadius: 10, minHeight: 34, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", marginLeft: 6 },
  visibleDeleteText: { fontSize: 10, fontWeight: "900" },
  moreButton: { borderRadius: 10, minHeight: 34, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", marginLeft: 6 },
  moreText: { fontSize: 10, fontWeight: "900" },
  secondaryAction: { minHeight: 60, borderRadius: 16, borderWidth: 1.5, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10, marginTop: 10 },
  secondaryActionText: { fontSize: 14, fontWeight: "800" },
  primaryAction: { minHeight: 62, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 2 },
  primaryActionText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  pushTestCard: { borderWidth: 1.5, borderRadius: 20, padding: 14, gap: 12, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  pushTestCopy: { gap: 4 },
  pushTestTitle: { fontSize: 16, fontWeight: "900" },
  pushTestSubtitle: { fontSize: 12, lineHeight: 18 },
  pushTestButton: { minHeight: 48, borderRadius: 14, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  pushTestButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  overdueAlert: { minHeight: 72, borderWidth: 1.5, borderRadius: 18, padding: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  overdueCopy: { flex: 1, gap: 3 },
  overdueTitle: { fontSize: 13, fontWeight: "900" },
  overdueText: { fontSize: 11, lineHeight: 16 },
  overdueArrow: { fontSize: 27, fontWeight: "700" },
  actionCardsSection: { gap: 10, paddingTop: 6 },
  actionCards: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionCard: { width: "48.5%", minHeight: 76, borderRadius: 14, borderWidth: 1.5, padding: 10, justifyContent: "center", gap: 7, shadowColor: "#0B3B8C", shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  actionCardIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  actionCardText: { color: "#111827", fontSize: 11, lineHeight: 15, fontWeight: "900" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
});
