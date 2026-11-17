import { useMemo, useState } from "react";
import { StyleProp, StyleSheet, Text, TextInputProps, View, ViewStyle } from "react-native";
import { TextInput } from "@/components/text-input";
import { Pressable } from "@/components/pressable";
import type { ThemeColorPalette } from "@/constants/theme";

type PasswordFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  colors: ThemeColorPalette;
  style?: StyleProp<ViewStyle>;
  inputProps?: Omit<TextInputProps, "value" | "onChangeText" | "secureTextEntry" | "placeholder" | "placeholderTextColor">;
  showStrength?: boolean;
};

function getPasswordStrength(value: string) {
  if (!value) return { label: "Digite sua senha", colorKey: "muted" as const, progress: 0 };
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[A-Z]/.test(value)) score += 1;
  if (/[a-z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  if (score <= 2) return { label: "Senha fraca", colorKey: "error" as const, progress: 0.34 };
  if (score <= 4) return { label: "Senha média", colorKey: "warning" as const, progress: 0.67 };
  return { label: "Senha forte", colorKey: "success" as const, progress: 1 };
}

export function PasswordField({ value, onChangeText, placeholder, colors, style, inputProps, showStrength = true }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const strength = useMemo(() => getPasswordStrength(value), [value]);
  const strengthColor = colors[strength.colorKey];

  return (
    <View>
      <View style={[styles.inputShell, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
        <TextInput
          {...inputProps}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.foreground }]}
          autoCapitalize="none"
          returnKeyType="done"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? "Ocultar senha" : "Mostrar senha"}
          onPress={() => setVisible((current) => !current)}
          style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
          hitSlop={8}
        >
          <Text style={[styles.toggleText, { color: colors.primary }]}>{visible ? "Ocultar" : "Mostrar"}</Text>
        </Pressable>
      </View>
      {showStrength && value.length > 0 && (
        <View style={styles.strengthRow} accessibilityLiveRegion="polite">
          <View style={[styles.track, { backgroundColor: colors.border }]}>
            <View style={[styles.progress, { width: `${strength.progress * 100}%`, backgroundColor: strengthColor }]} />
          </View>
          <Text style={[styles.strengthText, { color: strengthColor }]}>{strength.label}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputShell: { minHeight: 56, borderWidth: 1, borderRadius: 17, paddingLeft: 16, paddingRight: 12, flexDirection: "row", alignItems: "center" },
  input: { flex: 1, minHeight: 54, paddingVertical: 0, fontSize: 15 },
  toggle: { minHeight: 40, justifyContent: "center", paddingHorizontal: 4 },
  toggleText: { fontSize: 12, fontWeight: "900" },
  strengthRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 7, paddingHorizontal: 3 },
  track: { flex: 1, height: 5, borderRadius: 99, overflow: "hidden" },
  progress: { height: "100%", borderRadius: 99 },
  strengthText: { minWidth: 76, fontSize: 11, fontWeight: "800", textAlign: "right" },
  pressed: { opacity: 0.65 },
});
