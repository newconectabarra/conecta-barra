export type ExportUser = {
  name: string | null;
  username: string | null;
  role: "user" | "admin";
  residentStatus: "pending" | "approved" | "blocked";
  phone: string | null;
  email: string | null;
  address: string | null;
  complement: string | null;
  sex: "female" | "male" | "non_binary" | "prefer_not_to_say" | null;
  householdSize: number | null;
  createdAt: Date | string;
  lastSignedIn: Date | string;
};

const sexLabels = { female: "Feminino", male: "Masculino", non_binary: "Não binário", prefer_not_to_say: "Não informado" } as const;
const statusLabels = { pending: "Pendente", approved: "Aprovado", blocked: "Bloqueado" } as const;

function value(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "Não informado" : String(value);
}

function date(valueToFormat: Date | string | null | undefined) {
  if (!valueToFormat) return "Não informado";
  const parsed = new Date(valueToFormat);
  if (Number.isNaN(parsed.getTime())) return "Não informado";
  return parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function csvCell(valueToFormat: string | number | null | undefined) {
  const text = value(valueToFormat).replace(/\r?\n|\r/g, " ");
  return `"${text.replace(/"/g, '""')}"`;
}

function html(valueToEscape: string | number | null | undefined) {
  return value(valueToEscape).replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character] ?? character));
}

export function buildUsersCsv(users: ExportUser[]) {
  const headers = ["Nome", "Usuário", "Tipo de conta", "Status", "Telefone", "E-mail", "Endereço", "Complemento", "Sexo", "Moradores", "Cadastro", "Último acesso"];
  const rows = users.map((item) => [
    item.name,
    item.username,
    item.role === "admin" ? "Administrador" : "Morador",
    statusLabels[item.residentStatus],
    item.phone,
    item.email,
    item.address,
    item.complement,
    item.sex ? sexLabels[item.sex] : null,
    item.householdSize ? `${item.householdSize} pessoa(s)` : null,
    date(item.createdAt),
    item.role === "admin" ? "Conta protegida" : date(item.lastSignedIn),
  ].map(csvCell).join(";"));
  return `\uFEFF${headers.map(csvCell).join(";")}\n${rows.join("\n")}`;
}

export function buildUsersPdfHtml(users: ExportUser[]) {
  const rows = users.map((item) => `<tr><td>${html(item.name)}</td><td>${html(item.username ? `@${item.username}` : "Conta administrativa")}</td><td>${html(item.role === "admin" ? "Administrador" : "Morador")}</td><td>${html(statusLabels[item.residentStatus])}</td><td>${html(item.phone)}</td><td>${html(item.email)}</td><td>${html(item.address)}</td><td>${html(date(item.createdAt))}</td></tr>`).join("");
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:18mm}body{font-family:Arial,sans-serif;color:#17202A}h1{color:#0B5FD8;margin:0 0 4px}p{color:#5B6B7A;font-size:12px;margin:4px 0 16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #D9E2EC;padding:7px;text-align:left;font-size:9px;vertical-align:top}th{background:#EAF3F8;color:#0B5FD8;font-size:10px}tr:nth-child(even){background:#F8FAFC}</style></head><body><h1>Lista de usuários</h1><p>Conecta Barra · Barra do Piraí-RJ · ${users.length} registro(s) · Gerado em ${html(new Date().toLocaleString("pt-BR"))}</p><table><thead><tr><th>Nome</th><th>Usuário</th><th>Tipo</th><th>Status</th><th>Telefone</th><th>E-mail</th><th>Endereço</th><th>Cadastro</th></tr></thead><tbody>${rows || `<tr><td colspan="8">Nenhum registro encontrado.</td></tr>`}</tbody></table></body></html>`;
}
