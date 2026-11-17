import { useEffect, useState } from "react";
import { StyleSheet, Text, type TextStyle } from "react-native";

export function LiveDateTime({ style, light = false }: { style?: TextStyle; light?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <Text accessibilityLiveRegion="polite" style={[styles.base, light ? styles.light : styles.dark, style]}>
      {now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })} • {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { fontSize: 12, fontWeight: "800", textTransform: "capitalize" },
  light: { color: "#DDF0FF" },
  dark: { color: "#0A2342" },
});
