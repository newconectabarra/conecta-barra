import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/pressable";
import { IconBadge, Reveal, SkeletonCard } from "@/components/ui-kit";
import { useColors } from "@/hooks/use-colors";

type Colors = ReturnType<typeof useColors>;

type QueryStateProps = {
  colors?: Colors;
  loading: boolean;
  error?: unknown;
  empty?: boolean;
  loadingText?: string;
  errorTitle?: string;
  errorText?: string;
  emptyTitle?: string;
  emptyText?: string;
  onRetry?: () => void;
  retryLabel?: string;
  onReset?: () => void;
  resetLabel?: string;
  compact?: boolean;
};

export function QueryState({
  colors: providedColors,
  loading,
  error,
  empty = false,
  loadingText = "Carregando…",
  errorTitle = "Não foi possível carregar",
  errorText = "Verifique sua conexão e tente novamente.",
  emptyTitle = "Nenhum registro",
  emptyText = "Ainda não há informações para exibir.",
  onRetry,
  retryLabel = "Tentar novamente",
  onReset,
  resetLabel = "Entrar novamente",
  compact = false,
}: QueryStateProps) {
  const fallbackColors = useColors();
  const colors = providedColors ?? fallbackColors;

  if (loading) {
    return (
      <View accessible accessibilityLiveRegion="polite" accessibilityLabel={loadingText} style={{ gap: 10, marginTop: compact ? 8 : 12 }}>
        <SkeletonCard lines={compact ? 1 : 2} />
        {!compact && <SkeletonCard lines={2} />}
        {!compact && <SkeletonCard lines={1} />}
      </View>
    );
  }

  if (error) {
    return (
      <Reveal><View style={[styles.box, compact && styles.compact, { backgroundColor: colors.surface, borderColor: colors.error + "66" }]}>
        {!compact && <IconBadge name="exclamationmark.triangle.fill" color={colors.error} />}
        <Text style={[styles.title, { color: colors.error }]}>{errorTitle}</Text>
        <Text style={[styles.text, { color: colors.muted }]}>{errorText}</Text>
        {(onRetry || onReset) && (
          <View style={styles.actions}>
            {onRetry && (
              <Pressable accessibilityRole="button" accessibilityLabel={retryLabel} onPress={onRetry} style={({ pressed }) => [styles.retry, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
                <Text style={styles.retryText}>{retryLabel}</Text>
              </Pressable>
            )}
            {onReset && (
              <Pressable accessibilityRole="button" accessibilityLabel={resetLabel} onPress={onReset} style={({ pressed }) => [styles.reset, { borderColor: colors.primary }, pressed && styles.pressed]}>
                <Text style={[styles.resetText, { color: colors.primary }]}>{resetLabel}</Text>
              </Pressable>
            )}
          </View>
        )}
      </View></Reveal>
    );
  }

  if (!empty) return null;

  return (
    <Reveal><View style={[styles.box, compact && styles.compact, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {!compact && <IconBadge name="tray.fill" color={colors.primary} />}
      <Text style={[styles.title, { color: colors.foreground }]}>{emptyTitle}</Text>
      <Text style={[styles.text, { color: colors.muted }]}>{emptyText}</Text>
    </View></Reveal>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 26, padding: 26, minHeight: 140, alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  compact: { minHeight: 74, padding: 16, marginTop: 8 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: "900", textAlign: "center" },
  text: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  actions: { width: "100%", alignItems: "center", gap: 8, marginTop: 5 },
  retry: { minHeight: 48, borderRadius: 16, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", minWidth: 170 },
  retryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  reset: { minHeight: 46, borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", minWidth: 170 },
  resetText: { fontSize: 13, fontWeight: "900" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
