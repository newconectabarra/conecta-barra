import { CITY_IBGE_CODE, CITY_NAME, CITY_STATE, formatCep, matchNeighborhood, normalizeName } from "../shared/neighborhoods";
import * as db from "./db";

export type CepResult = {
  cep: string;
  street: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  inCity: boolean;
  source: "viacep" | "brasilapi";
};

const cache = new Map<string, { at: number; value: CepResult }>();
const TTL = 24 * 60 * 60 * 1000;

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fromViaCep(digits: string): Promise<CepResult | null> {
  const data = await getJson(`https://viacep.com.br/ws/${digits}/json/`);
  if (!data || data.erro) return null;
  const inCity = String(data.ibge ?? "") === CITY_IBGE_CODE || (normalizeName(data.localidade) === normalizeName(CITY_NAME) && data.uf === CITY_STATE);
  return { cep: formatCep(digits), street: data.logradouro ?? "", complement: data.complemento ?? "", neighborhood: data.bairro ?? "", city: data.localidade ?? "", state: data.uf ?? "", inCity, source: "viacep" };
}

async function fromBrasilApi(digits: string): Promise<CepResult | null> {
  const data = await getJson(`https://brasilapi.com.br/api/cep/v2/${digits}`);
  if (!data) return null;
  const inCity = normalizeName(data.city) === normalizeName(CITY_NAME) && data.state === CITY_STATE;
  return { cep: formatCep(digits), street: data.street ?? "", complement: "", neighborhood: data.neighborhood ?? "", city: data.city ?? "", state: data.state ?? "", inCity, source: "brasilapi" };
}

/** Consulta o CEP (ViaCEP com fallback para BrasilAPI) e normaliza o bairro para a lista do banco. */
export async function lookupCep(rawCep: string): Promise<CepResult | null> {
  const digits = rawCep.replace(/\D/g, "");
  if (digits.length !== 8) throw new Error("Informe um CEP com 8 dígitos.");
  const cached = cache.get(digits);
  if (cached && Date.now() - cached.at < TTL) return cached.value;

  let result: CepResult | null = null;
  let lastError: unknown;
  for (const provider of [fromViaCep, fromBrasilApi]) {
    try {
      result = await provider(digits);
      if (result) break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!result) {
    if (lastError) throw new Error("Serviço de CEP indisponível no momento. Tente novamente em instantes.");
    return null;
  }

  if (result.inCity && result.neighborhood) {
    const known = (await db.listNeighborhoods(false)).map((item) => item.name);
    const canonical = matchNeighborhood(result.neighborhood, known);
    if (canonical) result.neighborhood = canonical;
    else await db.upsertNeighborhood(result.neighborhood.trim(), "Sede", "cep");
  }
  cache.set(digits, { at: Date.now(), value: result });
  return result;
}
