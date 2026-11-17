export const REQUEST_CATEGORIES = [
  ["lighting", "💡", "Iluminação pública"],
  ["water_shortage", "💧", "Falta de água"],
  ["water_leak", "🚰", "Vazamento de água"],
  ["sewage_leak", "🕳️", "Vazamento de esgoto"],
  ["mowing", "🌿", "Capina e limpeza"],
  ["paving", "🛣️", "Pavimentação / buracos"],
  ["garbage", "🗑️", "Lixo e entulho"],
  ["drainage", "🌧️", "Bueiro e drenagem"],
  ["tree", "🌳", "Poda ou queda de árvore"],
  ["risk_area", "⚠️", "Área de risco (Defesa Civil)"],
  ["other", "📝", "Outro problema"],
] as const;

export type RequestCategory = (typeof REQUEST_CATEGORIES)[number][0];
export const CATEGORY_VALUES = REQUEST_CATEGORIES.map((c) => c[0]) as unknown as [RequestCategory, ...RequestCategory[]];
export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(REQUEST_CATEGORIES.map(([k, e, l]) => [k, `${e} ${l}`]));

export const STATUS_LABELS: Record<string, string> = {
  received: "Recebida", reviewing: "Em análise", forwarded: "Encaminhada", in_progress: "Em andamento", completed: "Concluída", cancelled: "Cancelada",
};

/** Protocolo legível: CB-2026-000123 */
export function requestProtocol(id: number, createdAt: Date | string): string {
  const year = new Date(createdAt).getFullYear();
  return `CB-${year}-${String(id).padStart(6, "0")}`;
}
