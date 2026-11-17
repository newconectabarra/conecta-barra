/**
 * Bairros e distritos de Barra do Piraí-RJ.
 *
 * ATENÇÃO: não existe uma lista única e oficial publicada pela Prefeitura. Esta lista inicial
 * foi consolidada de cadastros públicos de CEP e dos distritos publicados no portal oficial
 * (barradopirai.rj.gov.br). Ela é apenas a SEMENTE do banco: a tabela `neighborhoods` pode ser
 * editada no painel administrativo e recebe automaticamente novos bairros retornados pela busca de CEP.
 */
export const CITY_NAME = "Barra do Piraí";
export const CITY_STATE = "RJ";
/** Código IBGE de Barra do Piraí-RJ. */
export const CITY_IBGE_CODE = "3300308";

export type SeedNeighborhood = { name: string; area: string };

const SEDE = [
  "Areal", "Arthur Catalddi", "Belvedere da Taquara", "Boa Sorte", "Boca do Mato", "Caieira São Pedro",
  "Caieira Velha", "Caixa D'Água Velha", "Campo Bom", "Cantão", "Carvão", "Centro", "Chácara Farani", "Chalet",
  "Coimbra", "Doutor Mesquita", "Lago Azul", "Maracanã", "Matadouro", "Metalúrgica", "Morro do Gama", "Muqueca",
  "Nossa Senhora de Santana", "Oficinas Velhas", "Parque Almirante", "Parque Santana", "Parque São Joaquim",
  "Parque São José", "Ponte do Andrade", "Ponte Preta", "Ponte Vermelha", "Química", "Represa", "Roseira",
  "Santana da Barra", "Santo Antônio", "Santo Cristo", "São João", "São Luís", "Vale do Ipiranga", "Vargem Grande",
  "Vila Helena", "Vila Suíça",
];

const DISTRICTS = ["Califórnia da Barra", "Dorândia", "Ipiabas", "São José do Turvo", "Vargem Alegre"];

export const SEED_NEIGHBORHOODS: SeedNeighborhood[] = [
  ...SEDE.map((name) => ({ name, area: "Sede" })),
  ...DISTRICTS.map((name) => ({ name, area: "Distrito" })),
];

/** Remove acentos, pontuação e caixa para comparar nomes de bairro vindos de fontes diferentes. */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bsao luiz\b/g, "sao luis")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Procura o nome canônico de um bairro (ignorando acentos e variações como "São Luiz"/"São Luís"). */
export function matchNeighborhood(raw: string | null | undefined, known: readonly string[]): string | null {
  const target = normalizeName(raw);
  if (!target) return null;
  return known.find((name) => normalizeName(name) === target) ?? null;
}

export function formatCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function composeAddress(parts: { street?: string | null; number?: string | null; complement?: string | null; neighborhood?: string | null; cep?: string | null }): string {
  const line1 = [parts.street?.trim(), parts.number?.trim() ? `nº ${parts.number.trim()}` : ""].filter(Boolean).join(", ");
  const line2 = [parts.complement?.trim(), parts.neighborhood?.trim()].filter(Boolean).join(" – ");
  const tail = `${CITY_NAME}-${CITY_STATE}${parts.cep ? `, CEP ${formatCep(parts.cep)}` : ""}`;
  return [line1, line2, tail].filter(Boolean).join(" – ");
}
