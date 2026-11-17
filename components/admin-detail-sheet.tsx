import type { ReactNode } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/pressable";
import { useColors } from "@/hooks/use-colors";

/**
 * Painel deslizante usado pelos cards do painel de gestão ("Resumo rápido" e "Indicadores de gestão").
 * Ao tocar em um card, as informações que formam aquele número abrem aqui.
 */
export function AdminDetailSheet({ visible, title, subtitle, onClose, children }: { visible: boolean; title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const colors = useColors();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar detalhes" style={styles.dismiss} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.foreground }]} accessibilityRole="header">{title}</Text>
              {subtitle ? <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} style={[styles.close, { backgroundColor: colors.primary + "14" }]}>
              <Text style={[styles.closeText, { color: colors.primary }]}>Fechar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Linha tocável dentro do painel. */
export function DetailRow({ title, lines, badge, badgeColor, onPress }: { title: string; lines?: string[]; badge?: string; badgeColor?: string; onPress?: () => void }) {
  const colors = useColors();
  const content = (
    <>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={2}>{title}</Text>
        {(lines ?? []).filter(Boolean).map((line, index) => <Text key={index} style={[styles.rowLine, { color: colors.muted }]} numberOfLines={3}>{line}</Text>)}
      </View>
      {badge ? <Text style={[styles.badge, { color: badgeColor ?? colors.primary, backgroundColor: (badgeColor ?? colors.primary) + "18" }]}>{badge}</Text> : null}
      {onPress ? <Text style={[styles.chevron, { color: colors.primary }]}>›</Text> : null}
    </>
  );
  const rowStyle = [styles.row, { backgroundColor: colors.surface, borderColor: colors.border }];
  return onPress
    ? <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [...rowStyle, pressed && { opacity: 0.75 }]}>{content}</Pressable>
    : <View style={rowStyle}>{content}</View>;
}

export function DetailEmpty({ text }: { text: string }) {
  const colors = useColors();
  return <Text style={[styles.empty, { color: colors.muted }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000066" },
  dismiss: { flex: 1 },
  sheet: { maxHeight: "82%", minHeight: "40%", borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, paddingTop: 8 },
  grabber: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, marginBottom: 10 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 18, paddingBottom: 10 },
  title: { fontSize: 19, fontWeight: "900" },
  subtitle: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  close: { minHeight: 40, borderRadius: 12, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  closeText: { fontSize: 13, fontWeight: "900" },
  body: { paddingHorizontal: 18, paddingBottom: 34, gap: 9 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 16, padding: 12, minHeight: 56 },
  rowTitle: { fontSize: 14, fontWeight: "900" },
  rowLine: { fontSize: 12, lineHeight: 17 },
  badge: { fontSize: 10, fontWeight: "900", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, overflow: "hidden" },
  chevron: { fontSize: 24, fontWeight: "700" },
  empty: { fontSize: 13, lineHeight: 19, textAlign: "center", paddingVertical: 24 },
});
