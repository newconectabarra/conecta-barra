import { useEffect, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text } from "react-native";
import { TextInput } from "@/components/text-input";
import { Pressable } from "@/components/pressable";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { ResidentAccessLoading, useResidentAccess } from "@/hooks/use-resident-access";
import { enqueueOfflineMutation } from "@/lib/offline-cache";
import { REQUEST_CATEGORIES, type RequestCategory } from "@/shared/categories";
import { composeAddress } from "@/shared/neighborhoods";
import { AddressFields, emptyAddress, isAddressComplete, type AddressValue } from "@/components/address-fields";
import { SelectionField } from "@/components/selection-field";
import { createClientOperationId, withUploadRetries } from "@/lib/resilient-upload";

const categories = REQUEST_CATEGORIES;
type Category = RequestCategory;

export default function NewRequestScreen() {
  const colors = useColors();
  const { allowed, loading } = useResidentAccess();
  const [category, setCategory] = useState<Category>("lighting");
  const [description, setDescription] = useState("");
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const [addr, setAddr] = useState<AddressValue>(emptyAddress);
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (prefilled || !me.data?.id) return;
    setAddr({ cep: me.data.cep ?? "", street: me.data.street ?? "", number: me.data.number ?? "", complement: me.data.complement ?? "", neighborhood: me.data.neighborhood ?? "" });
    setPrefilled(true);
  }, [me.data, prefilled]);
  const [referencePoint, setReferencePoint] = useState("");
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [clientOperationId] = useState(() => createClientOperationId("request"));
  const createMutation = trpc.requests.create.useMutation({ onSuccess: () => { Alert.alert("Solicitação enviada", "O registro foi salvo e poderá ser acompanhado pelo aplicativo."); router.back(); } });

  const choosePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.78 });
    if (!result.canceled) setPhoto(result.assets[0]);
  };

  const submit = async () => {
    if (description.trim().length < 10 || !isAddressComplete(addr)) {
      Alert.alert("Complete os dados", "Informe uma descrição detalhada e o endereço completo (CEP, rua, número e bairro).");
      return;
    }
    let photoDataBase64: string | undefined;
    let photoContentType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg";
    try {
      if (photo?.uri) {
        const prepared = await ImageManipulator.manipulateAsync(photo.uri, [{ resize: { width: 1280 } }], { compress: 0.68, format: ImageManipulator.SaveFormat.JPEG });
        photoDataBase64 = await FileSystem.readAsStringAsync(prepared.uri, { encoding: FileSystem.EncodingType.Base64 });
        photoContentType = "image/jpeg";
      }
      await withUploadRetries(() => createMutation.mutateAsync({ category, description: description.trim(), fullAddress: composeAddress(addr), cep: addr.cep, neighborhood: addr.neighborhood, referencePoint: referencePoint.trim() || undefined, photoDataBase64, photoContentType, clientOperationId }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tente novamente.";
      const isNetworkFailure = /network|conexão|conexao|timeout|demorou|fetch|servidor/i.test(message);
      if (isNetworkFailure) {
        await enqueueOfflineMutation("requests.create", { category, description: description.trim(), fullAddress: composeAddress(addr), cep: addr.cep, neighborhood: addr.neighborhood, referencePoint: referencePoint.trim() || undefined, photoDataBase64, photoContentType, clientOperationId });
        Alert.alert("Salva para sincronizar", "A solicitação foi guardada neste aparelho e será enviada automaticamente quando a internet voltar.");
        router.back();
        return;
      }
      Alert.alert("Não foi possível enviar", message);
    }
  };

  if (loading) return <ResidentAccessLoading />;
  if (!allowed) return null;

  return (
    <ScreenContainer className="px-5 pt-4" containerClassName="bg-background">
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.foreground }]}>Nova solicitação</Text>
        <Text style={[styles.intro, { color: colors.muted }]}>Conte o que aconteceu. A gestão acompanhará o registro com você.</Text>

        <Text style={[styles.label, { color: colors.foreground }]}>Tipo de problema</Text>
        <SelectionField value={category} options={categories.map(([value, emoji, label]) => ({ value, label: `${emoji} ${label}` }))} onChange={setCategory} title="Selecione o tipo de problema" placeholder="Escolha uma categoria" accessibilityLabel="Selecionar tipo de problema" />

        <Text style={[styles.label, { color: colors.foreground }]}>Descrição do problema</Text>
        <TextInput value={description} onChangeText={setDescription} placeholder="Descreva o que precisa ser resolvido" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} />
        <Text style={[styles.label, { color: colors.foreground }]}>Local do problema</Text>
        <AddressFields value={addr} onChange={setAddr} />
        <Text style={[styles.label, { color: colors.foreground }]}>Ponto de referência <Text style={{ color: colors.muted, fontWeight: "400" }}>(opcional)</Text></Text>
        <TextInput value={referencePoint} onChangeText={setReferencePoint} placeholder="Ex.: próximo à praça" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} />

        <Text style={[styles.label, { color: colors.foreground }]}>Foto do problema</Text>
        <Pressable onPress={choosePhoto} style={({ pressed }) => [styles.photoButton, { borderColor: colors.primary, backgroundColor: colors.primary + "10" }, pressed && styles.pressed]}><Text style={[styles.photoButtonText, { color: colors.primary }]}>{photo ? "Trocar foto" : "Adicionar foto do celular"}</Text></Pressable>
        {photo?.uri && <Image source={{ uri: photo.uri }} style={styles.preview} />}

        <Pressable disabled={createMutation.isPending} onPress={submit} style={({ pressed }) => [styles.submit, { backgroundColor: colors.primary }, (pressed || createMutation.isPending) && styles.pressed]}><Text style={styles.submitText}>{createMutation.isPending ? "Enviando…" : "Enviar solicitação"}</Text></Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 180, gap: 12 },
  title: { fontSize: 20, fontWeight: "800" },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  label: { fontSize: 14, fontWeight: "800", marginTop: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 },
  chipText: { fontSize: 12, fontWeight: "700" },
  input: { minHeight: 54, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, fontSize: 14 },
  textarea: { minHeight: 112, paddingTop: 14, textAlignVertical: "top" },
  photoButton: { minHeight: 52, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 15, alignItems: "center", justifyContent: "center" },
  photoButtonText: { fontSize: 14, fontWeight: "800" },
  preview: { width: "100%", height: 170, borderRadius: 16, marginTop: 4 },
  submit: { minHeight: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", marginTop: 12 },
  submitText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
