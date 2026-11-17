export const BRAND = {
  name: "Conecta Barra",
  tagline: "Informação e participação local",
  // Paleta da marca (azul profundo → azul claro)
  navy: "#062B5E",
  blue: "#0B5FD8",
  sky: "#38A6FF",
  ice: "#DDF0FF",
  gradient: ["#062B5E", "#0B5FD8", "#38A6FF"] as const,
  gradientSoft: ["#0B5FD8", "#38A6FF"] as const,
};

/** Tokens de design usados nos componentes (raios, sombras e espaçamento). */
export const RADIUS = { sm: 12, md: 16, lg: 22, xl: 28, pill: 999 } as const;
export const SHADOW = {
  card: { shadowColor: "#0B3B8C", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  raised: { shadowColor: "#062B5E", shadowOpacity: 0.22, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
} as const;
