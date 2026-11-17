import { Colors, type ColorScheme, type ThemeColorPalette } from "@/constants/theme";
import { useColorScheme } from "./use-color-scheme";
import { useThemeContext } from "@/lib/theme-provider";

/**
 * Returns the current theme's color palette.
 * Usage: const colors = useColors(); then colors.text, colors.background, etc.
 */
export function useColors(colorSchemeOverride?: ColorScheme): ThemeColorPalette {
  const colorSchema = useColorScheme();
  const scheme = (colorSchemeOverride ?? colorSchema ?? "light") as ColorScheme;
  const { highContrast } = useThemeContext();
  if (!highContrast) return Colors[scheme];
  return { ...Colors[scheme], background: scheme === "light" ? "#FFFFFF" : "#000000", surface: scheme === "light" ? "#FFFFFF" : "#111111", foreground: scheme === "light" ? "#000000" : "#FFFFFF", muted: scheme === "light" ? "#1F2937" : "#F3F4F6", border: scheme === "light" ? "#000000" : "#FFFFFF" };
}
