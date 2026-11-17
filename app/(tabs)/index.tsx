import { useMemo } from "react";
import { getCurrentPushToken } from "@/lib/push-token";
import { router } from "expo-router";
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/pressable";
import { StatusBar } from "expo-status-bar";
import { GradientHeader } from "@/components/gradient-header";
import { LiveBadge } from "@/components/realtime-provider";
import { PrefeituraBadge } from "@/components/brand-logo";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { OfficialSocialLogo, type SocialNetwork } from "@/components/official-social-logo";
import { QueryState } from "@/components/query-state";
import { Reveal } from "@/components/ui-kit";
import { LiveDateTime } from "@/components/live-date-time";
import { clearUserInfo, removeSessionToken } from "@/lib/_core/auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { CATEGORY_LABELS, STATUS_LABELS, requestProtocol } from "@/shared/categories";

type IconName = React.ComponentProps<typeof IconSymbol>["name"];
const QUICK: { icon: IconName; title: string; hint: string; path: string }[] = [
  { icon: "wrench.and.screwdriver.fill", title: "Solicitar reparo", hint: "Luz, água, buracos, lixo", path: "/request" },
  { icon: "lightbulb.fill", title: "Enviar sugestão", hint: "Melhore o bairro", path: "/suggestions" },
  { icon: "megaphone.fill", title: "Comunicados", hint: "Avisos da cidade e do bairro", path: "/announcements" },
  { icon: "clock.fill", title: "Minha atividade", hint: "Acompanhe tudo", path: "/activity" },
];

