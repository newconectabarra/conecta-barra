import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Image, StyleSheet, Text, View, type ViewProps } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { BRAND } from "@/constants/brand";
import { PrefeituraBadge } from "@/components/brand-logo";

const logo = require("@/assets/images/icon.png");

/** Abertura azul → azul claro com o logotipo do Conecta Barra e o selo da Prefeitura. */
export function AnimatedLogoSplash({ children }: ViewProps) {
  const [visible, setVisible] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const scale = useSharedValue(0.7);
  const opacity = useSharedValue(1);
  const textOpacity = useSharedValue(0);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (active) setReduceMotion(enabled); });
    return () => { active = false; };
  }, []);

  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const textStyle = useAnimatedStyle(() => ({ opacity: textOpacity.value }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
    scale.value = reduceMotion ? withTiming(1, { duration: 150 }) : withSequence(withTiming(1.08, { duration: 420 }), withTiming(1, { duration: 200 }));
    textOpacity.value = withTiming(1, { duration: reduceMotion ? 120 : 500 });
    opacity.value = withTiming(0, { duration: 320 }, () => undefined);
    const timer = setTimeout(() => setVisible(false), reduceMotion ? 500 : 1_300);
    return () => clearTimeout(timer);
  }, [opacity, reduceMotion, scale, textOpacity]);

  return (
    <View style={styles.root}>
      {children}
      {visible ? (
        <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]} pointerEvents="none" accessible accessibilityLabel="Abrindo o aplicativo Conecta Barra" accessibilityRole="progressbar">
          <LinearGradient colors={BRAND.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.overlay}>
            <Animated.View style={logoStyle}><Image source={logo} style={styles.logo} accessibilityIgnoresInvertColors /></Animated.View>
            <Animated.View style={[styles.textBlock, textStyle]}>
              <Text style={styles.name}>Conecta Barra</Text>
              <Text style={styles.tag}>{BRAND.tagline}</Text>
            </Animated.View>
            <Animated.View style={[styles.footer, textStyle]}><PrefeituraBadge light /></Animated.View>
          </LinearGradient>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18 },
  logo: { width: 132, height: 132, borderRadius: 34 },
  textBlock: { alignItems: "center", gap: 4 },
  name: { color: "#FFFFFF", fontSize: 32, fontWeight: "900", letterSpacing: -0.5 },
  tag: { color: "#DDF0FF", fontSize: 14, fontWeight: "600" },
  footer: { position: "absolute", bottom: 46 },
});
