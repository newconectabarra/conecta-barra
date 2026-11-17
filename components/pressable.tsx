import { forwardRef } from "react";
import { Pressable as RNPressable, type GestureResponderEvent, type PressableProps, type View } from "react-native";
import * as Haptics from "expo-haptics";

type Props = PressableProps & {
  /** Vibração leve ao tocar. Padrão: ligada para botões, abas, checkbox, switch e radio. */
  haptic?: boolean;
  /** Escala enquanto pressionado (1 = sem efeito). */
  pressScale?: number;
};

const HAPTIC_ROLES = new Set(["button", "tab", "checkbox", "switch", "radio", "togglebutton"]);

/**
 * Substituto direto do Pressable do React Native, usado em todo o app:
 * feedback visual padronizado (leve redução de escala + opacidade) e vibração suave nos botões.
 * Aceita as mesmas propriedades, inclusive `style` como função.
 */
export const Pressable = forwardRef<View, Props>(function Pressable({ haptic, pressScale, style, onPress, disabled, accessibilityRole, ...rest }, ref) {
  const interactive = accessibilityRole === "button" || accessibilityRole === "tab" || accessibilityRole === "link";
  const scale = pressScale ?? (interactive ? 0.97 : 0.985);
  const vibrate = haptic ?? (accessibilityRole ? HAPTIC_ROLES.has(accessibilityRole) : false);

  const handlePress = (event: GestureResponderEvent) => {
    if (vibrate && !disabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onPress?.(event);
  };

  return (
    <RNPressable
      ref={ref}
      accessibilityRole={accessibilityRole}
      disabled={disabled}
      onPress={onPress ? handlePress : undefined}
      style={(state) => {
        const base = typeof style === "function" ? style(state) : style;
        return [base, state.pressed && !disabled ? { opacity: 0.9, transform: [{ scale }] } : null, disabled ? { opacity: 0.55 } : null];
      }}
      {...rest}
    />
  );
});
