import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { TextInput } from "@/components/text-input";
import { Pressable } from "@/components/pressable";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { PasswordField } from "@/components/password-field";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const request = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => { setCodeSent(true); Alert.alert("Código enviado", "Se houver um e-mail cadastrado para esse usuário, o código foi enviado. Verifique também a pasta de spam."); },
    onError: (error) => Alert.alert("Não foi possível solicitar", error.message),
  });
  const reset = trpc.auth.resetPassword.useMutation({
    onSuccess: () => { Alert.alert("Senha redefinida", "Sua senha foi alterada. Entre novamente com a nova senha.", [{ text: "Entrar", onPress: () => router.replace("/login") }]); },
    onError: (error) => Alert.alert("Não foi possível redefinir", error.message),
  });
  const submitRequest = () => {
    const normalized = username.trim().toLowerCase();
    if (normalized.length < 4) return Alert.alert("Informe o usuário", "Digite o nome de usuário cadastrado.");
    request.mutate({ username: normalized });
  };
  const submitReset = () => {
    if (!/^\d{6}$/.test(code)) return Alert.alert("Código incompleto", "Digite os 6 dígitos recebidos por e-mail.");
    if (newPassword.length < 8) return Alert.alert("Senha inválida", "A nova senha precisa ter pelo menos 8 caracteres.");
    if (newPassword !== confirmPassword) return Alert.alert("Senhas diferentes", "Confirme a nova senha corretamente.");
    reset.mutate({ username: username.trim().toLowerCase(), code, newPassword });
  };
  const busy = request.isPending || reset.isPending;

  return <ScreenContainer className="px-5 pt-5" edges={["top", "left", "right", "bottom"]}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar ao login" onPress={() => router.replace("/login")} style={({ pressed }) => [styles.back, { borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.backText, { color: colors.primary }]}>‹ Voltar ao login</Text></Pressable>
        <View style={styles.heading}><Text style={[styles.eyebrow, { color: colors.primary }]}>RECUPERAÇÃO DE ACESSO</Text><Text style={[styles.title, { color: colors.foreground }]}>Esqueci minha senha</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Enviaremos um código temporário para o e-mail associado ao seu usuário.</Text></View>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.foreground }]}>Nome de usuário</Text>
          <TextInput value={username} onChangeText={setUsername} editable={!codeSent} autoCapitalize="none" autoCorrect={false} returnKeyType="next" placeholder="Ex.: maria.silva" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
          {!codeSent ? <Pressable disabled={busy} onPress={submitRequest} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary }, pressed && styles.pressed, busy && styles.disabled]}><Text style={styles.primaryText}>{request.isPending ? "Enviando código…" : "Enviar código por e-mail"}</Text></Pressable> : <>
            <Text style={[styles.helper, { color: colors.muted }]}>Digite o código de 6 dígitos recebido e escolha uma nova senha.</Text>
            <Text style={[styles.label, { color: colors.foreground }]}>Código temporário</Text>
            <TextInput value={code} onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6} returnKeyType="next" placeholder="000000" placeholderTextColor={colors.muted} style={[styles.codeInput, { backgroundColor: colors.background, borderColor: colors.primary, color: colors.foreground }]} />
            <Text style={[styles.label, { color: colors.foreground }]}>Nova senha</Text><PasswordField value={newPassword} onChangeText={setNewPassword} placeholder="Mínimo de 8 caracteres" colors={colors} />
            <Text style={[styles.label, { color: colors.foreground }]}>Confirmar nova senha</Text><PasswordField value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Digite novamente" colors={colors} showStrength={false} />
            <Pressable disabled={busy} onPress={submitReset} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary }, pressed && styles.pressed, busy && styles.disabled]}><Text style={styles.primaryText}>{reset.isPending ? "Redefinindo…" : "Redefinir senha"}</Text></Pressable>
            <Pressable disabled={busy} onPress={() => request.mutate({ username: username.trim().toLowerCase() })} style={({ pressed }) => [styles.secondary, { borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.secondaryText, { color: colors.primary }]}>Reenviar código</Text></Pressable>
          </>}
        </View>
        <Text style={[styles.privacy, { color: colors.muted }]}>Por segurança, a tela não revela se o usuário existe. O código expira em 10 minutos e só pode ser usado uma vez.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({ flex: { flex: 1 }, content: { flexGrow: 1, paddingBottom: 40, gap: 14 }, back: { alignSelf: "flex-start", minHeight: 44, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 13, justifyContent: "center" }, backText: { fontSize: 14, fontWeight: "900" }, heading: { gap: 4, marginTop: 10 }, eyebrow: { fontSize: 11, fontWeight: "900", letterSpacing: 1.2 }, title: { fontSize: 30, lineHeight: 36, fontWeight: "900" }, subtitle: { fontSize: 14, lineHeight: 21 }, card: { borderWidth: 1, borderRadius: 22, padding: 17, gap: 9 }, label: { fontSize: 13, fontWeight: "900", marginTop: 3 }, input: { minHeight: 54, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, fontSize: 15 }, codeInput: { minHeight: 60, borderWidth: 2, borderRadius: 15, paddingHorizontal: 14, fontSize: 25, fontWeight: "900", letterSpacing: 7, textAlign: "center" }, helper: { fontSize: 13, lineHeight: 19, marginBottom: 2 }, primary: { minHeight: 52, borderRadius: 15, alignItems: "center", justifyContent: "center", marginTop: 8 }, primaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" }, secondary: { minHeight: 48, borderWidth: 1.5, borderRadius: 15, alignItems: "center", justifyContent: "center" }, secondaryText: { fontSize: 14, fontWeight: "900" }, privacy: { fontSize: 12, lineHeight: 18, textAlign: "center", paddingHorizontal: 8 }, disabled: { opacity: 0.55 }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] }, });
