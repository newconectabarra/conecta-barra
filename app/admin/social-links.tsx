import { useEffect, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { TextInput } from "@/components/text-input";
import { Pressable } from "@/components/pressable";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/page-header";

export default function SocialLinksScreen() {
  const colors = useColors();
  const links = trpc.social.get.useQuery();
  const update = trpc.social.update.useMutation({ onSuccess: () => { void links.refetch(); Alert.alert("Links atualizados", "Os links oficiais já estão disponíveis para todos os usuários."); } });
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  useEffect(() => { if (links.data) { setInstagram(links.data.instagram ?? ""); setFacebook(links.data.facebook ?? ""); setWhatsapp(links.data.whatsapp ?? ""); } }, [links.data]);
  const save = () => { if ([instagram, facebook, whatsapp].some((value) => value && !/^https?:\/\//i.test(value))) { Alert.alert("Confira os links", "Use endereços iniciados por https://."); return; } update.mutate({ instagram, facebook, whatsapp }); };
  const field = (label: string, value: string, setter: (value: string) => void, placeholder: string) => <View style={styles.field}><Text style={[styles.label, { color: colors.foreground }]}>{label}</Text><TextInput value={value} onChangeText={setter} autoCapitalize="none" keyboardType="url" placeholder={placeholder} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} /></View>;
  return <ScreenContainer className="px-0 pt-0" edges={["left", "right", "bottom"]}><PageHeader kicker="CANAIS OFICIAIS" title="Links oficiais" subtitle="Instagram, Facebook, YouTube e WhatsApp da comunicação local." /><View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 14 }}><ScrollView contentContainerStyle={styles.content}><View style={[styles.hero, { backgroundColor: colors.primary }]}><Text style={styles.heroKicker}>COMUNICAÇÃO OFICIAL</Text><Text style={styles.heroTitle}>Mantenha a comunidade conectada.</Text><Text style={styles.heroBody}>Os links salvos aparecerão na Home para moradores e visitantes.</Text></View>{field("Instagram", instagram, setInstagram, "https://www.instagram.com/pmbpoficial/")}{field("Facebook", facebook, setFacebook, "https://www.facebook.com/pmbpoficial")}{field("Grupo do WhatsApp", whatsapp, setWhatsapp, "https://chat.whatsapp.com/...")}<Pressable disabled={update.isPending} onPress={save} style={({ pressed }) => [styles.save, { backgroundColor: colors.primary }, pressed && styles.pressed, update.isPending && styles.disabled]}><Text style={styles.saveText}>{update.isPending ? "Salvando…" : "Salvar links oficiais"}</Text></Pressable><Text style={[styles.hint, { color: colors.muted }]}>Deixe um campo vazio para ocultar esse canal da Home.</Text>{[instagram, facebook, whatsapp].filter(Boolean).map((url) => <Pressable key={url} onPress={() => void Linking.openURL(url)}><Text style={[styles.previewLink, { color: colors.primary }]}>{url}</Text></Pressable>)}</ScrollView></View></ScreenContainer>;
}
const styles = StyleSheet.create({ content: { paddingBottom: 30, gap: 14 }, hero: { borderRadius: 22, padding: 20, marginBottom: 4 }, heroKicker: { color: "#CDEBFF", fontSize: 10, fontWeight: "900", letterSpacing: 1 }, heroTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginTop: 8 }, heroBody: { color: "#E4F3FF", fontSize: 13, lineHeight: 19, marginTop: 6 }, field: { gap: 7 }, label: { fontSize: 13, fontWeight: "900" }, input: { minHeight: 52, borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, fontSize: 14 }, save: { minHeight: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 4 }, saveText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" }, hint: { fontSize: 12, lineHeight: 18 }, previewLink: { fontSize: 13, fontWeight: "800" }, pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] }, disabled: { opacity: 0.55 } });
