/**
 * Canais oficiais da Prefeitura Municipal de Barra do Piraí-RJ.
 * Fonte: rodapé e páginas do portal oficial https://barradopirai.rj.gov.br (conferidas em 11/11/2026).
 * O WhatsApp NÃO aparece no rodapé do portal; por isso não há valor padrão — o administrador pode
 * informá-lo em Admin → Canais oficiais (ou via variável OFFICIAL_WHATSAPP_URL no servidor).
 */
export const PORTAL_BASE = "https://barradopirai.rj.gov.br";

export const OFFICIAL_CHANNELS = {
  website: PORTAL_BASE,
  instagram: "https://www.instagram.com/pmbpoficial/",
  facebook: "https://www.facebook.com/pmbpoficial",
  youtube: "https://www.youtube.com/@prefeituradebarradopirai7558",
  whatsapp: "",
} as const;

export const OFFICIAL_CONTACT = {
  name: "Atendimento local de Barra do Piraí",
  address: "Trav. Assumpção, 69 – Centro – Barra do Piraí-RJ – CEP 27123-080",
  phone: "(24) 2041-0303",
  phoneDial: "+552420410303",
} as const;

export type PortalService = { key: string; title: string; subtitle: string; url: string; icon: string };

/** Atalhos para páginas reais do portal oficial. */
export const PORTAL_SERVICES: PortalService[] = [
  { key: "news", title: "Notícias", subtitle: "Todas as notícias oficiais", url: `${PORTAL_BASE}/todas-as-noticias`, icon: "newspaper.fill" },
  { key: "ouvidoria", title: "Ouvidoria", subtitle: "Elogio, sugestão, reclamação", url: `${PORTAL_BASE}/fale-com-a-ouvidoria`, icon: "bubble.left.and.bubble.right.fill" },
  { key: "services", title: "Carta de Serviços", subtitle: "Serviços e documentos", url: `${PORTAL_BASE}/page/cbd22b99-1b49-42de-afc3-e0dd8fac97f0/carta-de-servicos`, icon: "doc.text.fill" },
  { key: "transparency", title: "Transparência", subtitle: "Contas e informações públicas", url: "https://barradopirai.geosiap.net.br/portal-transparencia/home", icon: "chart.bar.fill" },
  { key: "bulletin", title: "Boletim Municipal", subtitle: "Diário Oficial Eletrônico", url: `${PORTAL_BASE}/page/4edb08b8-3bae-4279-ad18-e8b88e798bda/diario-oficial-eletronico`, icon: "book.fill" },
  { key: "events", title: "Agenda de eventos", subtitle: "Programação da cidade", url: `${PORTAL_BASE}/agenda-de-eventos`, icon: "calendar" },
  { key: "secretariats", title: "Secretarias", subtitle: "Endereços e contatos", url: `${PORTAL_BASE}/todas-as-secretarias?tab=all`, icon: "building.2.fill" },
  { key: "tanaarea", title: "Tá na Área", subtitle: "Atendimento e serviços locais", url: `${PORTAL_BASE}/page/d8cfc41e-d382-4ecc-a8d3-ac1aa4d80b1f/programa-ta-na-area-a-prefs-no-seu-bairro`, icon: "mappin.and.ellipse" },
];

/** Telefones nacionais de emergência (valores nacionais fixos). */
export const EMERGENCY_NUMBERS = [
  { label: "SAMU", number: "192" },
  { label: "Bombeiros", number: "193" },
  { label: "Polícia Militar", number: "190" },
  { label: "Defesa Civil", number: "199" },
] as const;
