import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import * as LocalAuthentication from "expo-local-authentication";
import { ActivityIndicator, Alert, Animated, Easing, Modal, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { TextInput } from "@/components/text-input";
import { Pressable } from "@/components/pressable";
import { CachedImage } from "@/components/cached-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { getApiBaseUrl } from "@/constants/oauth";
import { router, useFocusEffect } from "expo-router";
import { PasswordField } from "@/components/password-field";
import { QueryState } from "@/components/query-state";
import { enqueueOfflineMutation } from "@/lib/offline-cache";
import { withUploadRetries } from "@/lib/resilient-upload";
import { AddressFields, emptyAddress, isAddressComplete, type AddressValue } from "@/components/address-fields";
import { AppLockCard } from "@/components/app-lock-card";
import { SelectionField } from "@/components/selection-field";

const sexLabels = { female: "Feminino", male: "Masculino", non_binary: "Não binário", prefer_not_to_say: "Prefiro não informar" } as const;
const normalizeAvatarUrl = (url: string | null | undefined) => url ? (url.startsWith("http") ? url : `${getApiBaseUrl()}${url}`) : null;
type Sex = keyof typeof sexLabels;

type RemoteNotice = { id: number; type?: string; data?: Record<string, unknown>; readAt?: Date | string | null };
function localNotificationKey(kind: "hidden", userId: number) {
  return `conecta:notifications:${kind}:${userId}`;
}

async function loadLocalNotificationKeys(kind: "hidden", userId: number) {
  try {
    const raw = await AsyncStorage.getItem(localNotificationKey(kind, userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set<string>(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const userId = me.data?.id ?? 0;
  const isAdmin = me.data?.role === "admin";
  const notificationQuery = trpc.notifications.list.useQuery(undefined, { enabled: userId > 0, refetchInterval: 30_000, refetchIntervalInBackground: false, staleTime: 2_000, retry: false });
  const announcementsQuery = trpc.announcements.list.useQuery(undefined, { enabled: userId > 0, refetchInterval: 30_000, refetchIntervalInBackground: false, staleTime: 2_000, retry: false });
  const requestsQuery = trpc.requests.all.useQuery(undefined, { enabled: isAdmin, refetchInterval: 30_000, refetchIntervalInBackground: false, staleTime: 2_000, retry: false });
  const [localHiddenKeys, setLocalHiddenKeys] = useState<Set<string>>(new Set());
  const refetchNotifications = notificationQuery.refetch;
  const refetchAnnouncements = announcementsQuery.refetch;
  const refetchRequests = requestsQuery.refetch;

  const refreshNotificationState = useCallback(async () => {
    if (!userId) return;
    const hidden = await loadLocalNotificationKeys("hidden", userId);
    setLocalHiddenKeys(hidden);
    void refetchNotifications();
    void refetchAnnouncements();
    if (isAdmin) void refetchRequests();
  }, [isAdmin, refetchAnnouncements, refetchNotifications, refetchRequests, userId]);

  useFocusEffect(useCallback(() => {
    void refreshNotificationState();
  }, [refreshNotificationState]));

  const remoteNotices = (notificationQuery.data ?? []) as unknown as RemoteNotice[];
  // The notification center is the authoritative source for the badge. Do not
  // add announcements/requests again: those lists are content, not notices,
  // and previously produced phantom counts (e.g. 56 unread items with no rows).
  const unreadNotificationCount = remoteNotices.filter((item) => !item.readAt && !localHiddenKeys.has(`server:${item.id}`) && !localHiddenKeys.has(String(item.id))).length;
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [addr, setAddr] = useState<AddressValue>(emptyAddress);
  const [phone, setPhone] = useState("");
  const [sex, setSex] = useState<Sex>("prefer_not_to_say");
  const [email, setEmail] = useState("");
  const [avatarOverride, setAvatarOverride] = useState<string | null | undefined>(undefined);
  const [emergencyContact, setEmergencyContact] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [confirmationId, setConfirmationId] = useState<number | null>(null);
  const [temporaryCode, setTemporaryCode] = useState<string | null>(null);
  const [typedTemporaryCode, setTypedTemporaryCode] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const passwordRotation = useRef(new Animated.Value(0)).current;
  const passwordSuccessOpacity = useRef(new Animated.Value(0)).current;
  const passwordSuccessScale = useRef(new Animated.Value(0.96)).current;
  const updateAvatar = trpc.auth.updateAvatar.useMutation({ onSuccess: (result) => { setAvatarOverride(normalizeAvatarUrl(result.avatarUrl)); setFeedback("Foto de perfil atualizada com sucesso."); void me.refetch(); } });
  const remove = trpc.auth.removeAvatar.useMutation({ onSuccess: () => { setAvatarOverride(null); setFeedback("Foto removida. Avatar padrão restaurado."); void me.refetch(); } });
  const updateProfile = trpc.auth.updateProfile.useMutation({ retry: 0, onSuccess: () => { setEditing(false); setFeedback("Perfil atualizado com sucesso."); void me.refetch(); }, onError: (e) => { const rawMessage = e instanceof Error ? e.message : String(e); const message = /aborted|abort|timeout|network|network request failed/i.test(rawMessage) ? "A conexão demorou mais que o esperado. Seus dados não foram perdidos. Verifique a rede e tente novamente." : rawMessage || "Verifique a conexão e tente novamente."; Alert.alert("Não foi possível atualizar", message); } });
  const requestPasswordConfirmation = trpc.auth.requestPasswordChangeConfirmation.useMutation();
  const confirmPasswordChange = trpc.auth.confirmPasswordChange.useMutation();
  const changePassword = trpc.auth.changePassword.useMutation({ onSuccess: () => { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setConfirmationId(null); setTemporaryCode(null); setTypedTemporaryCode(""); setFeedback("Senha alterada com sucesso."); } });
  useEffect(() => { if (!changePassword.isPending) return; passwordRotation.setValue(0); const loop = Animated.loop(Animated.timing(passwordRotation, { toValue: 1, duration: 850, easing: Easing.linear, useNativeDriver: true })); loop.start(); return () => loop.stop(); }, [changePassword.isPending, passwordRotation]);
  useEffect(() => { if (!changePassword.isSuccess) return; setPasswordSuccess(true); passwordSuccessOpacity.setValue(0); passwordSuccessScale.setValue(0.96); Animated.parallel([Animated.timing(passwordSuccessOpacity, { toValue: 1, duration: 220, useNativeDriver: true }), Animated.timing(passwordSuccessScale, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true })]).start(); const timeout = setTimeout(() => setPasswordSuccess(false), 4500); return () => clearTimeout(timeout); }, [changePassword.isSuccess, passwordSuccessOpacity, passwordSuccessScale]);
  const user = me.data;
  useEffect(() => { if (!user) return; setName(user.name ?? ""); setAddr({ cep: user.cep ?? "", street: user.street ?? "", number: user.number ?? "", complement: user.complement ?? "", neighborhood: user.neighborhood ?? "" }); setPhone(user.phone ?? ""); setSex((user.sex ?? "prefer_not_to_say") as Sex); setEmail(user.email ?? ""); setEmergencyContact(user.emergencyContact ?? ""); }, [user]);
  const storedAvatar = normalizeAvatarUrl(user?.avatarUrl);
  const avatar = avatarOverride !== undefined ? avatarOverride : storedAvatar;
  const avatarBusy = updateAvatar.isPending || remove.isPending;
  const profileBusy = updateProfile.isPending;
  const passwordBusy = changePassword.isPending || requestPasswordConfirmation.isPending || confirmPasswordChange.isPending;
  const refreshProfileAfterLateResponse = async () => {
    try {
      const refreshed = await me.refetch();
      return refreshed.data ?? null;
    } catch {
      return null;
    }
  };
  const choosePhoto = async () => {
    if (avatarBusy) return;
    if (!user?.id) { router.replace("/login"); return; }
    if (user.role !== "admin" && user.residentStatus === "blocked") { Alert.alert("Cadastro bloqueado", "Procure a gestão do Conecta Barra para regularizar o acesso."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled || !result.assets[0]?.uri) return;
    try {
      const asset = result.assets[0];
      const prepared = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: 720 } }], { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG });
      const base64 = await FileSystem.readAsStringAsync(prepared.uri, { encoding: FileSystem.EncodingType.Base64 });
      await withUploadRetries(() => updateAvatar.mutateAsync({ photoDataBase64: base64, photoContentType: "image/jpeg" }));
    } catch (error) {
      updateAvatar.reset();
      const refreshed = await refreshProfileAfterLateResponse();
      if (refreshed?.avatarUrl) {
        setAvatarOverride(normalizeAvatarUrl(refreshed.avatarUrl));
        setFeedback("Foto de perfil atualizada com sucesso.");
        return;
      }
      Alert.alert("Não foi possível atualizar a foto", error instanceof Error ? error.message : "Verifique a conexão e tente novamente.");
    }
  };
  const saveProfile = () => {
    if (profileBusy) return;
    if (name.trim().length < 3 || !isAddressComplete(addr) || phone.trim().length < 8) return Alert.alert("Complete seus dados", "Nome, telefone e endereço completo (CEP, rua, número e bairro) são obrigatórios.");
    const payload = { name: name.trim(), cep: addr.cep, street: addr.street.trim(), number: addr.number.trim(), neighborhood: addr.neighborhood, complement: addr.complement.trim() || undefined, phone: phone.trim(), sex, email: email.trim(), emergencyContact: emergencyContact.trim() || undefined };
    void (async () => {
      try {
        await updateProfile.mutateAsync(payload);
      } catch (error) {
        updateProfile.reset();
        const refreshed = await refreshProfileAfterLateResponse();
        const rawMessage = error instanceof Error ? error.message : "";
        if (/network|conexão|conexao|timeout|demorou|fetch|servidor/i.test(rawMessage)) {
          await enqueueOfflineMutation("auth.updateProfile", payload);
          setEditing(false);
          setFeedback("Alterações salvas neste aparelho e serão sincronizadas quando a internet voltar.");
          return;
        }
        if (refreshed && refreshed.name === name.trim() && refreshed.cep === addr.cep.trim() && refreshed.street === addr.street.trim() && refreshed.number === addr.number.trim() && refreshed.neighborhood === addr.neighborhood && refreshed.phone === phone.trim() && refreshed.sex === sex) {
          setEditing(false);
          setFeedback("Perfil atualizado com sucesso.");
          return;
        }
        Alert.alert("Não foi possível atualizar", error instanceof Error ? error.message : "Verifique a conexão e tente novamente.");
      }
    })();
  };
  const removePhoto = () => Alert.alert("Remover foto?", "O avatar padrão será restaurado.", [{ text: "Cancelar", style: "cancel" }, { text: "Remover", style: "destructive", onPress: () => { const previousAvatar = avatar; setAvatarOverride(null); void (async () => { try { await remove.mutateAsync(); setFeedback("Foto removida. Avatar padrão restaurado."); } catch (error) { remove.reset(); const refreshed = await refreshProfileAfterLateResponse(); if (refreshed && !refreshed.avatarUrl) { setAvatarOverride(null); setFeedback("Foto removida. Avatar padrão restaurado."); return; } setAvatarOverride(previousAvatar); Alert.alert("Não foi possível remover a foto", error instanceof Error ? error.message : "Verifique a conexão e tente novamente."); } })(); } }]);
  const savePassword = () => {
    if (currentPassword.length < 1 || newPassword.length < 8) return Alert.alert("Revise a senha", "Informe a senha atual e uma nova senha com pelo menos 8 caracteres.");
    if (newPassword !== confirmPassword) return Alert.alert("Senhas diferentes", "A confirmação precisa ser igual à nova senha.");
    void (async () => {
      try {
        let challenge = await requestPasswordConfirmation.mutateAsync({ method: Platform.OS === "web" ? "code" : "biometric" });
        if (challenge.method === "biometric") {
          const hasHardware = await LocalAuthentication.hasHardwareAsync();
          const isEnrolled = hasHardware && await LocalAuthentication.isEnrolledAsync();
          if (!hasHardware || !isEnrolled) {
            setFeedback("Biometria indisponível neste aparelho. Use o código temporário.");
            challenge = await requestPasswordConfirmation.mutateAsync({ method: "code" });
          } else {
            const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Confirme a troca de senha do Conecta Barra", promptSubtitle: "Use sua biometria para autorizar esta alteração", cancelLabel: "Cancelar", requireConfirmation: true });
            if (!result.success) { setFeedback("Biometria cancelada. Você pode confirmar com um código temporário."); challenge = await requestPasswordConfirmation.mutateAsync({ method: "code" }); }
            else if (!challenge.proof) throw new Error("Não foi possível preparar a confirmação biométrica.");
          }
        }
        if (challenge.method === "code") { setConfirmationId(challenge.challengeId); setTemporaryCode(challenge.code ?? null); setTypedTemporaryCode(""); setConfirmationVisible(true); return; }
        if (!challenge.proof) throw new Error("Confirmação biométrica indisponível.");
        await confirmPasswordChange.mutateAsync({ challengeId: challenge.challengeId, proof: challenge.proof });
        await changePassword.mutateAsync({ currentPassword, newPassword, confirmationId: challenge.challengeId });
      } catch (error) {
        requestPasswordConfirmation.reset(); confirmPasswordChange.reset(); changePassword.reset();
        const message = error instanceof Error && error.message.includes("demorou") ? "A conexão demorou mais que o esperado. Tente novamente em uma rede estável." : error instanceof Error ? error.message : "Verifique a senha atual e tente novamente.";
        Alert.alert("Não foi possível confirmar a troca", message);
      }
    })();
  };
  const confirmTemporaryCode = () => {
    if (!confirmationId || !temporaryCode || typedTemporaryCode.trim() !== temporaryCode) return Alert.alert("Código incorreto", "Digite o código temporário exatamente como exibido.");
    void (async () => { try { await confirmPasswordChange.mutateAsync({ challengeId: confirmationId, proof: typedTemporaryCode.trim() }); await changePassword.mutateAsync({ currentPassword, newPassword, confirmationId }); setConfirmationVisible(false); } catch (error) { confirmPasswordChange.reset(); changePassword.reset(); Alert.alert("Não foi possível confirmar", error instanceof Error ? error.message : "Código inválido ou expirado."); } })();
  };
  if (me.isLoading) return <ScreenContainer className="px-5 pt-5"><QueryState colors={colors} loading loadingText="Carregando seus dados…" /></ScreenContainer>;
  if (me.error) return <ScreenContainer className="px-5 pt-5"><QueryState colors={colors} loading={false} error={me.error} errorTitle="Não foi possível carregar seu perfil" onRetry={() => void me.refetch()} /></ScreenContainer>;
  if (!user) return <ScreenContainer className="px-5 pt-5"><QueryState colors={colors} loading={false} empty emptyTitle="Sessão não identificada" emptyText="Entre novamente para consultar e editar seus dados." onRetry={() => router.replace("/login")} retryLabel="Voltar ao login" /></ScreenContainer>;

  return <ScreenContainer className="px-5 pt-5"><ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 220, 260) }]}>
    <Text style={[styles.eyebrow, { color: colors.primary }]}>MEU PERFIL</Text>
    <View style={styles.titleRow}>
      <View style={[styles.titleCopy, styles.titleBanner, { backgroundColor: "#EAF4FF", borderColor: colors.primary }]}><Text style={[styles.title, { color: "#000000" }]}>{isAdmin ? "Dados do administrador" : "Dados do morador"}</Text><Text style={[styles.subtitle, { color: "#1F2937" }]}>{isAdmin ? "Administre o Conecta Barra e acompanhe a cidade." : "Atualize seus dados e mantenha seu cadastro completo."}</Text><View style={styles.roleRow}>{user?.role === "admin" ? <Text style={[styles.roleChip, { backgroundColor: colors.primary + "18", color: colors.primary }]}>Administrador</Text> : <Text style={[styles.roleChip, { backgroundColor: (user?.residentStatus === "blocked" ? colors.error : colors.success) + "18", color: user?.residentStatus === "blocked" ? colors.error : colors.success }]}>{user?.residentStatus === "blocked" ? "Morador bloqueado" : "Morador ativo"}</Text>}</View></View>
      <View style={styles.titleActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Abrir avisos${unreadNotificationCount ? `, ${unreadNotificationCount} não lidas` : ""}`} onPress={() => router.push("/notifications")} style={({ pressed }) => [styles.notificationButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
          <IconSymbol name="bell.fill" size={21} color={colors.primary} />
          {unreadNotificationCount > 0 && <View style={[styles.notificationBadge, { backgroundColor: colors.error }]}><Text style={styles.notificationBadgeText}>{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</Text></View>}
        </Pressable>
        <Pressable onPress={() => setEditing((value) => !value)} style={({ pressed }) => [styles.editButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={styles.editButtonText}>{editing ? "Cancelar" : "Editar"}</Text></Pressable>
      </View>
        </View>
    <Text style={[styles.sectionHeading, { color: colors.primary }]}>ACESSO E PREFERÊNCIAS</Text>
    <AppLockCard />
    <Pressable accessibilityRole="button" accessibilityLabel="Abrir Configuração" onPress={() => router.push("/configuration")} style={({ pressed }) => [styles.configurationShortcut, { backgroundColor: colors.surface, borderColor: colors.primary }, pressed && styles.pressed]}>
      <View style={[styles.configurationShortcutIcon, { backgroundColor: colors.primary + "16" }]}><IconSymbol name="gearshape.fill" size={22} color={colors.primary} /></View>
      <View style={styles.configurationShortcutCopy}><Text style={[styles.configurationShortcutTitle, { color: colors.foreground }]}>Configuração</Text><Text style={[styles.configurationShortcutHint, { color: colors.muted }]}>Preferências de avisos, tema e acessibilidade</Text></View>
      <Text style={[styles.configurationShortcutArrow, { color: colors.primary }]}>›</Text>
    </Pressable>
    <Text style={[styles.sectionHeading, { color: colors.primary }]}>DADOS PESSOAIS</Text>
    <View style={[styles.avatarCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
<Pressable accessibilityRole="button" accessibilityLabel={avatar ? "Alterar foto de perfil" : "Adicionar foto de perfil"} accessibilityHint="Abre a galeria de imagens" onPress={() => void choosePhoto()} disabled={avatarBusy} style={({ pressed }) => [styles.avatarWrap, pressed && { opacity: 0.75 }]}>
<CachedImage source={avatar ? { uri: avatar } : require("@/assets/images/icon.png")} fallbackSource={require("@/assets/images/icon.png")} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" transition={180} onError={() => { if (avatar) { setAvatarOverride(null); setFeedback("Não foi possível carregar a foto. O avatar padrão foi exibido."); } }} /><View style={[styles.cameraBadge, { backgroundColor: colors.primary }]}>{avatarBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.cameraText}>＋</Text>}</View></Pressable><View style={styles.avatarCopy}><Text style={[styles.name, { color: colors.foreground }]}>{user?.name || "Morador"}</Text><Text style={[styles.hint, { color: colors.muted }]}>Toque na foto para carregar uma imagem</Text>{avatar && <Pressable onPress={removePhoto} disabled={avatarBusy}><Text style={[styles.remove, { color: colors.error }]}>Remover foto</Text></Pressable>}</View></View>
    {feedback && <View style={[styles.feedback, { borderColor: colors.success, backgroundColor: colors.success + "18" }]}><Text style={{ color: colors.success, fontWeight: "800" }}>{feedback}</Text></View>}
    {editing ? <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>{([{ label: "Nome completo", value: name, setter: setName, keyboardType: "default" }, { label: "Telefone", value: phone, setter: setPhone, keyboardType: "phone-pad" }, { label: "E-mail", value: email, setter: setEmail, keyboardType: "email-address" }, { label: "Contato de emergência", value: emergencyContact, setter: setEmergencyContact, keyboardType: "phone-pad" }] as const).map((field) => <View key={field.label} style={styles.field}><Text style={[styles.label, { color: colors.muted }]}>{field.label}</Text><TextInput accessibilityLabel={field.label} value={field.value} onChangeText={field.setter} keyboardType={field.keyboardType} placeholder={`Informe ${field.label.toLowerCase()}`}
     placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} /></View>)}<AddressFields value={addr} onChange={setAddr} /><Text style={[styles.label, { color: colors.muted }]}>Sexo</Text><SelectionField value={sex} options={(Object.entries(sexLabels) as [Sex, string][]).map(([value, label]) => ({ value, label }))} onChange={setSex} title="Selecione o sexo" placeholder="Escolha uma opção" accessibilityLabel="Selecionar sexo" /></View> : <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>{[["Usuário", user?.username], ["Endereço", user?.address], ["Bairro", user?.neighborhood], ["Complemento", user?.complement], ["Telefone", user?.phone], ["E-mail", user?.email], ["Sexo", user?.sex ? sexLabels[user.sex as Sex] : undefined], ["Contato de emergência", user?.emergencyContact]].map(([label, value]) => <View key={label as string} style={styles.row}><Text style={[styles.label, { color: colors.muted }]}>{label}</Text><Text style={[styles.value, { color: colors.foreground }]}>{value || "Não informado"}</Text></View>)}</View>}
    <Text style={[styles.sectionHeading, { color: colors.primary }]}>ATIVIDADE E SEGURANÇA</Text>
    {user?.role !== "admin" && <Pressable accessibilityRole="button" accessibilityLabel="Abrir minha atividade" onPress={() => router.push("/activity")} style={({ pressed }) => [styles.activityCard, { backgroundColor: colors.surface, borderColor: colors.primary }, pressed && styles.pressed]}><View style={[styles.activityIcon, { backgroundColor: colors.primary + "18" }]}><IconSymbol name="clock.fill" size={24} color={colors.primary} /></View><View style={styles.activityCopy}><Text style={[styles.activityTitle, { color: colors.foreground }]}>Minha atividade</Text><Text style={[styles.activityHint, { color: colors.muted }]}>Acompanhe solicitações, status e comunicados em um só lugar.</Text></View><Text style={[styles.activityArrow, { color: colors.primary }]}>›</Text></Pressable>}
    {<View style={[styles.passwordCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.passwordTitle, { color: colors.foreground }]}>Segurança da conta</Text><Text style={[styles.passwordHint, { color: colors.muted }]}>{user?.role === "admin" ? "Altere aqui a senha da gestão. A nova senha passa a valer no lugar da definida no servidor (ADMIN_PASSWORD). O app pedirá biometria ou um código temporário." : "Atualize sua senha de acesso sem sair do aplicativo. O Conecta Barra solicitará biometria ou um código temporário de uso único."}</Text><PasswordField value={currentPassword} onChangeText={setCurrentPassword} placeholder="Senha atual" colors={colors} showStrength={false} /><PasswordField value={newPassword} onChangeText={setNewPassword} placeholder="Nova senha (mínimo de 8 caracteres)" colors={colors} /><PasswordField value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirme a nova senha" colors={colors} showStrength={false} /><Pressable onPress={savePassword} disabled={passwordBusy} style={({ pressed }) => [styles.passwordButton, { backgroundColor: colors.foreground }, pressed && styles.pressed, passwordBusy && styles.disabled]}>{changePassword.isPending ? <View style={styles.loadingRow}><Animated.View style={[styles.passwordSpinner, { transform: [{ rotate: passwordRotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }]} /><Text style={styles.passwordButtonText}>Atualizando senha…</Text></View> : <Text style={styles.passwordButtonText}>Alterar senha</Text>}</Pressable>{passwordSuccess && <Animated.View style={[styles.passwordSuccess, { backgroundColor: colors.success + "18", borderColor: colors.success, opacity: passwordSuccessOpacity, transform: [{ scale: passwordSuccessScale }] }]}><Text style={[styles.passwordSuccessIcon, { color: colors.success }]}>✓</Text><View style={styles.passwordSuccessCopy}><Text style={[styles.passwordSuccessTitle, { color: colors.success }]}>Senha alterada com sucesso</Text><Text style={[styles.passwordSuccessText, { color: colors.foreground }]}>Sua próxima entrada já usará a nova senha.</Text></View></Animated.View>}</View>}
  </ScrollView>
  <Modal visible={confirmationVisible} transparent animationType="fade" onRequestClose={() => setConfirmationVisible(false)}>
    <View style={styles.confirmBackdrop}><View style={[styles.confirmCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.passwordTitle, { color: colors.foreground }]}>Confirmação adicional</Text><Text style={[styles.passwordHint, { color: colors.muted }]}>Digite o código temporário exibido abaixo. Ele expira em 10 minutos e só pode ser usado uma vez.</Text><Text accessibilityLabel="Código temporário" style={[styles.temporaryCode, { color: colors.primary }]}>{temporaryCode ?? "------"}</Text><TextInput accessibilityLabel="Digite o código temporário" value={typedTemporaryCode} onChangeText={setTypedTemporaryCode} keyboardType="number-pad" maxLength={6} placeholder="Código de 6 dígitos" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} /><View style={styles.confirmActions}><Pressable accessibilityRole="button" onPress={() => setConfirmationVisible(false)} style={[styles.confirmButton, { borderColor: colors.border }]}><Text style={[styles.confirmButtonText, { color: colors.foreground }]}>Cancelar</Text></Pressable><Pressable accessibilityRole="button" onPress={confirmTemporaryCode} disabled={passwordBusy} style={[styles.confirmButton, { backgroundColor: colors.primary, borderColor: colors.primary }, passwordBusy && styles.disabled]}><Text style={styles.confirmButtonTextLight}>{passwordBusy ? "Confirmando…" : "Confirmar troca"}</Text></Pressable></View></View></View>
  </Modal>
  {editing && <View style={[styles.stickySaveWrap, { bottom: Math.max(insets.bottom + 82, 94), backgroundColor: colors.background + "F2" }]}><Pressable accessibilityRole="button" accessibilityLabel="Salvar alterações do perfil" onPress={saveProfile} disabled={profileBusy} style={({ pressed }) => [styles.saveButton,
 { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={styles.saveText}>{updateProfile.isPending ? "Salvando…" : "Salvar alterações"}</Text></Pressable></View>}
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  sectionHeading: { fontSize: 11, fontWeight: "900", letterSpacing: 1.2, marginTop: 8 },
  eyebrow: { fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  titleCopy: { flex: 1, minWidth: 0 },
  titleBanner: { borderWidth: 1, borderRadius: 20, padding: 14, shadowColor: "#0B5FD8", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  titleActions: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: "900", letterSpacing: -0.7 },
  subtitle: { fontSize: 15, lineHeight: 21, marginTop: 6 },
  roleRow: { flexDirection: "row", marginTop: 10 },
  roleChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, fontSize: 12, fontWeight: "900" },
  notificationButton: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center", shadowColor: "#062B5E", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  notificationBadge: { position: "absolute", top: -5, right: -2, minWidth: 21, height: 21, paddingHorizontal: 5, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF", shadowColor: "#111827", shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  notificationBadgeText: { color: "#FFFFFF", fontSize: 10, lineHeight: 12, fontWeight: "900" },
  editButton: { paddingHorizontal: 15, paddingVertical: 12, borderRadius: 999, shadowColor: "#062B5E", shadowOpacity: 0.24, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  editButtonText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  themeCard: { borderWidth: 1.5, borderRadius: 22, padding: 16, gap: 12, shadowColor: "#062B5E", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  themeHeader: { gap: 4 },
  themeTitle: { fontSize: 18, lineHeight: 24, fontWeight: "900" },
  themeHint: { fontSize: 13, lineHeight: 19 },
  themeChoices: { flexDirection: "row", gap: 8, borderWidth: 1, borderRadius: 18, padding: 4, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  themeChoice: { flex: 1, minHeight: 50, borderWidth: 1.5, borderColor: "transparent", borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 8 },
  themeChoiceIcon: { fontSize: 20, fontWeight: "900" },
  themeChoiceText: { fontSize: 15, fontWeight: "900" },
  themeChoiceCheck: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  configurationShortcut: { minHeight: 68, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 11 },
  configurationShortcutIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  configurationShortcutCopy: { flex: 1, gap: 2 },
  configurationShortcutTitle: { fontSize: 15, fontWeight: "900" },
  configurationShortcutHint: { fontSize: 12, lineHeight: 17 },
  configurationShortcutArrow: { fontSize: 29, lineHeight: 31, fontWeight: "400" },
  avatarCard: { borderWidth: 1, borderRadius: 26, padding: 20, flexDirection: "row", alignItems: "center", gap: 17, shadowColor: "#062B5E", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  avatarWrap: { position: "relative" },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  cameraBadge: { position: "absolute", right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  cameraText: { color: "#fff", fontSize: 19, fontWeight: "900" },
  avatarCopy: { flex: 1, gap: 5 },
  name: { fontSize: 19, fontWeight: "900" },
  hint: { fontSize: 13, lineHeight: 18 },
  remove: { fontSize: 13, fontWeight: "800", marginTop: 4 },
  feedback: { borderWidth: 1, borderRadius: 14, padding: 12 },
  formCard: { borderWidth: 1, borderRadius: 26, padding: 18, gap: 12, shadowColor: "#062B5E", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  field: { gap: 5 },
  label: { fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  input: { minHeight: 54, borderWidth: 1, borderRadius: 16, paddingHorizontal: 15, fontSize: 15 },
  sexRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sexOption: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 9 },
  stickySaveWrap: { position: "absolute", left: 20, right: 20, padding: 8, borderRadius: 20, shadowColor: "#062B5E", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  saveButton: { minHeight: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", shadowColor: "#062B5E", shadowOpacity: 0.32, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  saveText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  activityCard: { borderWidth: 1.5, borderRadius: 23, padding: 16, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#062B5E", shadowOpacity: 0.08, shadowRadius: 13, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  activityIcon: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  activityCopy: { flex: 1, gap: 3 },
  activityTitle: { fontSize: 16, fontWeight: "900" },
  activityHint: { fontSize: 12, lineHeight: 17 },
  activityArrow: { fontSize: 30, lineHeight: 32, fontWeight: "400" },
  passwordCard: { borderWidth: 1, borderRadius: 26, padding: 18, gap: 11, shadowColor: "#062B5E", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  passwordTitle: { fontSize: 18, fontWeight: "900" },
  passwordHint: { fontSize: 13, lineHeight: 19, marginBottom: 3 },
  passwordButton: { minHeight: 50, borderRadius: 15, alignItems: "center", justifyContent: "center", marginTop: 2 },
  passwordButtonText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  loadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  passwordSpinner: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: "#FFFFFF55", borderTopColor: "#FFFFFF" },
  passwordSuccess: { flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderRadius: 18, padding: 12, marginTop: 3, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  passwordSuccessIcon: { width: 27, height: 27, borderRadius: 14, textAlign: "center", textAlignVertical: "center", fontSize: 19, lineHeight: 23, fontWeight: "900", borderWidth: 2 },
  passwordSuccessCopy: { flex: 1, gap: 2 },
  passwordSuccessTitle: { fontSize: 13, fontWeight: "900" },
  passwordSuccessText: { fontSize: 12, lineHeight: 17 },
  infoCard: { borderWidth: 1, borderRadius: 26, paddingHorizontal: 18, shadowColor: "#062B5E", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  row: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  value: { fontSize: 16, fontWeight: "700", marginTop: 4 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.58 },
  confirmBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 20 },
  confirmCard: { borderWidth: 1, borderRadius: 26, padding: 20, gap: 12, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  temporaryCode: { textAlign: "center", letterSpacing: 8, fontSize: 30, lineHeight: 38, fontWeight: "900", paddingVertical: 8 },
  confirmActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  confirmButton: { flex: 1, minHeight: 50, borderWidth: 2, borderRadius: 15, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  confirmButtonText: { fontSize: 14, fontWeight: "900" },
  confirmButtonTextLight: { color: "#fff", fontSize: 14, fontWeight: "900" },
});
