import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, View, useColorScheme as useSystemColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";

import { SchemeColors, type ColorScheme } from "@/constants/theme";

type ThemeContextValue = {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  fontScale: 0.9 | 1 | 1.15 | 1.3;
  setFontScale: (scale: 0.9 | 1 | 1.15 | 1.3) => void;
  highContrast: boolean;
  setHighContrast: (enabled: boolean) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme() ?? "light";
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(systemScheme);
  const [fontScale, setFontScaleState] = useState<0.9 | 1 | 1.15 | 1.3>(1);
  const [highContrast, setHighContrastState] = useState(false);

  const applyScheme = useCallback((scheme: ColorScheme) => {
    nativewindColorScheme.set(scheme);
    Appearance.setColorScheme?.(scheme);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = scheme;
      root.classList.toggle("dark", scheme === "dark");
      const palette = SchemeColors[scheme];
      Object.entries(palette).forEach(([token, value]) => {
        root.style.setProperty(`--color-${token}`, value);
      });
    }
  }, []);

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setColorSchemeState(scheme);
    applyScheme(scheme);
    void AsyncStorage.setItem("conecta.colorScheme", scheme);
  }, [applyScheme]);

  useEffect(() => {
    applyScheme(colorScheme);
  }, [applyScheme, colorScheme]);

  useEffect(() => {
    void AsyncStorage.multiGet(["conecta.colorScheme", "conecta.fontScale", "conecta.highContrast"]).then(([scheme, scale, contrast]) => {
      if (scheme[1] === "light" || scheme[1] === "dark") setColorSchemeState(scheme[1]);
      const parsedScale = Number(scale[1]);
      if ([0.9, 1, 1.15, 1.3].includes(parsedScale)) setFontScaleState(parsedScale as 0.9 | 1 | 1.15 | 1.3);
      if (contrast[1] === "true") setHighContrastState(true);
    });
  }, []);

  const setFontScale = useCallback((scale: 0.9 | 1 | 1.15 | 1.3) => { setFontScaleState(scale); void AsyncStorage.setItem("conecta.fontScale", String(scale)); }, []);
  const setHighContrast = useCallback((enabled: boolean) => { setHighContrastState(enabled); void AsyncStorage.setItem("conecta.highContrast", String(enabled)); }, []);

  const themeVariables = useMemo(
    () =>
      vars({
        "color-primary": SchemeColors[colorScheme].primary,
        "color-background": SchemeColors[colorScheme].background,
        "color-surface": SchemeColors[colorScheme].surface,
        "color-foreground": SchemeColors[colorScheme].foreground,
        "color-muted": SchemeColors[colorScheme].muted,
        "color-border": SchemeColors[colorScheme].border,
        "color-success": SchemeColors[colorScheme].success,
        "color-warning": SchemeColors[colorScheme].warning,
        "color-error": SchemeColors[colorScheme].error,
      }),
    [colorScheme],
  );

  const value = useMemo(
    () => ({
      colorScheme,
      setColorScheme,
      fontScale,
      setFontScale,
      highContrast,
      setHighContrast,
    }),
    [colorScheme, setColorScheme, fontScale, setFontScale, highContrast, setHighContrast],
  );
  console.log(value, themeVariables)

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, themeVariables]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeContext must be used within ThemeProvider");
  }
  return ctx;
}
