import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { TextInput } from "@/components/text-input";
import { Pressable } from "@/components/pressable";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { CachedImage } from "@/components/cached-image";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { buildUsersCsv, buildUsersPdfHtml } from "@/lib/user-export";
import { getApiBaseUrl } from "@/lib/_core/api";
import { PageHeader } from "@/components/page-header";
import { SelectionField } from "@/components/selection-field";

const sexLabels = {
  female: "Feminino",
  male: "Masculino",
  non_binary: "Não binário",
  prefer_not_to_say: "Não informado",
} as const;

const statusLabels = {
  pending: "Pendente",
  approved: "Aprovado",
  blocked: "Bloqueado",
} as const;

const statusFilters = ["all", "pending", "approved", "blocked"] as const;
const roleFilters = ["all", "user", "admin"] as const;
const periodFilters = [
  { value: "all", label: "Todo período" },
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
] as const;

type StatusFilter = (typeof statusFilters)[number];
type RoleFilter = (typeof roleFilters)[number];
type PeriodFilter = (typeof periodFilters)[number]["value"];
type ResidentStatus = keyof typeof statusLabels;
type SortMode = "recent" | "name";

type UserRecord = {
  id: number;
  name: string | null;
  avatarUrl: string | null;
  role: "user" | "admin";
  residentStatus: ResidentStatus;
  loginMethod: string | null;
  username: string | null;
  address: string | null;
  neighborhood: string | null;
  phone: string | null;
  sex: keyof typeof sexLabels | null;
  email: string | null;
  complement: string | null;
  householdSize: number | null;
  emergencyContact: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  lastSignedIn: Date | string;
};

