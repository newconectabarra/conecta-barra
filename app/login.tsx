import { useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { TextInput } from "@/components/text-input";
import { Pressable } from "@/components/pressable";
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";

import { ScreenContainer } from "@/components/screen-container";
import * as Api from "@/lib/_core/api";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { getBiometricSession, setBiometricSession, setSessionToken, setUserInfo, clearBiometricSession, removeSessionToken, clearUserInfo } from "@/lib/_core/auth";
import { PasswordField } from "@/components/password-field";
import { LiveDateTime } from "@/components/live-date-time";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { AppMark, PrefeituraBadge } from "@/components/brand-logo";
import { AddressFields, emptyAddress, isAddressComplete, type AddressValue } from "@/components/address-fields";
import { SelectionField } from "@/components/selection-field";
import { BRAND } from "@/constants/brand";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { warmUpServer } from "@/lib/warmup";

export default function LoginScreen() {
  const colors = useColors();
  const [registering, setRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricPending, setBiometricPending] = useState(false);
  const autoPrompt = useRef(false);
  useEffect(() => { void AsyncStorage.multiGet(["dm_saved_username", "dm_remember_me"]).then(([savedUsername, savedRemember]) => { if (savedUsername[1]) setUsername(savedUsername[1]); setRememberMe(savedRemember[1] === "true"); }); }, []);
  useEffect(() => {
    if (Platform.OS === "web") return;
    void (async () => {
      const [hardware, enrolled, saved] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        getBiometricSession(),
      ]);
      const available = hardware && enrolled && Boolean(saved);
      setBiometricAvailable(available);
      if (available) autoPrompt.current = true;
    })();
  }, []);
  const [name, setName] = useState("");
  const [addr, setAddr] = useState<AddressValue>(emptyAddress);
  const [phone, setPhone] = useState("");
  const [sex, setSex] = useState<"female" | "male" | "non_binary" | "prefer_not_to_say">("prefer_not_to_say");
  const [email, setEmail] = useState("");
  const [verificationUsername, setVerificationUsername] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationVisible, setVerificationVisible] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  // O que o servidor oferece (botão Google, e-mail, aprovação). Sem resposta (servidor dormindo), mostra só o básico.
  const serverConfig = trpc.auth.publicConfig.useQuery(undefined, { retry: 1, staleTime: 60_000 });
  const persistSessionAndOpenHome = async (result: { user: any; token: string; profileComplete?: boolean }, message: string, profileComplete = result.profileComplete ?? true) => {
    if (rememberMe) await AsyncStorage.multiSet([["dm_saved_username", username.trim()], ["dm_remember_me", "true"]]);
    else await AsyncStorage.multiRemove(["dm_saved_username", "dm_remember_me"]);
    await setSessionToken(result.token);
    await setUserInfo(result.user);
    // Usuários com cadastro incompleto devem concluir o perfil antes de acessar a área inicial.
    if (result.user.role !== "admin" && !profileComplete) {
      router.replace("/(tabs)/profile");
      return;
    }
    if (Platform.OS !== "web" && !biometricAvailable) {
      const [hardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
      if (hardware && enrolled) {
        Alert.alert("Ativar login biométrico?", "Na próxima vez, você poderá entrar com digital ou reconhecimento facial. A senha não será armazenada.", [
          { text: "Agora não", style: "cancel", onPress: () => router.replace(result.user.role === "admin" ? "/admin" : profileComplete ? "/(tabs)" : "/(tabs)/profile") },
          { text: "Ativar", onPress: () => { void (async () => { await setBiometricSession(result.token, result.user); setBiometricAvailable(true); router.replace(result.user.role === "admin" ? "/admin" : profileComplete ? "/(tabs)" : "/(tabs)/profile"); })(); } },
        ]);
        return;
      }
    }
    Alert.alert(message, `Olá, ${result.user.name ?? username}!`);
    router.replace(result.user.role === "admin" ? "/admin" : profileComplete ? "/(tabs)" : "/(tabs)/profile");
  };
  const loginWithBiometric = async () => {
    if (biometricPending || Platform.OS === "web") return;
    setBiometricPending(true);
    try {
      const saved = await getBiometricSession();
      if (!saved) { setBiometricAvailable(false); return; }
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Entrar no Conecta Barra", promptSubtitle: "Confirme sua identidade para acessar a conta", cancelLabel: "Usar senha" });
      if (!result.success) return;

      // Biometria only unlocks the locally stored token; the server must still
      // approve it before the app enters the authenticated area.
      const verified = await Api.validateSessionToken(saved.token);
      if (!verified) {
        await clearBiometricSession();
        await removeSessionToken();
        await clearUserInfo();
        setBiometricAvailable(false);
        Alert.alert("Sessão expirada", "Entre com seu usuário e senha para renovar o acesso neste aparelho.");
        return;
      }

      await setSessionToken(saved.token);
      await setUserInfo(saved.user);
      router.replace(saved.user.role === "admin" ? "/admin" : "/(tabs)");
    } catch (error) {
      Alert.alert("Não foi possível verificar a sessão", error instanceof Error ? error.message : "Verifique sua conexão e entre com seu usuário e senha.");
    } finally {
      setBiometricPending(false);
    }
  };

  const friendlyError = (error: { message?: string }) => {
    const message = error.message ?? "";
    if (/404|not found|failed to fetch|network|conexão/i.test(message)) return "Não foi possível alcançar o servidor. Verifique a internet e tente novamente.";
    if (/código de confirmação/i.test(message)) return message;
    if (/401|inválidos/i.test(message)) return "Nome de usuário ou senha incorretos.";
    if (/403|aguarda aprovação|bloqueado/i.test(message)) return message;
    if (/409|já está em uso/i.test(message)) return "Esse nome de usuário já está cadastrado. Escolha outro.";
    return message || "Não foi possível concluir a operação. Tente novamente.";
  };
  const login = trpc.auth.login.useMutation({
    onSuccess: (result) => { void persistSessionAndOpenHome(result, "Bem-vindo"); },
    onError: (error) => {
      // Cadastro criado mas e-mail ainda não confirmado: leva direto à tela do código (antes ficava sem saída).
      if (/confirme seu e-mail/i.test(error.message)) {
        Alert.alert("Confirme seu e-mail", error.message, [
          { text: "Agora não", style: "cancel" },
          { text: "Digitar código", onPress: () => { setVerificationUsername(username.trim().toLowerCase()); setVerificationCode(""); setVerificationVisible(true); } },
        ]);
        return;
      }
      Alert.alert("Não foi possível entrar", friendlyError(error));
    },
  });
  const register = trpc.auth.register.useMutation({
    onSuccess: (result) => {
      // Servidor sem e-mail configurado: o cadastro já entra logado, sem código.
      if (typeof result.token === "string" && result.user) { void persistSessionAndOpenHome(result, "Cadastro criado", false); return; }
      setVerificationUsername(result.username); setVerificationCode(""); setVerificationVisible(true);
    },
    onError: (error) => Alert.alert("Não foi possível cadastrar", friendlyError(error)),
  });
  const verifyEmail = trpc.auth.verifyEmail.useMutation({
    onSuccess: (result) => { setVerificationVisible(false); Alert.alert("E-mail confirmado", serverConfig.data?.residentApproval ? "Seu e-mail foi confirmado. Aguarde a aprovação da gestão para usar os serviços." : "Seu e-mail foi confirmado. Agora é só entrar com seu usuário e senha."); setRegistering(false); setUsername(verificationUsername); setPassword(""); },
    onError: (error) => Alert.alert("Não foi possível confirmar", friendlyError(error)),
  });
  const resendVerification = trpc.auth.resendVerification.useMutation({
    onSuccess: () => Alert.alert("Código reenviado", "Verifique sua caixa de entrada e também a pasta de spam."),
    onError: (error) => Alert.alert("Não foi possível reenviar", friendlyError(error)),
  });

  const submit = () => {
    const normalizedUsername = username.trim();
    // O tamanho mínimo só vale para CRIAR cadastro. No login não pode haver mínimo: a senha da gestão pode ser curta e
    // contas antigas também; quem confere é o servidor.
    if (normalizedUsername.length < (registering ? 4 : 1)) return Alert.alert("Informe o usuário", registering ? "O nome de usuário precisa ter pelo menos 4 caracteres." : "Digite seu usuário.");
    if (registering ? password.length < 8 : password.length < 1) return Alert.alert("Informe a senha", registering ? "A senha precisa ter pelo menos 8 caracteres." : "Digite sua senha.");
    if (registering) {
      if (!privacyAccepted) return Alert.alert("Aceite a política de privacidade", "Leia e aceite a política de privacidade para criar seu acesso.");
      if (name.trim().length < 3 || !isAddressComplete(addr)) return Alert.alert("Complete seus dados", "Informe seu nome e o endereço completo: CEP, rua, número e bairro.");
      if (phone.trim().length < 8) return Alert.alert("Informe seu telefone", "O telefone é necessário para o cadastro.");
      const normalizedEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return Alert.alert("Informe seu e-mail", "Digite um endereço de e-mail válido para receber o código.");
      register.mutate({ username: normalizedUsername, password, name: name.trim(), email: normalizedEmail, cep: addr.cep, street: addr.street.trim(), number: addr.number.trim(), neighborhood: addr.neighborhood, complement: addr.complement.trim() || undefined, phone: phone.trim(), sex });
    } else {
      login.mutate({ username: normalizedUsername, password });
    }
  };

  useEffect(() => { warmUpServer(); }, []);
  const [googleBusy, setGoogleBusy] = useState(false);
  const continueWithGoogle = async () => {
    setGoogleBusy(true);
    try {
      const result = await WebBrowser.openAuthSessionAsync(`${Api.getApiBaseUrl()}/api/auth/google/start`, "conectabarra://google-auth");
      if (result.type !== "success" || !result.url) return;
      const ticket = /[?&]ticket=([a-f0-9]+)/i.exec(result.url)?.[1];
      const failure = /[?&]error=([^&]+)/i.exec(result.url)?.[1];
      if (ticket) router.push({ pathname: "/google-auth", params: { ticket } });
      else if (failure) Alert.alert("Login com Google", decodeURIComponent(failure.replace(/\+/g, " ")));
    } catch (error) {
      Alert.alert("Login com Google", error instanceof Error ? error.message : "Não foi possível abrir o Google.");
    } finally { setGoogleBusy(false); }
  };
  const busy = login.isPending || register.isPending;
  const verificationBusy = verifyEmail.isPending || resendVerification.isPending;
  useEffect(() => { if (biometricAvailable && autoPrompt.current && !registering) { autoPrompt.current = false; void loginWithBiometric(); } }, [biometricAvailable]); // eslint-disable-line react-hooks/exhaustive-deps
  if (verificationVisible) {
    return (
      <ScreenContainer className="px-5 pt-8" containerClassName="bg-background">
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <View style={styles.verificationCard}>
            <Text style={[styles.verificationTitle, { color: colors.foreground }]}>Confirme seu e-mail</Text>
            <Text style={[styles.verificationText, { color: colors.muted }]}>Enviamos um código de 6 dígitos para {email || "o e-mail do seu cadastro"}. Digite-o abaixo para validar o cadastro.</Text>
            <TextInput value={verificationCode} onChangeText={(value) => setVerificationCode(value.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6} placeholder="000000" placeholderTextColor={colors.muted} style={[styles.codeInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.primary }]} accessibilityLabel="Código de confirmação do e-mail" />
            <Pressable disabled={verificationBusy} onPress={() => { if (verificationCode.trim().length !== 6) return Alert.alert("Código incompleto", "Digite os 6 dígitos recebidos por e-mail."); verifyEmail.mutate({ username: verificationUsername, code: verificationCode.trim() }); }} style={({ pressed }) => [styles.submit, { backgroundColor: colors.primary }, (pressed || verificationBusy) && styles.pressed]}><Text style={styles.submitText}>{verifyEmail.isPending ? "Confirmando…" : "Confirmar e-mail"}</Text></Pressable>
            <Pressable disabled={verificationBusy} onPress={() => resendVerification.mutate({ username: verificationUsername })} style={({ pressed }) => [styles.secondaryAction, { borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.secondaryActionText, { color: colors.primary }]}>{resendVerification.isPending ? "Reenviando…" : "Reenviar código"}</Text></Pressable>
            <Pressable disabled={verificationBusy} onPress={() => setVerificationVisible(false)} style={styles.switch}><Text style={[styles.switchText, { color: colors.muted }]}>Voltar ao cadastro</Text></Pressable>
          </View>
        </ScrollView></KeyboardAvoidingView>
      </ScreenContainer>
    );
  }

  const input = [ns.field, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }];
  const sexOptions = [["female", "Feminino"], ["male", "Masculino"], ["non_binary", "Não binário"], ["prefer_not_to_say", "Prefiro não informar"]] as const;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
          <LinearGradient colors={BRAND.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={ns.hero}>
            <View style={ns.heroBubble} />
            <AppMark size={84} />
            <Text style={ns.heroTitle}>Conecta Barra</Text>
            <Text style={ns.heroSub}>{BRAND.tagline}</Text>
            <LiveDateTime light style={ns.heroDateTime} />
            <View style={ns.heroBadge}><PrefeituraBadge light compact /></View>
          </LinearGradient>

          <View style={[ns.sheet, { backgroundColor: colors.background }]}>
            <Text style={[ns.title, { color: colors.foreground }]}>{registering ? "Crie seu acesso" : "Bem-vindo de volta"}</Text>
            <Text style={[ns.sub, { color: colors.muted }]}>{registering ? "Crie seu acesso para acompanhar informações e serviços locais." : "Entre para acompanhar sua rua, seu bairro e os serviços disponíveis."}</Text>
            {!registering && biometricAvailable && (
              <Pressable accessibilityRole="button" accessibilityLabel="Entrar com biometria" onPress={() => void loginWithBiometric()} disabled={biometricPending} style={({ pressed }) => [ns.bioButton, { backgroundColor: colors.primary + "14", borderColor: colors.primary }, pressed && { opacity: 0.75 }]}>
                <IconSymbol name="fingerprint" size={34} color={colors.primary} />
                <View style={{ flex: 1 }}><Text style={[ns.bioTitle, { color: colors.primary }]}>{biometricPending ? "Verificando…" : "Entrar com biometria"}</Text><Text style={[ns.bioHint, { color: colors.muted }]}>Digital ou reconhecimento facial</Text></View>
              </Pressable>
            )}

            {registering && (<>
              <Text style={[ns.label, { color: colors.foreground }]}>Nome completo</Text>
              <TextInput accessibilityLabel="Nome completo" value={name} onChangeText={setName} placeholder="Seu nome" placeholderTextColor={colors.muted} style={input} />
            </>)}

            <Text style={[ns.label, { color: colors.foreground }]}>Usuário</Text>
            <TextInput accessibilityLabel="Usuário" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="seu.usuario" placeholderTextColor={colors.muted} style={input} />
            <Text style={[ns.label, { color: colors.foreground }]}>Senha</Text>
            <PasswordField value={password} onChangeText={setPassword} placeholder={registering ? "Mínimo de 8 caracteres" : "Sua senha"} colors={colors} />

            {registering && (<>
              <Text style={[ns.label, { color: colors.foreground }]}>E-mail</Text>
              <TextInput accessibilityLabel="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="voce@email.com" placeholderTextColor={colors.muted} style={input} />
              <Text style={[ns.label, { color: colors.foreground }]}>Telefone / WhatsApp</Text>
              <TextInput accessibilityLabel="Telefone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="(24) 99999-9999" placeholderTextColor={colors.muted} style={input} />
              <AddressFields value={addr} onChange={setAddr} />
              <Text style={[ns.label, { color: colors.foreground }]}>Sexo</Text>
              <SelectionField
                value={sex}
                options={sexOptions.map(([value, label]) => ({ value, label }))}
                onChange={setSex}
                title="Selecione o sexo"
                placeholder="Escolha uma opção"
                accessibilityLabel="Selecionar sexo"
              />
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: privacyAccepted }} onPress={() => setPrivacyAccepted((value) => !value)} style={ns.privacyRow}>
                <View style={[ns.checkbox, { borderColor: colors.primary, backgroundColor: privacyAccepted ? colors.primary : "transparent" }]}>{privacyAccepted && <Text style={ns.checkmark}>✓</Text>}</View>
                <Text style={[ns.privacyText, { color: colors.foreground }]}>Li e aceito a política de privacidade e o tratamento dos dados para autenticação, avisos e solicitações.</Text>
              </Pressable>
            </>)}

            {!registering && (
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: rememberMe }} onPress={() => setRememberMe((v) => !v)} style={ns.rememberRow}>
                <View style={[ns.checkbox, { borderColor: colors.primary, backgroundColor: rememberMe ? colors.primary : "transparent" }]}>{rememberMe && <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "900" }}>✓</Text>}</View>
                <Text style={{ color: colors.muted, fontSize: 13 }}>Lembrar meu usuário</Text>
              </Pressable>
            )}

            <Pressable accessibilityRole="button" onPress={submit} disabled={busy} style={({ pressed }) => [ns.submitWrap, (pressed || busy) && { opacity: 0.8 }]}>
              <LinearGradient colors={BRAND.gradientSoft} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={ns.submitGradient}>
                <Text style={ns.submitLabel}>{busy ? "Aguarde…" : registering ? "Criar cadastro" : "Entrar"}</Text>
          </LinearGradient>
          </Pressable>

            {!registering && serverConfig.data?.passwordResetByEmail !== false && (
              <Pressable accessibilityRole="link" accessibilityLabel="Esqueci minha senha" onPress={() => router.push("/forgot-password")} style={styles.forgot}>
                <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>Esqueci minha senha</Text>
              </Pressable>
            )}
            {serverConfig.data?.google && (
              <Pressable accessibilityRole="button" accessibilityLabel="Continuar com Google" disabled={googleBusy} onPress={() => void continueWithGoogle()} style={({ pressed }) => [{ minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", marginTop: 6 }, (pressed || googleBusy) && { opacity: 0.7 }]}>
                <Text style={{ color: colors.foreground, fontWeight: "800" }}>{googleBusy ? "Abrindo o Google…" : "Continuar com Google"}</Text>
              </Pressable>
            )}
            <Pressable onPress={() => setRegistering((v) => !v)} style={ns.switch}><Text style={{ color: colors.primary, fontWeight: "800" }}>{registering ? "Já tenho cadastro • Entrar" : "Sou morador • Criar cadastro"}</Text></Pressable>
            <Text style={[ns.footer, { color: colors.muted }]}>Aplicativo para moradores de Barra do Piraí-RJ. Os dados do cadastro são usados apenas para autenticar o acesso e direcionar avisos do seu bairro.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 38, gap: 12 },
  brand: { alignItems: "center", marginTop: 18, marginBottom: 14, paddingHorizontal: 12 },
  brandLogo: { width: 86, height: 86, borderRadius: 26, marginBottom: 15 },
  brandName: { fontSize: 24, lineHeight: 29, fontWeight: "900", textAlign: "center", letterSpacing: 1.5 },
  brandSub: { fontSize: 13, lineHeight: 18, marginTop: 4, textAlign: "center", fontWeight: "700" },
  brandTagline: { fontSize: 12, marginTop: 3 },
  heading: { marginBottom: 8 },
  title: { fontSize: 31, lineHeight: 37, fontWeight: "900", letterSpacing: -0.8 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  label: { fontSize: 13, fontWeight: "800", marginTop: 8 },
  input: { minHeight: 56, borderWidth: 1, borderRadius: 17, paddingHorizontal: 16, fontSize: 15, shadowColor: "#062B5E", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  sexRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  sexOption: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 9 },
  submit: { minHeight: 58, borderRadius: 18, alignItems: "center", justifyContent: "center", marginTop: 20, shadowColor: "#062B5E", shadowOpacity: 0.2, shadowRadius: 13, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  submitText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  biometricButton: { minHeight: 52, borderRadius: 17, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 8 },
  biometricText: { fontSize: 15, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  switch: { alignItems: "center", paddingVertical: 15, marginTop: 2 },
  forgot: { alignItems: "center", paddingVertical: 9, marginTop: 4 },
  switchText: { fontSize: 14, fontWeight: "800" },
  credits: { alignItems: "center", borderWidth: 1, borderRadius: 16, paddingVertical: 9, paddingHorizontal: 14, marginBottom: 8, gap: 2 },
  creditsTitle: { fontSize: 13, fontWeight: "900" },
  creditsText: { fontSize: 11, fontWeight: "700" },
  rememberRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 8 },
  checkbox: { width: 20, height: 20, borderWidth: 1.5, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  checkmark: { color: "#FFFFFF", fontWeight: "900", fontSize: 13 },
  rememberText: { fontSize: 13, fontWeight: "700" },
  verificationCard: { borderWidth: 1, borderColor: "#0A7EA4", borderRadius: 26, padding: 20, marginTop: 40, gap: 10, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  verificationTitle: { fontSize: 26, lineHeight: 32, fontWeight: "900" },
  verificationText: { fontSize: 15, lineHeight: 22 },
  codeInput: { minHeight: 62, borderWidth: 2, borderRadius: 16, paddingHorizontal: 16, fontSize: 26, fontWeight: "900", letterSpacing: 8, textAlign: "center", marginTop: 8 },
  secondaryAction: { minHeight: 52, borderRadius: 17, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 8 },
  secondaryActionText: { fontSize: 15, fontWeight: "900" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});

const ns = StyleSheet.create({
  hero: { paddingTop: 70, paddingBottom: 54, alignItems: "center", gap: 6, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, overflow: "hidden" },
  heroBubble: { position: "absolute", right: -60, top: -40, width: 210, height: 210, borderRadius: 105, backgroundColor: "#FFFFFF14" },
  heroTitle: { color: "#FFFFFF", fontSize: 32, fontWeight: "900", letterSpacing: -0.6, marginTop: 8 },
  heroSub: { color: "#DDF0FF", fontSize: 14, fontWeight: "600" },
  heroDateTime: { marginTop: 4, fontSize: 12, fontWeight: "900", textAlign: "center" },
  heroBadge: { marginTop: 14, backgroundColor: "#FFFFFF1F", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  sheet: { flex: 1, marginTop: -22, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, gap: 6 },
  title: { fontSize: 24, fontWeight: "900" },
  sub: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: "800", marginTop: 8 },
  field: { minHeight: 54, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, fontSize: 15 },
  bioButton: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1.5, borderRadius: 22, padding: 14, marginBottom: 6, shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  bioTitle: { fontSize: 16, fontWeight: "900" }, bioHint: { fontSize: 12 },
  sexRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sexChip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  rememberRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  checkmark: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  privacyRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 12 },
  privacyText: { flex: 1, fontSize: 12, lineHeight: 18 },
  submitWrap: { marginTop: 16, borderRadius: 18, overflow: "hidden" },
  submitGradient: { minHeight: 56, alignItems: "center", justifyContent: "center" },
  submitLabel: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" },
  switch: { alignItems: "center", paddingVertical: 14 },
  footer: { fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 4, marginBottom: 20 },
});
