import { useState } from "react";
import { Alert, FlatList, StyleSheet, Switch, Text, View } from "react-native";
import { TextInput } from "@/components/text-input";
import { Pressable } from "@/components/pressable";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { QueryState } from "@/components/query-state";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/page-header";

/** Gestão dos bairros usados nos filtros e na busca de CEP. Novos bairros vindos do CEP aparecem aqui. */
export default function NeighborhoodsAdmin() {
  const colors = useColors();
  const list = trpc.neighborhoods.listAll.useQuery();
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [area, setArea] = useState("Sede");
  const add = trpc.neighborhoods.add.useMutation({ onSuccess: () => { setName(""); void utils.neighborhoods.invalidate(); }, onError: (e) => Alert.alert("Não foi possível adicionar", e.message) });
  const setActive = trpc.neighborhoods.setActive.useMutation({ onSuccess: () => void utils.neighborhoods.invalidate(), onError: (e) => Alert.alert("Erro", e.message) });

  return (
    <ScreenContainer className="px-0 pt-0" edges={["left", "right", "bottom"]}><PageHeader kicker="GESTÃO" title="Bairros de Barra do Piraí" subtitle="Filtros, CEP e comunicados por bairro." /><View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 14 }}>
      
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 10 }}>Esta lista alimenta os filtros e os comunicados por bairro. Bairros novos retornados pela busca de CEP entram automaticamente (origem “cep”); desative os que estiverem incorretos.</Text>
      <View style={styles.addRow}>
        <TextInput value={name} onChangeText={setName} placeholder="Novo bairro" placeholderTextColor={colors.muted} style={[styles.input, { flex: 1, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />
        <Pressable onPress={() => setArea((a) => (a === "Sede" ? "Distrito" : "Sede"))} style={[styles.areaChip, { borderColor: colors.border }]}><Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 12 }}>{area}</Text></Pressable>
        <Pressable disabled={name.trim().length < 2 || add.isPending} onPress={() => add.mutate({ name, area })} style={[styles.addBtn, { backgroundColor: colors.primary, opacity: name.trim().length < 2 ? 0.5 : 1 }]}><Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Adicionar</Text></Pressable>
      </View>
      {list.isLoading || list.error ? <QueryState colors={colors} loading={list.isLoading} error={list.error} onRetry={() => void list.refetch()} /> : (
        <FlatList data={list.data} keyExtractor={(item) => String(item.id)} contentContainerStyle={{ paddingBottom: 40, gap: 8 }} renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 15 }}>{item.name}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{item.area} • origem: {item.source}</Text></View>
            <Switch value={item.active} onValueChange={(active) => setActive.mutate({ id: item.id, active })} trackColor={{ true: colors.primary }} />
          </View>
        )} />
      )}
    </View></ScreenContainer>
  );
}
const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  back: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  title: { fontSize: 18, fontWeight: "900", flex: 1 },
  addRow: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 12 },
  input: { minHeight: 54, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12 },
  areaChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 14 },
  addBtn: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 18, padding: 12, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
});