function statusColor(status: ResidentStatus, colors: ReturnType<typeof useColors>) {
  if (status === "approved") return colors.success;
  if (status === "blocked") return colors.error;
  return colors.warning;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não informado";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "Nunca acessou";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nunca acessou";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
const displayName = (item: { name: string | null; username: string | null }) => (item.name ?? item.username ?? "").trim();
const initialOf = (item: { name: string | null; username: string | null }) => {
  const letter = displayName(item).normalize("NFD").replace(/[\u0300-\u036f]/g, "").charAt(0).toUpperCase();
  return /[A-Z]/.test(letter) ? letter : "#";
};
type ListRow = { kind: "header"; key: string; letter: string; total: number } | { kind: "user"; key: string; item: UserRecord };

function displayValue(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "Não informado" : String(value);
}

export default function ResidentsManagementScreen() {
  const colors = useColors();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [neighborhoodFilter, setNeighborhoodFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  const users = trpc.residents.all.useQuery(undefined, { refetchInterval: 30_000, staleTime: 2_000, retry: 1 });
  const neighborhoods = trpc.neighborhoods.list.useQuery(undefined, { staleTime: 5 * 60_000 });
  const updateStatus = trpc.residents.updateStatus.useMutation({
    onSuccess: async (_, variables) => {
      await users.refetch();
      setFeedback(variables.residentStatus === "approved" ? "Cadastro aprovado e lista atualizada." : variables.residentStatus === "blocked" ? "Cadastro bloqueado e lista atualizada." : "Status atualizado.");
    },
    onError: (error) => Alert.alert("Não foi possível atualizar", error.message),
  });
  const deleteUser = trpc.residents.delete.useMutation({
    onSuccess: async () => {
      await users.refetch();
      setExpandedId(null);
      setFeedback("Cadastro removido com sucesso.");
    },
    onError: (error) => Alert.alert("Não foi possível excluir", error.message),
  });
  const resetResidentPassword = trpc.residents.resetPassword.useMutation({
    onSuccess: (result) => Alert.alert("Senha temporária gerada", `Usuário: ${result.username}\nSenha temporária: ${result.temporaryPassword}\n\nEntregue esta senha ao morador por um canal seguro. Ela não será exibida novamente.`, [{ text: "Entendi" }]),
    onError: (error) => Alert.alert("Não foi possível redefinir", error.message),
  });

  const allUsers = useMemo(() => (users.data ?? []) as UserRecord[], [users.data]);
  const counts = useMemo(() => ({
    all: allUsers.length,
    pending: allUsers.filter((item) => item.role === "user" && item.residentStatus === "pending").length,
    approved: allUsers.filter((item) => item.role === "user" && item.residentStatus === "approved").length,
    blocked: allUsers.filter((item) => item.role === "user" && item.residentStatus === "blocked").length,
    admins: allUsers.filter((item) => item.role === "admin").length,
  }), [allUsers]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const locationTerm = locationFilter.trim().toLocaleLowerCase("pt-BR");
    const cutoff = periodFilter === "all" ? null : Date.now() - Number(periodFilter) * 24 * 60 * 60 * 1000;
    const result = allUsers.filter((item) => {
      const matchesStatus = statusFilter === "all" || item.residentStatus === statusFilter;
      const matchesRole = roleFilter === "all" || item.role === roleFilter;
      const matchesNeighborhood = !neighborhoodFilter || item.neighborhood === neighborhoodFilter;
      const searchable = [item.name, item.username, item.phone, item.email, item.address].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
      const matchesLocation = !locationTerm || (item.address ?? "").toLocaleLowerCase("pt-BR").includes(locationTerm);
      const matchesPeriod = cutoff === null || new Date(item.createdAt).getTime() >= cutoff;
      return matchesStatus && matchesRole && matchesNeighborhood && matchesLocation && matchesPeriod && (!term || searchable.includes(term));
    });
    return result.sort((first, second) => {
      if (sortMode === "name") {
        const a = displayName(first), b = displayName(second);
        if (!a !== !b) return a ? -1 : 1; // sem nome vai para o fim
        return collator.compare(a, b) || first.id - second.id;
      }
      return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
    });
  }, [allUsers, locationFilter, neighborhoodFilter, periodFilter, roleFilter, search, sortMode, statusFilter]);

  const listRows = useMemo<ListRow[]>(() => {
    if (sortMode !== "name") return filteredUsers.map((item) => ({ kind: "user" as const, key: `u${item.id}`, item }));
    const totals = new Map<string, number>();
    for (const item of filteredUsers) totals.set(initialOf(item), (totals.get(initialOf(item)) ?? 0) + 1);
    const rows: ListRow[] = [];
    let current = "";
    for (const item of filteredUsers) {
      const letter = initialOf(item);
      if (letter !== current) { current = letter; rows.push({ kind: "header", key: `h${letter}`, letter, total: totals.get(letter) ?? 0 }); }
      rows.push({ kind: "user", key: `u${item.id}`, item });
    }
    return rows;
  }, [filteredUsers, sortMode]);

  const adminCleanup = trpc.admin.cleanupAdmins.useMutation({
    onSuccess: async (result) => { await users.refetch(); setFeedback(result.removed ? `${result.removed} conta(s) de administrador duplicada(s) removida(s). Ficou só a conta da gestão.` : "Não havia contas duplicadas para remover."); },
    onError: (error) => Alert.alert("Não foi possível limpar", error.message),
  });
  const confirmAdminCleanup = () => Alert.alert(
    "Remover administradores extras?",
    `Existem ${counts.admins} contas de administrador. Será mantida apenas a conta com a qual você está logado agora (a oficial, definida por ADMIN_USERNAME) e as outras ${Math.max(counts.admins - 1, 0)} serão apagadas definitivamente.`,
    [{ text: "Cancelar", style: "cancel" }, { text: "Remover extras", style: "destructive", onPress: () => adminCleanup.mutate() }],
  );

  const exportCsv = async () => {
    if (exporting || filteredUsers.length === 0) return;
    setExporting("csv");
    try {
      const csv = buildUsersCsv(filteredUsers);
      const directory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!directory) throw new Error("O armazenamento temporário do dispositivo não está disponível.");
      const uri = `${directory}conecta-usuarios-${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Compartilhar lista de usuários" });
      else Alert.alert("CSV gerado", `O arquivo foi salvo em ${uri}`);
      setFeedback(`CSV gerado com ${filteredUsers.length} usuário(s), respeitando os filtros atuais.`);
    } catch (error) {
      Alert.alert("Não foi possível exportar CSV", error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async () => {
    if (exporting || filteredUsers.length === 0) return;
    setExporting("pdf");
    try {
      const html = buildUsersPdfHtml(filteredUsers);
      const file = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: "Compartilhar relatório de usuários" });
      else Alert.alert("PDF gerado", `O arquivo foi salvo em ${file.uri}`);
      setFeedback(`PDF gerado com ${filteredUsers.length} usuário(s), respeitando os filtros atuais.`);
    } catch (error) {
      Alert.alert("Não foi possível exportar PDF", error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      setExporting(null);
    }
  };

  const confirmDelete = (item: UserRecord) => Alert.alert(
    "Excluir cadastro?",
    `O cadastro de ${item.name ?? "usuário"}, seus acessos, solicitações e avisos serão removidos permanentemente.`,
    [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: () => deleteUser.mutate({ userId: item.id }) },
    ],
  );

  const confirmResetPassword = (item: UserRecord) => Alert.alert(
    "Redefinir senha?",
    `Será gerada uma senha temporária para ${item.name ?? "este morador"}. A senha atual deixará de funcionar imediatamente.`,
    [
      { text: "Cancelar", style: "cancel" },
      { text: "Gerar senha", onPress: () => resetResidentPassword.mutate({ userId: item.id }) },
    ],
  );

  const confirmStatus = (item: UserRecord, residentStatus: "approved" | "blocked") => {
    const isApproval = residentStatus === "approved";
    Alert.alert(
      isApproval ? "Aprovar cadastro?" : "Bloquear cadastro?",
      isApproval ? `${item.name ?? "O morador"} poderá acessar os serviços do Conecta Barra.` : `O acesso de ${item.name ?? "o morador"} será interrompido até nova alteração.`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: isApproval ? "Aprovar" : "Bloquear", style: isApproval ? "default" : "destructive", onPress: () => updateStatus.mutate({ userId: item.id, residentStatus }) },
      ],
    );
  };

  return (
    <ScreenContainer className="px-0 pt-0" edges={["left", "right", "bottom"]}><PageHeader kicker="CONTROLE ADMINISTRATIVO" title="Painel de usuários" subtitle="Cadastros, aprovações e acesso dos moradores." /><View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 14 }}>
      <FlatList
        data={listRows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={users.isFetching}
        onRefresh={() => { setFeedback(null); void users.refetch(); }}
        ListHeaderComponent={(
          <View>
            <View style={styles.header}>
              
              <Pressable accessibilityRole="button" accessibilityLabel="Atualizar usuários" onPress={() => { setFeedback(null); void users.refetch(); }} style={({ pressed }) => [styles.refreshButton, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}>
                <IconSymbol name="arrow.triangle.2.circlepath" size={18} color={colors.primary} />
              </Pressable>
            </View>

            {counts.admins > 1 && <View style={[styles.adminWarn, { backgroundColor: colors.warning + "14", borderColor: colors.warning }]}>
              <Text style={[styles.adminWarnTitle, { color: colors.foreground }]}>{counts.admins} contas de administrador encontradas</Text>
              <Text style={[styles.adminWarnText, { color: colors.muted }]}>O normal é existir só 1. Mantenha a conta da gestão e remova as demais.</Text>
              <Pressable accessibilityRole="button" disabled={adminCleanup.isPending} onPress={confirmAdminCleanup} style={({ pressed }) => [styles.adminWarnButton, { backgroundColor: colors.error }, pressed && styles.pressed, adminCleanup.isPending && styles.disabled]}><Text style={styles.actionText}>{adminCleanup.isPending ? "Removendo…" : `Remover ${counts.admins - 1} administrador(es) extra(s)`}</Text></Pressable>
            </View>}
            <View style={styles.summaryGrid}>
              <View style={[styles.summaryCard, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "28" }]}><Text style={[styles.summaryNumber, { color: colors.primary }]}>{counts.all}</Text><Text style={[styles.summaryLabel, { color: colors.foreground }]}>usuários</Text></View>
              <View style={[styles.summaryCard, { backgroundColor: colors.warning + "12", borderColor: colors.warning + "28" }]}><Text style={[styles.summaryNumber, { color: colors.warning }]}>{counts.pending}</Text><Text style={[styles.summaryLabel, { color: colors.foreground }]}>pendentes</Text></View>
              <View style={[styles.summaryCard, { backgroundColor: colors.success + "12", borderColor: colors.success + "28" }]}><Text style={[styles.summaryNumber, { color: colors.success }]}>{counts.approved}</Text><Text style={[styles.summaryLabel, { color: colors.foreground }]}>aprovados</Text></View>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.summaryNumber, { color: colors.foreground }]}>{counts.admins}</Text><Text style={[styles.summaryLabel, { color: colors.foreground }]}>administradores</Text></View>
            </View>

            <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <IconSymbol name="person.crop.circle.fill" size={21} color={colors.muted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar nome, usuário, telefone ou e-mail"
                placeholderTextColor={colors.muted}
                style={[styles.searchInput, { color: colors.foreground }]}
                autoCapitalize="none"
                returnKeyType="search"
                accessibilityLabel="Buscar usuários"
              />
              {search.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" onPress={() => setSearch("")} style={({ pressed }) => [styles.clearSearch, pressed && styles.pressed]}><Text style={[styles.clearSearchText, { color: colors.muted }]}>×</Text></Pressable>}
            </View>

            <View style={styles.filterHeader}><Text style={[styles.filterTitle, { color: colors.foreground }]}>Filtros</Text><Text style={[styles.filterResult, { color: colors.muted }]}>{filteredUsers.length} resultado(s)</Text></View>
            <Text style={[styles.filterLabel, { color: colors.muted }]}>Situação do cadastro</Text>
            <SelectionField value={statusFilter} options={statusFilters.map((value) => ({ value, label: value === "all" ? `Todos ${counts.all}` : `${statusLabels[value]} ${counts[value]}` }))} onChange={setStatusFilter} title="Filtrar por situação" placeholder="Todas as situações" accessibilityLabel="Filtrar moradores por situação" />
            <Text style={[styles.filterLabel, { color: colors.muted }]}>Tipo de conta</Text>
            <SelectionField value={roleFilter} options={roleFilters.map((value) => ({ value, label: value === "all" ? "Todos" : value === "admin" ? `Administradores ${counts.admins}` : `Moradores ${allUsers.filter((item) => item.role === "user").length}` }))} onChange={setRoleFilter} title="Filtrar por tipo de conta" placeholder="Todos os tipos" accessibilityLabel="Filtrar moradores por tipo de conta" />
            <Text style={[styles.filterLabel, { color: colors.muted }]}>Data de cadastro</Text>
            <SelectionField value={periodFilter} options={periodFilters} onChange={setPeriodFilter} title="Filtrar por data de cadastro" placeholder="Todo período" accessibilityLabel="Filtrar moradores por período" />
            <Text style={[styles.filterLabel, { color: colors.muted }]}>Bairro</Text>
            <SelectionField value={neighborhoodFilter} options={[{ value: "", label: "Todos os bairros" }, ...(neighborhoods.data?.map((item) => ({ value: item.name, label: item.name })) ?? [])]} onChange={setNeighborhoodFilter} title="Filtrar moradores por bairro" placeholder="Todos os bairros" accessibilityLabel="Filtrar moradores por bairro" disabled={neighborhoods.isLoading} emptyText="Nenhum bairro disponível." />
            <Text style={[styles.filterLabel, { color: colors.muted }]}>Rua ou endereço</Text>
            <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.locationGlyph, { color: colors.primary }]}>⌖</Text>
              <TextInput value={locationFilter} onChangeText={setLocationFilter} placeholder="Filtrar por localidade" placeholderTextColor={colors.muted} style={[styles.searchInput, { color: colors.foreground }]} autoCapitalize="words" returnKeyType="search" accessibilityLabel="Filtrar por bairro ou endereço" />
              {locationFilter.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Limpar filtro de endereço" onPress={() => setLocationFilter("")} style={({ pressed }) => [styles.clearSearch, pressed && styles.pressed]}><Text style={[styles.clearSearchText, { color: colors.muted }]}>×</Text></Pressable>}
            </View>
            <Text style={[styles.filterLabel, { color: colors.muted }]}>Ordenação</Text>
            <SelectionField value={sortMode} options={[{ value: "name", label: "Nome A–Z (agrupado por letra)" }, { value: "recent", label: "Mais recentes" }]} onChange={setSortMode} title="Ordenar moradores" placeholder="Nome A–Z" accessibilityLabel="Ordenar moradores" />
            <View style={[styles.exportCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.exportCopy}><Text style={[styles.exportTitle, { color: colors.foreground }]}>Exportar lista</Text><Text style={[styles.exportSubtitle, { color: colors.muted }]}>Serão exportados os {filteredUsers.length} registro(s) que correspondem aos filtros atuais.</Text></View>
              <View style={styles.exportActions}>
                <Pressable accessibilityRole="button" accessibilityLabel="Exportar lista em CSV" disabled={Boolean(exporting) || filteredUsers.length === 0} onPress={() => void exportCsv()} style={({ pressed }) => [styles.exportButton, { backgroundColor: colors.primary }, pressed && styles.pressed, (Boolean(exporting) || filteredUsers.length === 0) && styles.disabled]}><Text style={styles.exportButtonText}>{exporting === "csv" ? "Gerando…" : "CSV"}</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Exportar lista em PDF" disabled={Boolean(exporting) || filteredUsers.length === 0} onPress={() => void exportPdf()} style={({ pressed }) => [styles.exportButton, { backgroundColor: colors.primary }, pressed && styles.pressed, (Boolean(exporting) || filteredUsers.length === 0) && styles.disabled]}><Text style={styles.exportButtonText}>{exporting === "pdf" ? "Gerando…" : "PDF"}</Text></Pressable>
              </View>
            </View>
            {feedback && <View style={[styles.feedback, { backgroundColor: colors.success + "18", borderColor: colors.success }]}><Text style={[styles.feedbackText, { color: colors.success }]}>{feedback}</Text></View>}
            <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Cadastros</Text><Text style={[styles.sectionHint, { color: colors.muted }]}>{users.isFetching ? "Atualizando…" : "Sincronizado online"}</Text></View>
          </View>
        )}
        renderItem={({ item: row }) => {
          if (row.kind === "header") return (
            <View style={[styles.letterHeader, { borderBottomColor: colors.border }]}>
              <View style={[styles.letterBubble, { backgroundColor: colors.primary }]}><Text style={styles.letterText}>{row.letter}</Text></View>
              <Text style={[styles.letterCount, { color: colors.muted }]}>{row.total} {row.total === 1 ? "cadastro" : "cadastros"}</Text>
            </View>
          );
          const item = row.item;
          const residentStatus = item.residentStatus as ResidentStatus;
          const tint = statusColor(residentStatus, colors);
          const expanded = expandedId === item.id;
          const avatar = item.avatarUrl ? (item.avatarUrl.startsWith("http") ? item.avatarUrl : `${getApiBaseUrl()}${item.avatarUrl}`) : undefined;
          const isBusy = updateStatus.isPending || deleteUser.isPending || resetResidentPassword.isPending;
          return (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: expanded ? colors.primary : colors.border }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Ver detalhes de ${item.name ?? "usuário"}`} onPress={() => setExpandedId(expanded ? null : item.id)} style={({ pressed }) => [styles.cardTop, pressed && styles.cardPressed]}>
                <View style={[styles.avatar, { backgroundColor: item.role === "admin" ? colors.primary : tint }]}>{avatar ? <CachedImage source={{ uri: avatar }} fallbackSource={require("@/assets/images/icon.png")} style={styles.avatarImage} contentFit="cover" cachePolicy="memory-disk" transition={180} /> : <Text style={styles.avatarText}>{(item.name ?? "U").slice(0, 1).toUpperCase()}</Text>}</View>
                <View style={styles.identity}>
                  <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{item.name ?? "Usuário sem nome"}</Text>
                  <Text style={[styles.username, { color: colors.muted }]} numberOfLines={1}>{item.username && !item.username.startsWith("admin:") ? `@${item.username}` : "Conta administrativa"}</Text>
                  {item.role === "user" && (item.neighborhood || item.phone) ? <Text style={[styles.contactLine, { color: colors.foreground }]} numberOfLines={1}>{[item.neighborhood, item.phone && item.phone !== "-" ? item.phone : null].filter(Boolean).join("  ·  ")}</Text> : null}
                  <View style={styles.roleRow}><View style={[styles.roleBadge, { backgroundColor: item.role === "admin" ? colors.primary + "18" : colors.surface, borderColor: item.role === "admin" ? colors.primary + "50" : colors.border }]}><Text style={[styles.roleBadgeText, { color: item.role === "admin" ? colors.primary : colors.muted }]}>{item.role === "admin" ? "Administrador" : "Morador"}</Text></View><View style={[styles.statusBadge, { backgroundColor: tint + "18" }]}><Text style={[styles.statusText, { color: tint }]}>{statusLabels[residentStatus]}</Text></View></View>
                </View>
                <View style={styles.cardArrow}><Text style={[styles.arrowText, { color: colors.primary }]}>{expanded ? "⌃" : "›"}</Text></View>
              </Pressable>

              <View style={[styles.quickInfo, { borderTopColor: colors.border }]}><Text style={[styles.quickLabel, { color: colors.muted }]}>Cadastro</Text><Text style={[styles.quickValue, { color: colors.foreground }]}>{formatDate(item.createdAt)}</Text><Text style={[styles.quickLabel, { color: colors.muted }]}>Último acesso</Text><Text style={[styles.quickValue, { color: colors.foreground }]}>{item.lastSignedIn ? formatDateTime(item.lastSignedIn) : "Ainda não acessou"}</Text></View>

              {expanded && <View style={[styles.details, { borderTopColor: colors.border }]}>
                <Text style={[styles.detailsTitle, { color: colors.foreground }]}>Detalhes do cadastro</Text>
                <View style={styles.detailRow}><Text style={[styles.detailLabel, { color: colors.muted }]}>Telefone</Text><Text style={[styles.detailValue, { color: colors.foreground }]}>{displayValue(item.phone)}</Text></View>
                <View style={styles.detailRow}><Text style={[styles.detailLabel, { color: colors.muted }]}>E-mail</Text><Text style={[styles.detailValue, { color: colors.foreground }]}>{displayValue(item.email)}</Text></View>
                <View style={styles.detailRow}><Text style={[styles.detailLabel, { color: colors.muted }]}>Endereço</Text><Text style={[styles.detailValue, { color: colors.foreground }]}>{displayValue(item.address)}</Text></View>
                {item.complement ? <View style={styles.detailRow}><Text style={[styles.detailLabel, { color: colors.muted }]}>Complemento</Text><Text style={[styles.detailValue, { color: colors.foreground }]}>{item.complement}</Text></View> : null}
                <View style={styles.detailRow}><Text style={[styles.detailLabel, { color: colors.muted }]}>Sexo</Text><Text style={[styles.detailValue, { color: colors.foreground }]}>{item.sex ? sexLabels[item.sex] : "Não informado"}</Text></View>
                <View style={styles.detailRow}><Text style={[styles.detailLabel, { color: colors.muted }]}>Moradores</Text><Text style={[styles.detailValue, { color: colors.foreground }]}>{item.householdSize ? `${item.householdSize} pessoa(s)` : "Não informado"}</Text></View>
                <View style={styles.detailRow}><Text style={[styles.detailLabel, { color: colors.muted }]}>Emergência</Text><Text style={[styles.detailValue, { color: colors.foreground }]}>{displayValue(item.emergencyContact)}</Text></View>
                <View style={styles.detailRow}><Text style={[styles.detailLabel, { color: colors.muted }]}>Atualizado</Text><Text style={[styles.detailValue, { color: colors.foreground }]}>{formatDateTime(item.updatedAt)}</Text></View>
                {item.role === "user" ? <View style={styles.actions}>
                  {residentStatus !== "approved" && <Pressable disabled={isBusy} accessibilityRole="button" onPress={() => confirmStatus(item, "approved")} style={({ pressed }) => [styles.action, { backgroundColor: colors.success }, pressed && styles.pressed, isBusy && styles.disabled]}><Text style={styles.actionText}>Aprovar</Text></Pressable>}
                  {residentStatus !== "blocked" && <Pressable disabled={isBusy} accessibilityRole="button" onPress={() => confirmStatus(item, "blocked")} style={({ pressed }) => [styles.action, { backgroundColor: colors.error }, pressed && styles.pressed, isBusy && styles.disabled]}><Text style={styles.actionText}>Bloquear</Text></Pressable>}
                  <Pressable disabled={isBusy} accessibilityRole="button" accessibilityLabel={`Redefinir senha de ${item.name ?? "usuário"}`} onPress={() => confirmResetPassword(item)} style={({ pressed }) => [styles.action, { backgroundColor: colors.primary }, pressed && styles.pressed, isBusy && styles.disabled]}><Text style={styles.actionText}>{resetResidentPassword.isPending ? "Gerando…" : "Redefinir senha"}</Text></Pressable>
                  <Pressable disabled={isBusy} accessibilityRole="button" onPress={() => confirmDelete(item)} style={({ pressed }) => [styles.action, { backgroundColor: "#991B1B" }, pressed && styles.pressed, isBusy && styles.disabled]}><Text style={styles.actionText}>Excluir cadastro</Text></Pressable>
                </View> : <View style={[styles.protectedNotice, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "35" }]}><Text style={[styles.protectedText, { color: colors.primary }]}>Conta administrativa protegida. O gerenciamento de moradores permanece disponível abaixo.</Text></View>}
              </View>}
            </View>
          );
        }}
        ListEmptyComponent={<View style={styles.empty}>{users.isLoading ? <ActivityIndicator color={colors.primary} size="large" /> : <><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nenhum usuário encontrado</Text><Text style={[styles.emptyText, { color: colors.muted }]}>{search || statusFilter !== "all" || roleFilter !== "all" || neighborhoodFilter || locationFilter ? "Tente remover um filtro ou ajustar os termos da busca." : "Ainda não há cadastros disponíveis para exibição."}</Text>{(search || statusFilter !== "all" || roleFilter !== "all" || neighborhoodFilter || locationFilter) && <Pressable onPress={() => { setSearch(""); setStatusFilter("all"); setRoleFilter("all"); setPeriodFilter("all"); setNeighborhoodFilter(""); setLocationFilter(""); }} style={({ pressed }) => [styles.clearFilters, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={styles.clearFiltersText}>Limpar filtros</Text></Pressable>}</>}</View>}
      />
    </View></ScreenContainer>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 36 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 17 },
  backButton: { paddingVertical: 6, paddingRight: 10 },
  back: { fontSize: 15, fontWeight: "800" },
  refreshButton: { width: 38, height: 38, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: "900", letterSpacing: -0.7, marginTop: 5 },
  intro: { fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 16 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 16 },
  summaryCard: { width: "48.4%", minHeight: 82, borderRadius: 19, borderWidth: 1, padding: 13, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  summaryNumber: { fontSize: 25, fontWeight: "900", lineHeight: 28 },
  summaryLabel: { fontSize: 12, fontWeight: "800", marginTop: 4 },
  searchBox: { minHeight: 50, borderRadius: 16, borderWidth: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 13, marginBottom: 17 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, paddingHorizontal: 10, paddingVertical: 12 },
  locationGlyph: { fontSize: 23, fontWeight: "900", marginHorizontal: 3 },
  clearSearch: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  clearSearchText: { fontSize: 26, lineHeight: 26, fontWeight: "400" },
  filterHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  filterTitle: { fontSize: 18, fontWeight: "900" },
  filterResult: { fontSize: 12, fontWeight: "700" },
  filterLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 12, marginBottom: 7 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8 },
  chipText: { fontSize: 11, fontWeight: "900" },
  sortRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  sortButton: { minHeight: 36, borderRadius: 11, borderWidth: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 11, gap: 8 },
  sortButtonText: { fontSize: 12, fontWeight: "900" },
  sortChevron: { fontSize: 17, lineHeight: 17, marginTop: -3 },
  exportCard: { borderWidth: 1, borderRadius: 19, padding: 13, marginTop: 15, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  exportCopy: { flex: 1 },
  exportTitle: { fontSize: 14, fontWeight: "900" },
  exportSubtitle: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  exportActions: { flexDirection: "row", gap: 8, marginTop: 11 },
  exportButton: { flex: 1, minHeight: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  exportButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  feedback: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, marginTop: 14 },
  feedbackText: { fontSize: 12, fontWeight: "800", lineHeight: 17 },
  sectionHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 20, marginBottom: 9 },
  sectionTitle: { fontSize: 18, fontWeight: "900" },
  sectionHint: { fontSize: 11, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 18, marginBottom: 10, overflow: "hidden" },
  cardTop: { minHeight: 82, flexDirection: "row", alignItems: "center", padding: 14 },
  cardPressed: { opacity: 0.72 },
  avatar: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", overflow: "hidden", marginRight: 11 },
  avatarImage: { width: "100%", height: "100%" },
  avatarText: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  identity: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, lineHeight: 20, fontWeight: "900" },
  username: { fontSize: 12, lineHeight: 17, marginTop: 1 },
  roleRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 5 },
  roleBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  roleBadgeText: { fontSize: 9, fontWeight: "900" },
  statusBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4 },
  statusText: { fontSize: 9, fontWeight: "900" },
  cardArrow: { width: 24, alignItems: "flex-end" },
  arrowText: { fontSize: 25, lineHeight: 25, fontWeight: "500" },
  quickInfo: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7, paddingHorizontal: 14, paddingVertical: 9 },
  quickLabel: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  quickValue: { fontSize: 11, fontWeight: "800", marginRight: 7 },
  details: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14 },
  detailsTitle: { fontSize: 14, fontWeight: "900", marginBottom: 5 },
  detailRow: { flexDirection: "row", gap: 8, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E2E8F0" },
  detailLabel: { width: 91, fontSize: 11, fontWeight: "800" },
  detailValue: { flex: 1, fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 13 },
  action: { minHeight: 41, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 13 },
  actionText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  protectedNotice: { borderWidth: 1, borderRadius: 12, padding: 11, marginTop: 13 },
  protectedText: { fontSize: 11, lineHeight: 16, fontWeight: "800" },
  empty: { alignItems: "center", paddingHorizontal: 18, paddingVertical: 38 },
  emptyTitle: { fontSize: 17, fontWeight: "900", textAlign: "center" },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 6 },
  clearFilters: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, marginTop: 14 },
  clearFiltersText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  adminWarn: { borderWidth: 1.5, borderRadius: 18, padding: 14, marginBottom: 14 },
  adminWarnTitle: { fontSize: 14, fontWeight: "900" },
  adminWarnText: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  adminWarnButton: { minHeight: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 13, marginTop: 11 },
  letterHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 12, paddingBottom: 8, marginBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  letterBubble: { width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  letterText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  letterCount: { fontSize: 12, fontWeight: "800" },
  contactLine: { fontSize: 12, lineHeight: 17, marginTop: 2, fontWeight: "700" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.55 },
});
