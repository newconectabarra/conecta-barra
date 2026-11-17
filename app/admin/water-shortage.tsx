import { useMemo } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/pressable";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { QueryState } from "@/components/query-state";
import { PageHeader } from "@/components/page-header";

export default function AdminWaterShortageScreen() {
  const colors = useColors();
  const query = trpc.reports.waterShortage.useQuery();
  const update = trpc.reports.markWaterShortageAttended.useMutation({ onSuccess: () => void query.refetch(), onError: (error) => Alert.alert("Não foi possível atualizar", error.message) });
  const rows = useMemo(() => query.data ?? [], [query.data]);

  const toggle = (id: number, attended: boolean) => {
    update.mutate({ id, attended: !attended });
  };

  return (
    <ScreenContainer className="px-0 pt-0" edges={["left", "right", "bottom"]} containerClassName="bg-background"><PageHeader kicker="CONTROLE DE ATENDIMENTO" title="Falta de água" subtitle="Marque quem já foi atendido." /><View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 14 }}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {query.isLoading ? <QueryState colors={colors} loading compact loadingText="Carregando registros…" /> : query.error ? <QueryState colors={colors} loading={false} error={query.error} compact errorTitle="Não foi possível carregar os registros" onRetry={() => void query.refetch()} /> : rows.map((item) => {
          const attended = Boolean(item.waterAttendedAt);
          return (
            <View key={item.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: attended ? colors.success : colors.border }]}>
              <View style={styles.cardCopy}>
                <Text style={[styles.address, { color: colors.foreground }]}>{item.fullAddress}</Text>
                <Text style={[styles.description, { color: colors.muted }]}>{item.description}</Text>
                <Text style={[styles.status, { color: attended ? colors.success : colors.warning }]}>{attended ? `Concluído em ${new Date(item.waterAttendedAt as Date).toLocaleString("pt-BR")}` : "Aguardando atendimento"}</Text>
              </View>
              <Pressable onPress={() => toggle(item.id, attended)} disabled={update.isPending} style={({ pressed }) => [styles.action, { backgroundColor: attended ? colors.surface : colors.success, borderColor: attended ? colors.success : colors.success }, pressed && styles.pressed]}>
                <Text style={[styles.actionText, { color: attended ? colors.success : "#FFFFFF" }]}>{attended ? "Reabrir" : "Concluído"}</Text>
              </Pressable>
            </View>
          );
        })}
        {!query.isLoading && !query.error && rows.length === 0 && <Text style={[styles.empty, { color: colors.muted }]}>Nenhum registro de falta de água encontrado.</Text>}
      </ScrollView>
    </View></ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32, gap: 14 },
  back: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
  backText: { fontSize: 13, fontWeight: "800" },
  eyebrow: { fontSize: 11, fontWeight: "900", letterSpacing: 1.1, marginTop: 12 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: "900" },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 20, padding: 15, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  cardCopy: { flex: 1 },
  address: { fontSize: 15, fontWeight: "900" },
  description: { fontSize: 12, lineHeight: 17, marginTop: 5 },
  status: { fontSize: 12, fontWeight: "800", marginTop: 8 },
  action: { minWidth: 84, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 9, alignItems: "center" },
  actionText: { fontSize: 12, fontWeight: "900" },
  empty: { textAlign: "center", paddingVertical: 28 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
