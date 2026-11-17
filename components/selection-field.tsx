import { useState } from "react";
import { FlatList, Modal, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/pressable";

import { useColors } from "@/hooks/use-colors";

export type SelectionOption<T extends string = string> = {
  value: T;
  label: string;
};

type SelectionFieldProps<T extends string> = {
  value: T;
  options: readonly SelectionOption<T>[];
  onChange: (value: T) => void;
  title: string;
  placeholder: string;
  accessibilityLabel: string;
  disabled?: boolean;
  emptyText?: string;
};

export function SelectionField<T extends string>({
  value,
  options,
  onChange,
  title,
  placeholder,
  accessibilityLabel,
  disabled = false,
  emptyText = "Nenhuma opção disponível.",
}: SelectionFieldProps<T>) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? (value || placeholder);

  const select = (optionValue: T) => {
    onChange(optionValue);
    setVisible(false);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel}: ${selectedLabel}`}
        accessibilityState={{ disabled, expanded: visible }}
        disabled={disabled}
        onPress={() => setVisible(true)}
        style={({ pressed }) => [
          styles.field,
          { backgroundColor: value ? "#EAF4FF" : colors.surface, borderColor: colors.border },
          disabled && styles.disabled,
          pressed && !disabled && styles.pressed,
        ]}
      >
        <Text numberOfLines={1} style={[styles.value, { color: selectedLabel === placeholder ? colors.muted : "#000000" }]}>
          {selectedLabel}
        </Text>
        <Text accessibilityElementsHidden style={[styles.chevron, { color: colors.primary }]}>⌄</Text>
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.backdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar seletor" onPress={() => setVisible(false)} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.header}>
              <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{title}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Fechar seletor" onPress={() => setVisible(false)} style={[styles.close, { borderColor: colors.border }]}>
                <Text style={[styles.closeText, { color: colors.foreground }]}>×</Text>
              </Pressable>
            </View>
            <FlatList
              data={options as SelectionOption<T>[]}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              ListEmptyComponent={<Text style={[styles.empty, { color: colors.muted }]}>{emptyText}</Text>}
              renderItem={({ item }) => {
                const selected = item.value === value;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => select(item.value)}
                    style={[styles.option, { borderBottomColor: colors.border }, selected && { backgroundColor: "#EAF4FF", borderColor: colors.primary }]}
                  >
                    <Text style={[styles.optionText, { color: "#000000" }]}>{item.label}</Text>
                    {selected ? <Text style={[styles.check, { color: colors.primary }]}>✓</Text> : null}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 54, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  value: { flex: 1, fontSize: 15, fontWeight: "900" },
  chevron: { fontSize: 22, lineHeight: 24, fontWeight: "900" },
  backdrop: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.48)" },
  card: { width: "100%", maxWidth: 480, maxHeight: "80%", alignSelf: "center", borderWidth: 1, borderRadius: 24, padding: 16, overflow: "hidden", shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 12 },
  title: { flex: 1, fontSize: 17, fontWeight: "900" },
  close: { width: 36, height: 36, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  closeText: { fontSize: 24, lineHeight: 28, fontWeight: "600" },
  list: { flexGrow: 0 },
  option: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderWidth: 1, borderColor: "transparent", borderRadius: 10, marginBottom: 3 },
  optionText: { flex: 1, fontSize: 14, fontWeight: "900" },
  check: { fontSize: 17, fontWeight: "900" },
  empty: { padding: 18, textAlign: "center", fontSize: 13 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.78 },
});
