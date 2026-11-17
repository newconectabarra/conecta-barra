import { Image, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Reveal } from "@/components/ui-kit";
import { Pressable } from "@/components/pressable";
import { StatusBar } from "expo-status-bar";
import { GradientHeader } from "@/components/gradient-header";
import { PrefeituraBadge } from "@/components/brand-logo";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { OfficialSocialLogo, type SocialNetwork } from "@/components/official-social-logo";
import { QueryState } from "@/components/query-state";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { EMERGENCY_NUMBERS, OFFICIAL_CONTACT, PORTAL_BASE, PORTAL_SERVICES } from "@/shared/official";

const open = (url: string) => void Linking.openURL(url);

type SocialChannel = {
  label: string;
  url?: string | null;
  color: string;
  icon?: "globe" | "phone.fill";
  brand?: SocialNetwork;
};

/** Integração com portais públicos e fontes locais. */
export default function PortalScreen() {
  const colors = useColors();
  const news = trpc.portal.news.useQuery(undefined, { staleTime: 60_000, refetchInterval: 5 * 60_000, refetchIntervalInBackground: false, retry: 1 });
  const social = trpc.social.get.useQuery();
  const channels: SocialChannel[] = [
    { label: "Portal oficial", url: social.data?.website, color: "#0B5FD8", icon: "globe" as const },
    { label: "Instagram", url: social.data?.instagram, color: "#E1306C", brand: "instagram" as const },
    { label: "Facebook", url: social.data?.facebook, color: "#1877F2", brand: "facebook" as const },
    { label: "YouTube", url: social.data?.youtube, color: "#FF0000", brand: "youtube" as const },
    { label: "WhatsApp", url: social.data?.whatsapp, color: "#25D366", brand: "whatsapp" as const },
  ].filter((c) => Boolean(c.url));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={news.isRefetching} onRefresh={() => void news.refetch()} tintColor={colors.primary} />}>
        <GradientHeader minHeight={130}>
          <PrefeituraBadge light />
          <Text style={styles.title}>Portal local em um toque</Text>
          <Text style={styles.sub}>Notícias, serviços e canais oficiais de Barra do Piraí.</Text>
        </GradientHeader>

        <View style={styles.body}>
          <View style={[styles.emergency, { backgroundColor: colors.error + "12", borderColor: colors.error }]}>
            <Text style={{ color: colors.error, fontWeight: "900", fontSize: 12, letterSpacing: 0.8 }}>EMERGÊNCIAS</Text>
            <View style={styles.emergencyRow}>
              {EMERGENCY_NUMBERS.map((e) => (
                <Pressable key={e.label} accessibilityRole="button" accessibilityLabel={`Ligar para ${e.label} ${e.number}`} onPress={() => open(`tel:${e.number}`)} style={[styles.emergencyBtn, { backgroundColor: colors.surface, borderColor: colors.error }]}>
                  <Text style={{ color: colors.error, fontSize: 20, fontWeight: "900" }}>{e.number}</Text>
                  <Text style={{ color: colors.foreground, fontSize: 11, fontWeight: "800" }}>{e.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Text style={[styles.section, { color: colors.foreground }]}>Serviços do portal</Text>
          <View style={styles.grid}>
            {PORTAL_SERVICES.map((s, index) => (
              <Reveal key={s.key} delay={index * 50} style={{ width: "48%" }}>
              <Pressable accessibilityRole="link" accessibilityLabel={s.title} onPress={() => open(s.url)} style={({ pressed }) => [styles.service, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.8 }]}>
                <View style={[styles.serviceIcon, { backgroundColor: colors.primary + "16" }]}><IconSymbol name={s.icon as never} size={22} color={colors.primary} /></View>
                <Text style={[styles.serviceTitle, { color: colors.foreground }]}>{s.title}</Text>
                <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 15 }}>{s.subtitle}</Text>
              </Pressable>
              </Reveal>
            ))}
          </View>

          <View style={styles.sectionRow}>
            <Text style={[styles.section, { color: colors.foreground }]}>Notícias locais</Text>
            <Pressable onPress={() => open(`${PORTAL_BASE}/todas-as-noticias`)}><Text style={{ color: colors.primary, fontWeight: "800" }}>Ver todas</Text></Pressable>
          </View>
          {news.isLoading ? <QueryState colors={colors} loading compact loadingText="Buscando notícias no portal…" /> : (news.data ?? []).length === 0 ? (
            <Pressable onPress={() => open(`${PORTAL_BASE}/todas-as-noticias`)} style={[styles.newsEmpty, { borderColor: colors.primary }]}><Text style={{ color: colors.primary, fontWeight: "900" }}>Abrir notícias no portal oficial</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>Não foi possível carregar a lista agora.</Text></Pressable>
          ) : (news.data ?? []).map((item) => (
            <Pressable key={item.id} accessibilityRole="link" onPress={() => open(item.url)} style={({ pressed }) => [styles.news, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.85 }]}>
              {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.newsImg} resizeMode="cover" /> : null}
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.foreground, fontWeight: "900", fontSize: 15, lineHeight: 20 }} numberOfLines={3}>{item.title}</Text>
                {item.publishedLabel ? <Text style={{ color: colors.muted, fontSize: 11 }}>Publicado em {item.publishedLabel}</Text> : null}
              </View>
            </Pressable>
          ))}

          <Text style={[styles.section, { color: colors.foreground }]}>Canais oficiais</Text>
          <View style={styles.channels}>
            {channels.map((c) => (
              <Pressable key={c.label} accessibilityRole="link" accessibilityLabel={`Abrir ${c.label} oficial`} onPress={() => open(c.url!)} style={[styles.channel, { backgroundColor: colors.surface, borderColor: c.color }]}>
                {c.brand ? <OfficialSocialLogo network={c.brand} size={24} /> : <IconSymbol name={c.icon ?? "globe"} size={20} color={c.color} />}
                <Text style={{ color: c.color, fontWeight: "900" }}>{c.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.contact, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.foreground, fontWeight: "900", fontSize: 15 }}>{OFFICIAL_CONTACT.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{OFFICIAL_CONTACT.address}</Text>
            <Pressable onPress={() => open(`tel:${OFFICIAL_CONTACT.phoneDial}`)}><Text style={{ color: colors.primary, fontWeight: "900" }}>📞 {OFFICIAL_CONTACT.phone}</Text></Pressable>
          </View>
          <Text style={{ color: colors.muted, fontSize: 11, textAlign: "center", lineHeight: 16 }}>Conecta Barra reúne links e conteúdos públicos do portal local. Fonte: barradopirai.rj.gov.br</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "900", marginTop: 14, letterSpacing: -0.4 },
  sub: { color: "#DDF0FF", fontSize: 14, marginTop: 4 },
  body: { padding: 18, gap: 14 },
  emergency: { borderWidth: 1, borderRadius: 24, padding: 14, gap: 10, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  emergencyRow: { flexDirection: "row", gap: 8 },
  emergencyBtn: { flex: 1, borderWidth: 1.5, borderRadius: 16, paddingVertical: 10, alignItems: "center" },
  section: { fontSize: 18, fontWeight: "900", marginTop: 4 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  service: { width: "100%", borderWidth: 1, borderRadius: 22, padding: 13, gap: 5, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  serviceIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  serviceTitle: { fontSize: 14, fontWeight: "900" },
  news: { flexDirection: "row", gap: 12, borderWidth: 1, borderRadius: 20, padding: 10, alignItems: "center", shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  newsImg: { width: 86, height: 74, borderRadius: 12, backgroundColor: "#DDF0FF" },
  newsEmpty: { borderWidth: 1.5, borderStyle: "dashed", borderRadius: 20, padding: 16, alignItems: "center", shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  channels: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  channel: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  contact: { borderWidth: 1, borderRadius: 22, padding: 16, gap: 6, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
});
