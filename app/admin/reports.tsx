import { useMemo, useState } from "react";
import { Alert, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/pressable";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { QueryState } from "@/components/query-state";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/page-header";
import { SelectionField } from "@/components/selection-field";

const periods = [
  { value: "all", label: "Todo período" },
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
] as const;
type Period = (typeof periods)[number]["value"];

function escapeCsv(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function AdminReportsScreen() {
  const colors = useColors();
  const [period, setPeriod] = useState<Period>("all");
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const requests = trpc.requests.all.useQuery(undefined, { refetchInterval: 45_000, retry: false });
  const residents = trpc.residents.all.useQuery(undefined, { refetchInterval: 45_000, retry: false });
  const cutoff = period === "all" ? null : Date.now() - Number(period) * 24 * 60 * 60 * 1000;
  const requestRows = useMemo(() => (requests.data ?? []).filter((item) => cutoff === null || new Date(item.createdAt).getTime() >= cutoff), [cutoff, requests.data]);
  const residentRows = useMemo(() => (residents.data ?? []).filter((item) => cutoff === null || new Date(item.createdAt).getTime() >= cutoff), [cutoff, residents.data]);
  const statusCounts = useMemo(() => ({ received: requestRows.filter((item) => item.status === "received").length, reviewing: requestRows.filter((item) => item.status === "reviewing").length, inProgress: requestRows.filter((item) => item.status === "in_progress").length, completed: requestRows.filter((item) => item.status === "completed").length, cancelled: requestRows.filter((item) => item.status === "cancelled").length }), [requestRows]);
  const busy = requests.isLoading || residents.isLoading;
  const error = requests.error ?? residents.error;

  const buildCsv = () => {
    const lines = ["Tipo;ID;Nome/descrição;Status;Data;Local", ...requestRows.map((item) => ["Solicitação", item.id, item.requesterName ?? item.requesterUsername ?? "Morador", item.status, new Date(item.createdAt).toLocaleString("pt-BR"), item.fullAddress].map(escapeCsv).join(";")), ...residentRows.map((item) => ["Morador", item.id, item.name ?? item.username ?? "Sem nome", item.residentStatus, new Date(item.createdAt).toLocaleString("pt-BR"), item.address ?? ""].map(escapeCsv).join(";"))];
    return `\uFEFF${lines.join("\n")}`;
  };
  const buildHtml = () => `<html><meta charset="utf-8"><style>body{font-family:Arial;color:#172033;padding:24px}h1{color:#1261A0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #d7dee8;padding:7px;font-size:10px;text-align:left}th{background:#eaf3fb}</style><h1>Relatório Conecta Barra</h1><p>Período: ${period === "all" ? "Todo período" : `Últimos ${period} dias`}</p><p>Solicitações: ${requestRows.length} • Moradores: ${residentRows.length}</p><table><tr><th>Tipo</th><th>ID</th><th>Nome/descrição</th><th>Status</th><th>Data</th><th>Local</th></tr>${requestRows.map((item) => `<tr><td>Solicitação</td><td>${item.id}</td><td>${item.requesterName ?? item.requesterUsername ?? "Morador"}</td><td>${item.status}</td><td>${new Date(item.createdAt).toLocaleString("pt-BR")}</td><td>${item.fullAddress}</td></tr>`).join("")}${residentRows.map((item) => `<tr><td>Morador</td><td>${item.id}</td><td>${item.name ?? item.username ?? "Sem nome"}</td><td>${item.residentStatus}</td><td>${new Date(item.createdAt).toLocaleString("pt-BR")}</td><td>${item.address ?? ""}</td></tr>`).join("")}</table></html>`;
  const exportCsv = async () => { if (exporting || busy) return; setExporting("csv"); try { const directory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory; if (!directory) throw new Error("Armazenamento temporário indisponível."); const uri = `${directory}conecta-relatorio-${Date.now()}.csv`; await FileSystem.writeAsStringAsync(uri, buildCsv(), { encoding: FileSystem.EncodingType.UTF8 }); if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Compartilhar relatório Conecta Barra" }); else await Share.share({ message: `Relatório Conecta Barra criado em ${uri}` }); } catch (error) { Alert.alert("Não foi possível gerar CSV", error instanceof Error ? error.message : "Tente novamente."); } finally { setExporting(null); } };
  const exportPdf = async () => { if (exporting || busy) return; setExporting("pdf"); try { const file = await Print.printToFileAsync({ html: buildHtml() }); if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: "Compartilhar relatório Conecta Barra" }); else await Share.share({ message: `Relatório PDF criado em ${file.uri}` }); } catch (error) { Alert.alert("Não foi possível gerar PDF", error instanceof Error ? error.message : "Tente novamente."); } finally { setExporting(null); } };

  return <ScreenContainer className="px-0 pt-0" edges={["left", "right", "bottom"]}><PageHeader kicker="PRESTAÇÃO DE CONTAS" title="Relatórios" subtitle="Exporte uma fotografia dos dados atuais." /><View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 14 }}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
    <View style={styles.header}><View style={styles.spacer} /></View>
    <Text style={[styles.label, { color: colors.muted }]}>Período</Text><SelectionField value={period} options={periods} onChange={setPeriod} title="Selecionar período do relatório" placeholder="Todo período" accessibilityLabel="Filtrar relatório por período" />
    {busy ? <QueryState colors={colors} loading loadingText="Preparando relatório…" /> : error ? <QueryState colors={colors} loading={false} error={error} errorTitle="Não foi possível preparar o relatório" onRetry={() => { void requests.refetch(); void residents.refetch(); }} /> : <>
      <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.border }]}><View><Text style={[styles.number, { color: colors.primary }]}>{requestRows.length}</Text><Text style={[styles.summaryLabel, { color: colors.muted }]}>solicitações</Text></View><View><Text style={[styles.number, { color: colors.success }]}>{residentRows.length}</Text><Text style={[styles.summaryLabel, { color: colors.muted }]}>moradores</Text></View><View><Text style={[styles.number, { color: colors.warning }]}>{statusCounts.completed}</Text><Text style={[styles.summaryLabel, { color: colors.muted }]}>concluídas</Text></View></View>
      <View style={[styles.breakdown, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.cardTitle, { color: colors.foreground }]}>Resumo por status</Text>{[["Recebidas", statusCounts.received], ["Em análise", statusCounts.reviewing], ["Em andamento", statusCounts.inProgress], ["Concluídas", statusCounts.completed], ["Canceladas", statusCounts.cancelled]].map(([label, value]) => <View key={String(label)} style={styles.breakdownRow}><Text style={[styles.breakdownLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.breakdownValue, { color: colors.foreground }]}>{value}</Text></View>)}</View>
      <View style={[styles.exportCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.cardTitle, { color: colors.foreground }]}>Exportar dados filtrados</Text><Text style={[styles.hint, { color: colors.muted }]}>O arquivo inclui solicitações e moradores do período selecionado.</Text><View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => void exportCsv()} disabled={Boolean(exporting)} style={({ pressed }) => [styles.action, { backgroundColor: colors.primary }, pressed && styles.pressed, Boolean(exporting) && styles.disabled]}><Text style={styles.actionText}>{exporting === "csv" ? "Gerando…" : "CSV"}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void exportPdf()} disabled={Boolean(exporting)} style={({ pressed }) => [styles.action, { backgroundColor: colors.foreground }, pressed && styles.pressed, Boolean(exporting) && styles.disabled]}><Text style={styles.actionText}>{exporting === "pdf" ? "Gerando…" : "PDF"}</Text></Pressable></View></View>
    </>}
  </ScrollView></View></ScreenContainer>;
}

