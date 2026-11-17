import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { TextInput } from "@/components/text-input";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import { formatCep } from "@/shared/neighborhoods";
import { SelectionField } from "@/components/selection-field";

export type AddressValue = { cep: string; street: string; number: string; complement: string; neighborhood: string };
export const emptyAddress: AddressValue = { cep: "", street: "", number: "", complement: "", neighborhood: "" };

export function isAddressComplete(a: AddressValue) {
  return a.cep.replace(/\D/g, "").length === 8 && a.street.trim().length >= 2 && a.number.trim().length >= 1 && a.neighborhood.trim().length >= 2;
}

/**
 * Endereço de Barra do Piraí-RJ com preenchimento automático por CEP (ViaCEP/BrasilAPI via servidor).
 * Rua e bairro vêm do CEP; o morador completa número e complemento. CEPs de outras cidades são recusados.
 */
export function AddressFields({ value, onChange }: { value: AddressValue; onChange: (next: AddressValue) => void }) {
  const colors = useColors();
  const utils = trpc.useUtils();
  const neighborhoods = trpc.neighborhoods.list.useQuery(undefined, { staleTime: 5 * 60_000 });
  const [state, setState] = useState<{ kind: "idle" | "loading" | "ok" | "error"; message?: string }>({ kind: "idle" });
  const lastLookup = useRef<string>("");
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const digits = value.cep.replace(/\D/g, "");
    if (digits.length !== 8) { setState({ kind: "idle" }); lastLookup.current = ""; return; }
    if (lastLookup.current === digits) return;
    lastLookup.current = digits;
    setState({ kind: "loading" });
    let cancelled = false;
    utils.address.lookupCep.fetch({ cep: digits }, { staleTime: 60 * 60_000 })
      .then((result) => {
        if (cancelled) return;
        onChange({ ...valueRef.current, cep: result.cep, street: result.street || valueRef.current.street, neighborhood: result.neighborhood || valueRef.current.neighborhood, complement: valueRef.current.complement || result.complement });
        setState({ kind: "ok", message: result.neighborhood ? `Endereço encontrado: ${result.neighborhood}` : "CEP encontrado. Escolha o bairro abaixo." });
      })
      .catch((error: { message?: string }) => { if (!cancelled) { lastLookup.current = ""; setState({ kind: "error", message: error.message ?? "Não foi possível consultar o CEP." }); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.cep]);

  const field = [styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }];
  const statusColor = state.kind === "error" ? colors.error : state.kind === "ok" ? colors.success : colors.muted;
  const neighborhoodOptions = (neighborhoods.data ?? []).map((item) => ({ value: item.name, label: item.name }));
  if (value.neighborhood && !neighborhoodOptions.some((item) => item.value === value.neighborhood)) {
    neighborhoodOptions.unshift({ value: value.neighborhood, label: value.neighborhood });
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.foreground }]}>CEP</Text>
      <View style={styles.cepRow}>
        <TextInput accessibilityLabel="CEP" value={value.cep} onChangeText={(text) => onChange({ ...value, cep: formatCep(text) })} keyboardType="number-pad" maxLength={9} placeholder="27123-080" placeholderTextColor={colors.muted} style={[...field, { flex: 1 }]} />
        {state.kind === "loading" && <ActivityIndicator color={colors.primary} />}
      </View>
      {state.message ? <Text style={[styles.hint, { color: statusColor }]}>{state.message}</Text> : <Text style={[styles.hint, { color: colors.muted }]}>Digite o CEP e o endereço será preenchido automaticamente.</Text>}

      <Text style={[styles.label, { color: colors.foreground }]}>Rua / logradouro</Text>
      <TextInput accessibilityLabel="Rua" value={value.street} onChangeText={(street) => onChange({ ...value, street })} placeholder="Rua, avenida…" placeholderTextColor={colors.muted} style={field} />

      <View style={styles.twoCols}>
        <View style={{ width: 110 }}>
          <Text style={[styles.label, { color: colors.foreground }]}>Número</Text>
          <TextInput accessibilityLabel="Número" value={value.number} onChangeText={(number) => onChange({ ...value, number })} placeholder="123" placeholderTextColor={colors.muted} style={field} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.foreground }]}>Complemento</Text>
          <TextInput accessibilityLabel="Complemento" value={value.complement} onChangeText={(complement) => onChange({ ...value, complement })} placeholder="Apto, bloco… (opcional)" placeholderTextColor={colors.muted} style={field} />
        </View>
      </View>

      <Text style={[styles.label, { color: colors.foreground }]}>Bairro</Text>
      <SelectionField
        value={value.neighborhood}
        options={neighborhoodOptions}
        onChange={(neighborhood) => onChange({ ...value, neighborhood })}
        title="Selecione o bairro"
        placeholder={neighborhoods.isLoading ? "Carregando bairros…" : "Escolha um bairro"}
        accessibilityLabel="Selecionar bairro"
        disabled={neighborhoods.isLoading}
        emptyText={neighborhoods.error ? "Não foi possível carregar os bairros." : "Nenhum bairro disponível."}
      />
      {value.neighborhood ? <Text style={[styles.hint, { color: colors.muted }]}>Bairro selecionado: {value.neighborhood}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: "800", marginTop: 6 },
  input: { minHeight: 54, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, fontSize: 15 },
  cepRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  hint: { fontSize: 12, lineHeight: 17 },
  twoCols: { flexDirection: "row", gap: 10 },
});