export default function HomeScreen() {
  const colors = useColors();
  const me = trpc.auth.me.useQuery(undefined, { retry: 2, retryDelay: (a) => Math.min(1500 * 2 ** a, 5000), staleTime: 5_000 });
  const user = me.data;
  const authed = Boolean(user?.id);
  const isAdmin = user?.role === "admin";
  const approved = isAdmin || (authed && user?.residentStatus !== "blocked");
  const blocked = authed && user?.role === "user" && user?.residentStatus === "blocked";
  const profileComplete = Boolean(isAdmin || (user?.name && user.phone && user.cep && user.street && user.number && user.neighborhood && user.sex));
  const bairro = user?.neighborhood ?? null;

  const requests = trpc.requests.mine.useQuery(undefined, { enabled: authed && approved && profileComplete && !isAdmin, staleTime: 2_000, retry: 1, refetchInterval: 60_000 });
  const announcements = trpc.announcements.list.useQuery(undefined, { enabled: authed && approved && profileComplete, staleTime: 2_000, retry: 1, refetchInterval: 60_000 });
  const social = trpc.social.get.useQuery();
  const logout = trpc.auth.logout.useMutation();

  const urgent = useMemo(() => (announcements.data ?? []).filter((a) => a.category === "civil_defense" || a.category === "urgent").slice(0, 2), [announcements.data]);
  const latest = useMemo(() => (announcements.data ?? []).filter((a) => !urgent.includes(a)).slice(0, 3), [announcements.data, urgent]);
  const firstName = (user?.name ?? "").trim().split(" ")[0] || "morador";

  const go = (path: string) => {
    if (!authed) return router.push("/login");
    if (!approved) return Alert.alert("Cadastro bloqueado", "Procure a gestão do Conecta Barra para regularizar o acesso.");
    if (!profileComplete) return Alert.alert("Complete seus dados", "Preencha seu nome, telefone e endereço completo no Meu perfil antes de usar os serviços.", [{ text: "Agora não", style: "cancel" }, { text: "Abrir perfil", onPress: () => router.push("/(tabs)/profile") }]);
    router.push(path as never);
  };
  const signOut = () => Alert.alert("Sair da conta?", "Você poderá entrar novamente quando quiser.", [
    { text: "Cancelar", style: "cancel" },
    { text: "Sair", style: "destructive", onPress: () => { void (async () => { await Promise.race([logout.mutateAsync({ pushToken: getCurrentPushToken() ?? undefined }).catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 3000))]); await removeSessionToken(); await clearUserInfo(); router.replace("/login"); })(); } },
  ]);
  const refresh = () => { void me.refetch(); void requests.refetch(); void announcements.refetch(); void social.refetch(); };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={me.isRefetching} onRefresh={refresh} tintColor={colors.primary} />}>
        <GradientHeader>
          <View style={styles.topRow}>
            <PrefeituraBadge light compact />
            <LiveBadge />
          </View>
          <Text style={styles.hello}>{authed ? `Olá, ${firstName}!` : "Bem-vindo!"}</Text>
          <Text style={styles.helloSub}>{authed ? (bairro ? `Você está conectado ao bairro ${bairro}.` : isAdmin ? "Painel de gestão disponível." : "Complete seu endereço para receber avisos do bairro.") : "Entre para acompanhar sua rua e os avisos locais."}</Text>
          <LiveDateTime light style={styles.liveDateTime} />
          <View style={styles.headerActions}>
            {authed ? (
              <>
                {isAdmin && <Pressable onPress={() => router.push("/admin")} style={styles.pill}><Text style={styles.pillText}>Abrir painel de gestão</Text></Pressable>}
                <Pressable onPress={signOut} style={[styles.pill, { backgroundColor: "#FFFFFF22" }]}><Text style={[styles.pillText, { color: "#FFFFFF" }]}>Sair</Text></Pressable>
              </>
            ) : (
              <Pressable onPress={() => router.push("/login")} style={styles.pill}><Text style={styles.pillText}>Entrar ou cadastrar</Text></Pressable>
            )}
          </View>
        </GradientHeader>

        <View style={styles.body}>
          {blocked && <View style={[styles.notice, { backgroundColor: colors.error + "18", borderColor: colors.error }]}><Text style={{ color: colors.error, fontWeight: "900" }}>Cadastro bloqueado</Text><Text style={{ color: colors.foreground, fontSize: 13, marginTop: 2 }}>Procure a gestão do Conecta Barra para regularizar o acesso.</Text></View>}

          {urgent.map((item) => (
            <Pressable key={item.id} accessibilityRole="button" onPress={() => router.push("/announcements")} style={[styles.alert, { backgroundColor: colors.error + "14", borderColor: colors.error }]}>
              <IconSymbol name="exclamationmark.triangle.fill" size={26} color={colors.error} />
              <View style={{ flex: 1 }}><Text style={{ color: colors.error, fontWeight: "900", fontSize: 11, letterSpacing: 0.8 }}>{item.category === "civil_defense" ? "ALERTA DA DEFESA CIVIL" : "AVISO URGENTE"}</Text><Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 15 }} numberOfLines={2}>{item.title}</Text></View>
            </Pressable>
          ))}

          <View style={styles.grid}>
            {QUICK.map((action, index) => (
              <Reveal key={action.title} delay={index * 70} style={{ width: "47.8%" }}>
              <Pressable accessibilityRole="button" accessibilityLabel={action.title} onPress={() => go(action.path)} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}>
                <View style={[styles.cardIcon, { backgroundColor: colors.primary + "16" }]}><IconSymbol name={action.icon} size={24} color={colors.primary} /></View>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{action.title}</Text>
                <Text style={[styles.cardHint, { color: colors.muted }]}>{action.hint}</Text>
              </Pressable>
              </Reveal>
            ))}
          </View>

          {authed && approved && !isAdmin && (
            <View style={{ gap: 10 }}>
              <View style={styles.panelHead}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Minhas solicitações</Text><Pressable onPress={() => router.push("/(tabs)/requests")}><Text style={{ color: colors.primary, fontWeight: "800" }}>Ver todas</Text></Pressable></View>
              {requests.isLoading ? <QueryState colors={colors} loading compact loadingText="Carregando…" /> : (requests.data ?? []).length === 0 ? <Text style={{ color: colors.muted }}>Você ainda não fez solicitações. Toque em “Solicitar reparo”.</Text> : (requests.data ?? []).slice(0, 3).map((r) => (
                <Pressable key={r.id} onPress={() => router.push({ pathname: "/(tabs)/requests", params: { requestId: String(r.id) } })} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontWeight: "800" }}>{CATEGORY_LABELS[r.category] ?? r.category}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{requestProtocol(r.id, r.createdAt)} • {r.neighborhood ?? "sem bairro"}</Text></View>
                  <Text style={[styles.status, { color: colors.primary, backgroundColor: colors.primary + "16" }]}>{STATUS_LABELS[r.status] ?? r.status}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {authed && approved && latest.length > 0 && (
            <View style={{ gap: 10 }}>
              <View style={styles.panelHead}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Últimos comunicados</Text><Pressable onPress={() => router.push("/announcements")}><Text style={{ color: colors.primary, fontWeight: "800" }}>Ver todos</Text></Pressable></View>
              {latest.map((a) => (
                <View key={a.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: "column", alignItems: "flex-start" }]}>
                  <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900" }}>{a.neighborhood ? `BAIRRO ${a.neighborhood.toUpperCase()}` : "TODA A CIDADE"}</Text>
                  <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 15 }}>{a.title}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={2}>{a.content}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Canais oficiais locais</Text>
            <View style={styles.channels}>
              {([
                { label: "Portal", url: social.data?.website, brand: null },
                { label: "Instagram", url: social.data?.instagram, brand: "instagram" },
                { label: "Facebook", url: social.data?.facebook, brand: "facebook" },
                { label: "YouTube", url: social.data?.youtube, brand: "youtube" },
                { label: "WhatsApp", url: social.data?.whatsapp, brand: "whatsapp" },
              ] as { label: string; url?: string | null; brand: SocialNetwork | null }[]).filter((channel) => Boolean(channel.url)).map((channel) => (
                <Pressable key={channel.label} accessibilityRole="link" accessibilityLabel={`Abrir ${channel.label} oficial`} onPress={() => void Linking.openURL(channel.url!)} style={[styles.channel, { borderColor: colors.primary }]}>
                  {channel.brand ? <OfficialSocialLogo network={channel.brand} size={22} /> : <IconSymbol name="globe" size={19} color={colors.primary} />}
                  <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 13 }}>{channel.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  hello: { color: "#FFFFFF", fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  helloSub: { color: "#DDF0FF", fontSize: 14, marginTop: 4, lineHeight: 20 },
  liveDateTime: { marginTop: 8, fontSize: 12, fontWeight: "900" },
  headerActions: { flexDirection: "row", gap: 8, marginTop: 16, flexWrap: "wrap" },
  pill: { backgroundColor: "#FFFFFF", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  pillText: { color: "#062B5E", fontWeight: "900", fontSize: 13 },
  body: { padding: 18, gap: 16 },
  notice: { borderWidth: 1, borderRadius: 20, padding: 14, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  alert: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 20, padding: 14, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: { width: "100%", borderWidth: 1, borderRadius: 24, padding: 14, gap: 6, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  cardIcon: { width: 50, height: 50, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontWeight: "900" },
  cardHint: { fontSize: 12, lineHeight: 16 },
  panel: { borderWidth: 1, borderRadius: 24, padding: 16, gap: 10, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  panelHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 17, fontWeight: "900" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 18, padding: 12, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  status: { fontSize: 11, fontWeight: "900", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: "hidden" },
  channels: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  channel: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
});