const styles = StyleSheet.create({ content: { paddingBottom: 40, gap: 14 }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, backButton: { minHeight: 44, borderWidth: 1.5, borderRadius: 15, paddingHorizontal: 14, justifyContent: "center" }, back: { fontSize: 14, fontWeight: "900" }, title: { flex: 1, fontSize: 21, fontWeight: "900", textAlign: "center" }, spacer: { width: 72 }, intro: { fontSize: 14, lineHeight: 20 }, label: { fontSize: 11, fontWeight: "900", textTransform: "uppercase", marginTop: 4 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 }, summary: { borderWidth: 1, borderRadius: 20, padding: 16, flexDirection: "row", justifyContent: "space-around" }, number: { fontSize: 27, fontWeight: "900", textAlign: "center" }, summaryLabel: { fontSize: 11, fontWeight: "800" }, breakdown: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 }, cardTitle: { fontSize: 16, fontWeight: "900" }, breakdownRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 }, breakdownLabel: { fontSize: 13 }, breakdownValue: { fontSize: 14, fontWeight: "900" }, exportCard: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 9 }, hint: { fontSize: 12, lineHeight: 18 }, actions: { flexDirection: "row", gap: 9, marginTop: 5 }, action: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" }, actionText: { color: "#fff", fontWeight: "900", fontSize: 14 }, disabled: { opacity: 0.55 }, pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] } });
