# Conecta Barra — erros encontrados na revisão (1.0.x → 2.0.0)

## A. Os dois erros que você já conhecia

### A1. "Erro ao criar um cadastro"
Causas encontradas em `server/routers.ts` (`register`):
1. Falha de **banco** e falha de **e-mail** eram tratadas como o mesmo erro, então qualquer problema aparecia como "erro ao criar cadastro".
2. Se o e-mail não estava configurado, o cadastro **falhava por inteiro** em vez de seguir sem confirmação.
3. Quando o envio do código falhava, o usuário já criado ficava **preso** (não confirmado) e o recadastro dava "usuário já existe".
4. Risco de `openId` maior que a coluna.

**Correção:** erros separados e com mensagem clara; cadastro não confirmado e abandonado é liberado ao tentar de novo (`releaseAbandonedRegistration`); sem provedor de e-mail, o cadastro conclui sem confirmação; o retorno informa `verificationRequired`.

### A2. Configuração do e-mail de confirmação
1. Só havia SMTP, e o **Render Free bloqueia SMTP** (portas 25/465/587).
2. Não existia diagnóstico nem teste.

**Correção:** envio por **API HTTPS da Brevo** (`server/email.ts`), com mensagens que explicam o erro (chave inválida, remetente não validado, IP não autorizado), botão **Enviar e-mail de teste** no painel da gestão, status em `/api/health/config` e no log de inicialização. SMTP continua como alternativa fora do Render.

## B. Contas "já configuradas" dentro do código
Havia identificadores reais gravados (servidor no Render, projeto Expo, projeto Firebase, usuário/senha-padrão de gestão). **Removidos.** Agora:
- `app.config.ts` e `eas.json` só leem variáveis; valores "COLOQUE-AQUI…" contam como não configurados.
- Compilação estrita (EAS ou `CONECTA_STRICT=1`) para com mensagem se faltar algo.
- `scripts/setup-check.mjs` (`npm run setup:check`) lista todas as contas/repositórios.
- `server/_core/env.ts` não tem valores padrão de conta; produção exige `JWT_SECRET` ≥ 32 e `DATA_ENCRYPTION_KEY`.
- Login de gestão só existe com `ADMIN_USERNAME` + `ADMIN_PASSWORD`.

## C. Cards do painel
"Resumo rápido" e "Indicadores de gestão" eram só visuais. Agora cada card abre um painel (`components/admin-detail-sheet.tsx`) com a lista que forma o número (abertas, em andamento, concluídas, moradores pendentes, solicitações, notificações não lidas, e-mails com falha), com toque para abrir o item.

## D. Outras correções
- Login: link "esqueci a senha", botão Google com retorno por ticket de uso único e tela `google-auth`, acesso à confirmação de e-mail quando necessário.
- `deleteResident` completo; backup/restauração com conversão de datas; payload de backup em `longtext`.
- PDF do painel com escape de HTML.
- Limites de requisição nas rotas sensíveis; HTTPS/WSS apenas (sem tráfego em texto claro).
- Permissões Android desnecessárias bloqueadas.
- Atualizações OTA só habilitadas depois do `eas init`.
- Documentação antiga com endereços reais substituída.

## F. Correções da versão 2.0.1 (relatadas após a implantação)
1. **Administrador caindo no painel de morador:** o app abre sempre em `(tabs)` (tela de morador) e o botão "Voltar" usava `/(tabs)` como saída. Agora o administrador é levado ao `/admin` ao abrir o app e o "Voltar" respeita o papel.
2. **Vários administradores:** só a conta `admin_gestao` pode ter o papel de administrador (`upsertUser` ignora o papel em qualquer outro identificador). Novo aviso no Painel de usuários, com botão que remove as contas extras mantendo a conta logada (`admin.cleanupAdmins`, registrado na auditoria).
3. **Troca de senha no perfil:** o cartão estava escondido para administradores. Agora a gestão também troca a senha (hash guardado no banco, sem mudar o esquema); `ADMIN_FORCE_ENV_PASSWORD=true` é a saída de emergência.
4. **Lista de moradores:** ordem A–Z por padrão (sem diferenciar acentos/maiúsculas), agrupada por letra com contador, bairro e telefone visíveis no cartão.
5. **`db:push` no TiDB:** não é idempotente; novo `npm run db:check` (somente leitura) confere as tabelas.
6. **Compilação:** scripts usam `npx eas-cli` (sem instalar o eas global). Render: guia descreve o modo Docker (recomendado) e `render.yaml` passou a usar o Dockerfile.

## E. Não verificado (seja transparente ao testar)
Não foi possível instalar dependências nem rodar o app/`tsc` completo no ambiente de revisão. Foi verificada só a **sintaxe** dos arquivos alterados e a existência dos helpers/tabelas referenciados. Rode `npm run check` e teste em aparelho.
