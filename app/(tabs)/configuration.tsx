import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/pressable";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { QueryState } from "@/components/query-state";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useThemeContext } from "@/lib/theme-provider";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/page-header";

const PREFERENCE_OPTIONS = [
  { key: "announcements" as const, label: "Comunicados", description: "Avisos oficiais do Conecta Barra", icon: "megaphone.fill" as const },
  { key: "requests" as const, label: "Solicitações", description: "Atualizações dos seus pedidos", icon: "list.bullet.rectangle.fill" as const },
  { key: "suggestions" as const, label: "Sugestões", description: "Retornos sobre sugestões enviadas", icon: "lightbulb.fill" as const },
  { key: "account" as const, label: "Conta e cadastro", description: "Atualizações do cadastro e acesso", icon: "person.crop.circle.fill" as const },
];

const THEMES = [
  { value: "light" as const, label: "Claro", description: "Fundo claro para ambientes iluminados", icon: "☀️" },
  { value: "dark" as const, label: "Escuro", description: "Menos brilho em ambientes com pouca luz", icon: "🌙" },
];

export default function ConfigurationScreen() {
  const colors = useColors();
  const { colorScheme, setColorScheme } = useThemeContext();
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const userId = me.data?.id ?? 0;
  const preferences = trpc.notifications.preferences.useQuery(undefined, { enabled: userId > 0, staleTime: 5_000, retry: false });
  const updatePreference = trpc.notifications.updatePreference.useMutation({
    onSuccess: async () => { await preferences.refetch(); },
  });

  const preferenceMap = new Map((preferences.data ?? []).map((item) => [item.category, item.enabled]));
  const togglePreference = (category: (typeof PREFERENCE_OPTIONS)[number]["key"]) => {
    if (updatePreference.isPending) return;
    const enabled = preferenceMap.get(category) !== false;
    updatePreference.mutate({ category, enabled: !enabled });
  };

  if (me.isLoading) return <ScreenContainer className="px-5 pt-5"><QueryState colors={colors} loading loadingText="Carregando configurações…" /></ScreenContainer>;
  if (me.error) return <ScreenContainer className="px-5 pt-5"><QueryState colors={colors} loading={false} error={me.error} errorTitle="Não foi possível carregar as configurações" onRetry={() => void me.refetch()} /></ScreenContainer>;
  if (!userId) return <ScreenContainer className="px-5 pt-5"><QueryState colors={colors} loading={false} empty emptyTitle="Entre para configurar o aplicativo" emptyText="Faça login para escolher suas preferências de avisos e tema." onRetry={() => router.replace("/login")} retryLabel="Voltar ao login" /></ScreenContainer>;

  return (
    <ScreenContainer className="px-0 pt-0" edges={["left", "right", "bottom"]}>
<PageHeader kicker="PERSONALIZAÇÃO" title="Configuração" subtitle="Avisos, tema e acessibilidade do Conecta Barra." />
<View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 14 }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: colors.primary + "16" }]}><IconSymbol name="bell.fill" size={20} color={colors.primary} /></View>
            <View style={styles.sectionCopy}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Preferências de avisos</Text><Text style={[styles.sectionHint, { color: colors.muted }]}>Ative ou pause as categorias que aparecem na sua central.</Text></View>
          </View>
          {PREFERENCE_OPTIONS.map((option) => {
            const enabled = preferenceMap.get(option.key) !== false;
            return <Pressable key={option.key} accessibilityRole="switch" accessibilityLabel={`Avisos de ${option.label}`} accessibilityState={{ checked: enabled, disabled: updatePreference.isPending }} disabled={updatePreference.isPending} onPress={() => togglePreference(option.key)} style={({ pressed }) => [styles.preferenceRow, { borderTopColor: colors.border }, pressed && styles.pressed, updatePreference.isPending && styles.disabled]}>
              <View style={[styles.preferenceIcon, { backgroundColor: enabled ? colors.primary + "16" : colors.background }]}><IconSymbol name={option.icon} size={19} color={enabled ? colors.primary : colors.muted} /></View>
              <View style={styles.preferenceCopy}><Text style={[styles.preferenceLabel, { color: colors.foreground }]}>{option.label}</Text><Text style={[styles.preferenceDescription, { color: colors.muted }]}>{option.description}</Text></View>
              <View style={[styles.switchTrack, { backgroundColor: enabled ? colors.success : colors.muted }]}><View style={styles.switchThumb} /><Text style={styles.switchLabel}>{enabled ? "Ativo" : "Pausado"}</Text></View>
            </Pressable>;
          })}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: colors.warning + "18" }]}><Text style={styles.themeSectionEmoji}>◐</Text></View>
            <View style={styles.sectionCopy}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Tema do aplicativo</Text><Text style={[styles.sectionHint, { color: colors.muted }]}>A escolha fica salva neste aparelho e vale para todas as telas.</Text></View>
          </View>
          <View style={styles.themeOptions}>
            {THEMES.map((theme) => {
              const active = colorScheme === theme.value;
              return <Pressable key={theme.value} accessibilityRole="radio" accessibilityLabel={`Usar tema ${theme.label}`} accessibilityState={{ selected: active }} onPress={() => setColorScheme(theme.value)} style={({ pressed }) => [styles.themeOption, { backgroundColor: colors.background, borderColor: colors.border }, active && { backgroundColor: colors.primary, borderColor: colors.primary }, pressed && styles.pressed]}>
                <Text style={styles.themeEmoji}>{theme.icon}</Text>
                <View style={styles.themeCopy}><Text style={[styles.themeLabel, { color: active ? "#FFFFFF" : colors.foreground }]}>{theme.label}</Text><Text style={[styles.themeDescription, { color: active ? "#E8F1FF" : colors.muted }]}>{theme.description}</Text></View>
                <View style={[styles.radio, { borderColor: active ? "#FFFFFF" : colors.border, backgroundColor: active ? "#FFFFFF" : "transparent" }]}>{active && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}</View>
              </Pressable>;
            })}
          </View>
        </View>

        <View style={[styles.pushInfo, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "44" }]}>
          <View style={[styles.pushInfoIcon, { backgroundColor: colors.primary }]}><IconSymbol name="bell.fill" size={18} color="#FFFFFF" /></View>
          <View style={styles.pushInfoCopy}><Text style={[styles.pushInfoTitle, { color: colors.foreground }]}>Avisos no celular</Text><Text style={[styles.pushInfoText, { color: colors.muted }]}>Depois de instalar uma versão com push, permita as notificações quando o celular solicitar. O registro do dispositivo é feito automaticamente.</Text></View>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Abrir acessibilidade" onPress={() => router.push("/accessibility")} style={({ pressed }) => [styles.accessibilityLink, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
          <View style={[styles.accessibilityIcon, { backgroundColor: colors.primary + "16" }]}><IconSymbol name="textformat.size" size={21} color={colors.primary} /></View>
          <View style={styles.accessibilityCopy}><Text style={[styles.accessibilityTitle, { color: colors.foreground }]}>Acessibilidade</Text><Text style={[styles.accessibilityHint, { color: colors.muted }]}>Tamanho do texto e alto contraste</Text></View>
          <Text style={[styles.arrow, { color: colors.primary }]}>›</Text>
        </Pressable>
      </ScrollView>
    </View></ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingBottom: 38 },
  header: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 4 },
  headerIcon: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, gap: 2 },
  eyebrow: { fontSize: 11, fontWeight: "900", letterSpacing: 1.3 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "900" },
  subtitle: { fontSize: 13, lineHeight: 19 },
  sectionCard: { borderWidth: 1.5, borderRadius: 22, padding: 15, gap: 12, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  sectionIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  sectionCopy: { flex: 1, gap: 2 },
  sectionTitle: { fontSize: 16, fontWeight: "900" },
  sectionHint: { fontSize: 12, lineHeight: 17 },
  preferenceRow: { minHeight: 64, borderTopWidth: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  preferenceIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  preferenceCopy: { flex: 1, gap: 2 },
  preferenceLabel: { fontSize: 14, fontWeight: "900" },
  preferenceDescription: { fontSize: 11, lineHeight: 15 },
  switchTrack: { minWidth: 69, height: 30, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 7, gap: 4 },
  switchThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#FFFFFF" },
  switchLabel: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  themeSectionEmoji: { color: "#D68100", fontSize: 24, fontWeight: "900" },
  themeOptions: { gap: 9 },
  themeOption: { minHeight: 70, borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  themeEmoji: { width: 30, textAlign: "center", fontSize: 22 },
  themeCopy: { flex: 1, gap: 2 },
  themeLabel: { fontSize: 15, fontWeight: "900" },
  themeDescription: { fontSize: 11, lineHeight: 15 },
  radio: { width: 22, height: 22, borderWidth: 2, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  pushInfo: { borderWidth: 1, borderRadius: 18, padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 10, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  pushInfoIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  pushInfoCopy: { flex: 1, gap: 2 },
  pushInfoTitle: { fontSize: 13, fontWeight: "900" },
  pushInfoText: { fontSize: 11, lineHeight: 16 },
  accessibilityLink: { minHeight: 66, borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  accessibilityIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  accessibilityCopy: { flex: 1, gap: 2 },
  accessibilityTitle: { fontSize: 15, fontWeight: "900" },
  accessibilityHint: { fontSize: 12 },
  arrow: { fontSize: 30, lineHeight: 31, fontWeight: "400" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.55 },
});
