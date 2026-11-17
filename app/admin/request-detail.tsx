import { useMemo } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/pressable";
import { CachedImage } from "@/components/cached-image";
import { router, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { getApiBaseUrl } from "@/constants/oauth";
import { QueryState } from "@/components/query-state";
import { PageHeader } from "@/components/page-header";

import { CATEGORY_LABELS as labels } from "@/shared/categories";
const statuses = [
  { value: "received", label: "Recebida", color: "#2563EB" },
  { value: "reviewing", label: "Em análise", color: "#D97706" },
  { value: "forwarded", label: "Encaminhada", color: "#7C3AED" },
  { value: "in_progress", label: "Em andamento", color: "#0284C7" },
  { value: "completed", label: "Concluída", color: "#16A34A" },
  { value: "cancelled", label: "Cancelada", color: "#DC2626" },
] as const;

export default function RequestDetailScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Number(params.id);
  const query = trpc.requests.all.useQuery(undefined, {
    refetchInterval: 15_000, // 3 s em segundo plano gastava a cota do banco gratuito
    refetchIntervalInBackground: false,
    staleTime: 1_000,
    retry: 1,
  });
  const item = useMemo(() => (query.data ?? []).find((row) => row.id === id), [id, query.data]);
  const update = trpc.requests.updateStatus.useMutation({
    onSuccess: () => void query.refetch(),
    onError: (error) => Alert.alert("Não foi possível atualizar", error.message),
  });
  const remove = trpc.requests.delete.useMutation({
    onSuccess: () => router.replace("/admin"),
    onError: (error) => Alert.alert("Não foi possível excluir", error.message),
  });
  const imageUrl = item?.photoUrl
    ? item.photoUrl.startsWith("http")
      ? item.photoUrl
      : `${getApiBaseUrl()}${item.photoUrl}`
    : null;
  const deleteItem = () =>
    Alert.alert("Excluir solicitação?", "Esta ação não pode ser desfeita.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: () => remove.mutate({ id }) },
    ]);

  if (query.isLoading) {
    return (
      <ScreenContainer className="p-5">
        <QueryState colors={colors} loading loadingText="Carregando solicitação…" />
      </ScreenContainer>
    );
  }
  if (query.error) {
    return (
      <ScreenContainer className="p-5">
        <QueryState
          colors={colors}
          loading={false}
          error={query.error}
          errorTitle="Não foi possível carregar a solicitação"
          onRetry={() => void query.refetch()}
        />
      </ScreenContainer>
    );
  }
  if (!item) {
    return (
      <ScreenContainer className="p-5">
        <QueryState
          colors={colors}
          loading={false}
          empty
          emptyTitle="Solicitação não encontrada"
          emptyText="O registro pode ter sido excluído ou o identificador não é válido."
          onRetry={() => router.replace("/admin")}
          retryLabel="Voltar ao painel"
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="px-0 pt-0" edges={["left", "right", "bottom"]}>
      <PageHeader
        kicker="DETALHE DA SOLICITAÇÃO"
        title={String(labels[item.category] ?? item.category)}
        subtitle={item.createdAt.toLocaleString("pt-BR")}
      />
      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 14 }}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.muted }]}>Solicitante</Text>
            <Text style={[styles.value, { color: colors.foreground }]}>
              👤 {item.requesterName?.trim() || item.requesterUsername?.trim() || "Morador não identificado"}
            </Text>
            <Text style={[styles.label, { color: colors.muted, marginTop: 16 }]}>Endereço completo</Text>
            <Text style={[styles.value, { color: colors.foreground }]}>{item.fullAddress}</Text>
            <Text style={[styles.label, { color: colors.muted, marginTop: 16 }]}>Descrição</Text>
            <Text style={[styles.value, { color: colors.foreground }]}>{item.description}</Text>
            {item.referencePoint && (
              <>
                <Text style={[styles.label, { color: colors.muted, marginTop: 16 }]}>Ponto de referência</Text>
                <Text style={[styles.value, { color: colors.foreground }]}>{item.referencePoint}</Text>
              </>
            )}
          </View>
          {imageUrl ? (
            <CachedImage
              source={{ uri: imageUrl }}
              fallbackSource={require("@/assets/images/icon.png")}
              style={styles.photo}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={180}
            />
          ) : (
            <View style={[styles.noPhoto, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={{ color: colors.muted }}>Nenhuma imagem anexada.</Text>
            </View>
          )}
          <Text style={[styles.section, { color: colors.foreground }]}>Alterar status</Text>
          <View style={styles.statusGrid}>
            {statuses.map((status) => (
              <Pressable
                key={status.value}
                onPress={() => update.mutate({ id, status: status.value })}
                style={[
                  styles.status,
                  {
                    borderColor: status.color,
                    backgroundColor: item.status === status.value ? status.color : status.color + "16",
                  },
                ]}
              >
                <Text
                  style={{
                    color: item.status === status.value ? "#fff" : status.color,
                    fontWeight: "800",
                    fontSize: 12,
                  }}
                >
                  {status.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={deleteItem} style={[styles.delete, { borderColor: colors.error }]}>
            <Text style={{ color: colors.error, fontWeight: "900" }}>Excluir solicitação</Text>
          </Pressable>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingBottom: 36 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  card: { borderWidth: 1, borderRadius: 22, padding: 16, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  label: { fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  value: { fontSize: 16, lineHeight: 23, marginTop: 4 },
  photo: { width: "100%", height: 230, borderRadius: 20 },
  noPhoto: {
    height: 100,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  section: { fontSize: 18, fontWeight: "900", marginTop: 6 },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  status: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 10 },
  delete: { borderWidth: 1, borderRadius: 14, padding: 15, alignItems: "center", marginTop: 8 },
});
