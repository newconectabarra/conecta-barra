import { forwardRef, useState } from "react";
import { TextInput as RNTextInput, type TextInputProps } from "react-native";
import { useColors } from "@/hooks/use-colors";

/**
 * Substituto direto do TextInput: realça a borda em azul quando o campo está em foco,
 * usa cor de placeholder e de cursor da marca. Mantém todas as propriedades originais.
 */
export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, onFocus, onBlur, placeholderTextColor, selectionColor, ...rest }, ref) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <RNTextInput
      ref={ref}
      style={[style, { borderColor: focused ? colors.primary : "#111827" }]}
      placeholderTextColor={placeholderTextColor ?? colors.muted + "AA"}
      selectionColor={selectionColor ?? colors.primary}
      onFocus={(event) => { setFocused(true); onFocus?.(event); }}
      onBlur={(event) => { setFocused(false); onBlur?.(event); }}
      {...rest}
    />
  );
});
