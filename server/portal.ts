import { PORTAL_BASE } from "../shared/official";

export type PortalNews = { id: string; title: string; summary: string; url: string; imageUrl: string | null; publishedLabel: string | null };

let cache: { at: number; items: PortalNews[] } | null = null;
const TTL = 5 * 60 * 1000;

const decode = (value: string) =>
  value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
const strip = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/**
 * Lê as últimas notícias publicadas no portal oficial. O portal não publica RSS/API aberta, então
 * a leitura depende da estrutura HTML atual da página inicial. Se o portal mudar o layout, a lista
 * volta vazia e o app mostra o botão "Abrir notícias no portal" — nada quebra.
 */
export async function fetchPortalNews(): Promise<PortalNews[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.items;
  try {
    const response = await fetch(`${PORTAL_BASE}/inicio`, { signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "ConectaBarra/1.0 (+app oficial de bairros)", Accept: "text/html" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const items: PortalNews[] = [];
    const seen = new Set<string>();
    const anchor = /<a\b[^>]*href="((?:https:\/\/barradopirai\.rj\.gov\.br)?\/todas-as-noticias\/([0-9a-f-]{36}))"[^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = anchor.exec(html)) && items.length < 12) {
      const [, href, id, inner] = match;
      if (seen.has(id)) continue;
      seen.add(id);
      const heading = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(inner);
      const paragraph = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(inner);
      const published = /Publicado:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4}(?:\s*às\s*[0-9]{2}:[0-9]{2})?)/i.exec(strip(inner));
      const image = /<img[^>]+src="([^"]+)"/i.exec(inner);
      let imageUrl: string | null = null;
      if (image) {
        const src = decode(image[1]);
        const wrapped = /[?&]url=([^&]+)/.exec(src);
        imageUrl = wrapped ? decodeURIComponent(wrapped[1]) : src.startsWith("http") ? src : `${PORTAL_BASE}${src}`;
      }
      const title = strip(heading?.[1] ?? "") || strip(inner).split("Secom")[0].trim();
      if (!title) continue;
      items.push({ id, title: title.slice(0, 220), summary: strip(paragraph?.[1] ?? "").slice(0, 260), url: href.startsWith("http") ? href : `${PORTAL_BASE}${href}`, imageUrl, publishedLabel: published?.[1] ?? null });
    }
    cache = { at: Date.now(), items };
    return items;
  } catch (error) {
    console.warn("[Portal] Falha ao ler notícias:", error instanceof Error ? error.message : error);
    return cache?.items ?? [];
  }
}
