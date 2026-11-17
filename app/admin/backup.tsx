import React from "react";
import { Alert, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { TextInput } from "@/components/text-input";
import { Pressable } from "@/components/pressable";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/page-header";

export default function BackupScreen() {
  const colors = useColors();
  const [restoreId, setRestoreId] = React.useState<number | null>(null);
  const [confirmation, setConfirmation] = React.useState("");
  const backups = trpc.backup.list.useQuery(undefined, { retry: false, staleTime: 5_000 });
  const create = trpc.backup.create.useMutation({ onSuccess: () => void backups.refetch() });
  const restore = trpc.backup.restore.useMutation({ onSuccess: () => { void backups.refetch(); Alert.alert("Restauração concluída", "Os dados foram restaurados a partir do backup selecionado."); } });
  const createBackup = () => create.mutate({ label: `Backup manual ${new Date().toLocaleString("pt-BR")}` });
  const askRestore = (id: number) => { setConfirmation(""); setRestoreId(id); };
  const confirmRestore = () => { if (restoreId === null) return; if (confirmation.trim() !== "RESTAURAR CONECTA") { Alert.alert("Restauração cancelada", "Digite exatamente RESTAURAR CONECTA para continuar."); return; } const id = restoreId; setRestoreId(null); restore.mutate({ id, confirmation: "RESTAURAR CONECTA" }); };
  return <ScreenContainer className="px-0 pt-0" edges={["left", "right", "bottom"]} containerClassName="bg-background"><PageHeader kicker="DADOS DO CONECTA BARRA" title="Backup e restauração" subtitle="Crie uma cópia antes de mudanças importantes." /><View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 14 }}>
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" accessibilityLabel="Criar backup agora" onPress={createBackup} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={styles.primaryText}>{create.isPending ? "Criando backup…" : "Criar backup agora"}</Text></Pressable>
      {create.error && <Text style={[styles.error, { color: colors.error }]}>{create.error.message}</Text>}
      {backups.isLoading && <Text style={[styles.state, { color: colors.muted }]}>Carregando backups…</Text>}
      {backups.error && <Text style={[styles.state, { color: colors.error }]}>Não foi possível carregar os backups.</Text>}
      {(backups.data ?? []).map((backup) => <View key={backup.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>{backup.label}</Text>
        <Text style={[styles.meta, { color: colors.muted }]}>Criado em: {new Date(backup.createdAt).toLocaleString("pt-BR")}</Text>
        <Text style={[styles.checksum, { color: colors.muted }]} numberOfLines={2}>SHA-256: {backup.checksum}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Restaurar ${backup.label}`} onPress={() => askRestore(backup.id)} style={({ pressed }) => [styles.outline, { borderColor: colors.error }, pressed && styles.pressed]}><Text style={[styles.outlineText, { color: colors.error }]}>Restaurar este backup</Text></Pressable>
      </View>)}
      {!backups.isLoading && !backups.error && (backups.data ?? []).length === 0 && <Text style={[styles.state, { color: colors.muted }]}>Nenhum backup criado ainda.</Text>}
    </ScrollView>
    <Modal visible={restoreId !== null} transparent animationType="fade" onRequestClose={() => setRestoreId(null)}>
      <View style={styles.modalBackdrop}><View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.modalTitle, { color: colors.foreground }]}>Confirmar restauração</Text><Text style={[styles.modalText, { color: colors.muted }]}>Esta ação substitui os dados atuais. Digite RESTAURAR CONECTA para confirmar.</Text><TextInput autoCapitalize="characters" value={confirmation} onChangeText={setConfirmation} placeholder="RESTAURAR CONECTA" placeholderTextColor={colors.muted} accessibilityLabel="Texto de confirmação da restauração" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} /><View style={styles.modalActions}><Pressable onPress={() => setRestoreId(null)} style={[styles.modalButton, { borderColor: colors.border }]}><Text style={[styles.modalButtonText, { color: colors.foreground }]}>Cancelar</Text></Pressable><Pressable onPress={confirmRestore} disabled={restore.isPending} style={[styles.modalButton, { backgroundColor: colors.error, borderColor: colors.error }]}><Text style={styles.modalButtonTextLight}>{restore.isPending ? "Restaurando…" : "Confirmar"}</Text></Pressable></View></View></View>
    </Modal>
  </View></ScreenContainer>;
}
const styles = StyleSheet.create({ content: { gap: 14, paddingBottom: 40 }, back: { alignSelf: "flex-start", minHeight: 48, paddingHorizontal: 16, borderWidth: 2, borderRadius: 16, justifyContent: "center" }, backText: { fontSize: 17, fontWeight: "800" }, eyebrow: { fontSize: 13, fontWeight: "800", letterSpacing: 1.4, marginTop: 8 }, title: { fontSize: 34, lineHeight: 40, fontWeight: "900" }, subtitle: { fontSize: 16, lineHeight: 24 }, primary: { minHeight: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }, primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" }, error: { fontSize: 14, lineHeight: 20 }, state: { fontSize: 16, lineHeight: 24 }, card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 8 }, cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: "800" }, meta: { fontSize: 14, lineHeight: 20 }, checksum: { fontSize: 12, lineHeight: 17 }, outline: { minHeight: 46, borderWidth: 2, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 4 }, outlineText: { fontSize: 15, fontWeight: "800" }, pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] }, modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 20 }, modalCard: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 14 }, modalTitle: { fontSize: 22, lineHeight: 28, fontWeight: "900" }, modalText: { fontSize: 15, lineHeight: 22 }, input: { minHeight: 52, borderWidth: 2, borderRadius: 14, paddingHorizontal: 14, fontSize: 16 }, modalActions: { flexDirection: "row", gap: 10 }, modalButton: { flex: 1, minHeight: 48, borderWidth: 2, borderRadius: 14, justifyContent: "center", alignItems: "center" }, modalButtonText: { fontSize: 15, fontWeight: "800" }, modalButtonTextLight: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" } });
