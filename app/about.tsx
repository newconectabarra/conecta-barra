import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/pressable";
import { router } from "expo-router";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { ScreenContainer } from "@/components/screen-container";
import { PrefeituraBadge } from "@/components/brand-logo";
import { QueryState } from "@/components/query-state";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/page-header";

const channels = [
  { key: "instagram", label: "Instagram", icon: "instagram" as const },
  { key: "facebook", label: "Facebook", icon: "facebook" as const },
  { key: "whatsapp", label: "WhatsApp", icon: "whatsapp" as const },
] as const;

export default function AboutScreen() {
  const colors = useColors();
  const social = trpc.social.get.useQuery(undefined, { staleTime: 30_000, retry: false });

  return (
    <ScreenContainer className="px-0 pt-0" edges={["left", "right", "bottom"]}>
      <PageHeader kicker="INSTITUCIONAL" title="Sobre o Conecta Barra" subtitle="Informação e participação local." />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingHorizontal: 20, paddingTop: 14 }]}>

        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <Text style={styles.eyebrow}>Conecta Barra</Text>
          <Text style={styles.heroTitle}>Informação e participação local.</Text>
          <Text style={styles.heroText}>Receba avisos, registre solicitações com CEP e acompanhe tudo em tempo real.</Text>
        </View>

        <View style={{ alignItems: "flex-start" }}><PrefeituraBadge /></View>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Canais oficiais</Text>
          <Text style={[styles.cardText, { color: colors.muted }]}>Use os canais abaixo para acompanhar notícias e falar com a gestão.</Text>
          {social.isLoading ? <QueryState colors={colors} loading compact loadingText="Carregando canais…" /> : social.error ? <QueryState colors={colors} loading={false} error={social.error} compact errorTitle="Não foi possível carregar os canais" onRetry={() => void social.refetch()} /> : channels.map((channel) => {
            const url = social.data?.[channel.key];
            if (!url) return null;
            return <Pressable key={channel.key} accessibilityRole="link" accessibilityLabel={`Abrir canal oficial ${channel.label}`} onPress={() => void Linking.openURL(url)} style={({ pressed }) => [styles.channel, { borderColor: colors.border, backgroundColor: colors.background }, pressed && styles.pressed]}><FontAwesome name={channel.icon} size={20} color={colors.primary} /><View style={styles.channelCopy}><Text style={[styles.channelLabel, { color: colors.foreground }]}>{channel.label}</Text><Text style={[styles.channelHint, { color: colors.muted }]}>Abrir canal oficial</Text></View><Text style={[styles.arrow, { color: colors.primary }]}>›</Text></Pressable>;
          })}
          {!social.isLoading && !social.error && !channels.some((channel) => Boolean(social.data?.[channel.key])) && <Text style={[styles.emptyText, { color: colors.muted }]}>Os canais oficiais serão publicados aqui quando configurados pela gestão.</Text>}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Privacidade e segurança</Text>
          <Text style={[styles.cardText, { color: colors.muted }]}>As informações do cadastro são usadas para autenticar o acesso, organizar solicitações, direcionar avisos do bairro e permitir que a gestão responda aos moradores, sempre no limite dessas finalidades.</Text>
          <Text style={[styles.cardText, { color: colors.muted }]}>Você pode solicitar confirmação, correção, informação sobre o uso e exclusão dos seus dados pelos canais oficiais de atendimento local. A exclusão pode ficar limitada quando houver obrigação legal ou necessidade de preservar registros de segurança.</Text>
          <Text style={[styles.cardText, { color: colors.muted }]}>O Conecta Barra usa HTTPS/WSS em trânsito, banco e armazenamento gerenciados com proteção em repouso e SecureStore no aparelho para tokens. Não compartilhe sua senha. Para exercer seus direitos ou falar sobre privacidade, procure a gestão pelos canais oficiais exibidos nesta tela.</Text>
        </View>

        <Text style={[styles.version, { color: colors.muted }]}>Conecta Barra • Informação e participação local</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 36, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  backButton: { minHeight: 44, borderWidth: 1.5, borderRadius: 15, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  backText: { fontSize: 14, fontWeight: "900" },
  title: { flex: 1, fontSize: 20, fontWeight: "900", textAlign: "center" },
  headerSpacer: { width: 72 },
  hero: { borderRadius: 25, padding: 20, gap: 7 },
  eyebrow: { color: "#D8F1FF", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  heroTitle: { color: "#FFFFFF", fontSize: 25, lineHeight: 31, fontWeight: "900" },
  heroText: { color: "#D8F1FF", fontSize: 14, lineHeight: 20 },
  card: { borderWidth: 1, borderRadius: 24, padding: 17, gap: 9, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  creditCard: { borderWidth: 1.5, borderRadius: 24, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  creditBadge: { minWidth: 68, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  creditBadgeText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900", letterSpacing: 0.3 },
  creditCopy: { flex: 1, gap: 3 },
  creditTitle: { fontSize: 14, fontWeight: "900" },
  creditText: { fontSize: 12, lineHeight: 17 },
  cardTitle: { fontSize: 17, fontWeight: "900" },
  cardText: { fontSize: 13, lineHeight: 19 },
  channel: { minHeight: 58, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  channelCopy: { flex: 1, gap: 2 },
  channelLabel: { fontSize: 14, fontWeight: "900" },
  channelHint: { fontSize: 11 },
  arrow: { fontSize: 27, lineHeight: 30 },
  emptyText: { fontSize: 13, lineHeight: 19 },
  version: { textAlign: "center", fontSize: 11, marginTop: 3 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
});
