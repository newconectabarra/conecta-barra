# Conecta Barra 2.0 — Guia de implantação (do zero, só com contas gratuitas)

> **Regra desta versão:** o código-fonte **não traz nenhuma conta já configurada** (nem Expo, nem Firebase, nem Render, nem banco).
> Você cria as suas próprias contas e informa os dados em **três lugares**, e só neles:
>
> | Onde | O que vai lá |
> |---|---|
> | **Painel do Render** (variáveis de ambiente) | segredos do **servidor**: banco, chaves, e-mail, Firebase, login da gestão |
> | **`eas.json`** (e arquivo `google-services.json`) | dados que o **aplicativo** precisa: endereço do servidor, ID do projeto Expo, Firebase do Android |
> | **GitHub → Settings → Variables** | só o endereço do servidor para o "despertador" (keep-alive) |
>
> Se faltar algo, **a compilação é interrompida** e a mensagem diz o que criar. Para ver a lista completa a qualquer momento: `npm run setup:check`.

---

## 0. Visão geral: o que fica hospedado onde

| Peça | Site / serviço | Custo | Cartão? | Para que serve |
|---|---|---|---|---|
| Código-fonte | **GitHub** | grátis | não | guarda o projeto; o Render lê dele; roda o despertador |
| Banco de dados | **TiDB Cloud (Starter)** | grátis | não | MySQL compatível onde ficam moradores, solicitações, avisos etc. |
| Servidor (API + tempo real) | **Render** (Web Service Free) | grátis | não | roda a pasta `server/` |
| E-mail (confirmação de cadastro, "esqueci a senha") | **Brevo** | grátis (300 e-mails/dia) | não | envia e-mails por API HTTPS |
| Notificações push | **Firebase (FCM)** | grátis | não | avisos no celular |
| Compilar o APK | **Expo EAS Build** | grátis (cota mensal) | não | gera o `.apk` na nuvem |
| Login com Google *(opcional)* | **Google Cloud Console** | grátis | não | botão "Continuar com Google" |
| Manter o servidor acordado | **GitHub Actions** ou **cron-job.org** | grátis | não | evita a hibernação do Render |

**Importante — cada coisa no seu lugar:**
- O **servidor** (pasta `server/`) roda **somente no Render**. Nunca no Expo, nunca no Firebase.
- O **aplicativo** (APK) é compilado **somente no Expo EAS** (ou no seu PC, opção avançada).
- O **banco** fica **somente no TiDB Cloud**. O Render guarda arquivos só temporariamente — não coloque banco nele.
- **Firebase** é usado **apenas** para push. Não use o banco do Firebase.
- **Senhas, chaves e JSON de conta de serviço nunca vão para o GitHub.** O `.gitignore` já bloqueia `.env`, `service-account*.json` e `google-services.json`.

Ordem recomendada: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 9 → 10** (o 8 é opcional). Reserve ~1h30 na primeira vez.

---

## 1. GitHub — repositório do código

1. Crie conta em <https://github.com/signup> (e-mail + senha, sem cartão).
2. Clique em **New repository** → nome `conecta-barra` → **Public** (necessário para o despertador gratuito rodar sem limite; veja a observação abaixo) → **Create**.
3. No seu computador, dentro da pasta do projeto descompactado:
   ```bash
   git init
   git add .
   git commit -m "Conecta Barra 2.0"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/conecta-barra.git
   git push -u origin main
   ```
4. Confira no site que **não** subiram `.env`, `google-services.json` nem arquivos `service-account*.json` (o `.gitignore` impede).

> Repositório **privado** também funciona no Render, mas Actions privados têm cota de minutos menor. Como não há segredos no código, público é seguro. Se preferir privado, use o cron-job.org no passo 10.

---

## 2. Seu computador — ferramentas

Instale: **Node.js 22 LTS** (<https://nodejs.org>) e **Git**. Depois, na pasta do projeto:

```bash
npm install
# (opcional) npm install -g eas-cli — não é preciso: os comandos npm run build:* já usam `npx eas-cli`
npm run setup:check             # mostra o que ainda falta configurar
```

`setup:check` lista todas as contas/repositórios necessários e marca o que já está preenchido. Rode-o sempre que quiser conferir.

---

## 3. TiDB Cloud — banco de dados (grátis, sem cartão)

1. Entre em <https://tidbcloud.com> e crie a conta (Google/GitHub/e-mail).
2. **Create Cluster → Starter** (plano gratuito). Região: escolha a mais próxima (ex.: São Paulo, se houver; senão `us-east`). Dê o nome `conecta-barra`.
3. Abra o cluster → **Connect** → em *Connect With* escolha **General** (ou Prisma/mysql2). Clique em **Generate Password** e **copie a senha agora** (ela só aparece uma vez).
4. Monte a string de conexão no formato:
   ```
   mysql://USUARIO:SENHA@gateway01.REGIAO.prod.aws.tidbcloud.com:4000/test
   ```
   (`USUARIO` costuma terminar com `.root`. Se a senha tiver `@`, `#`, `/` ou `:`, troque por `%40`, `%23`, `%2F`, `%3A`.)
5. No painel do TiDB, em **Security / Allowed IPs** (ou *Network*), deixe liberado para qualquer IP (`0.0.0.0/0`) — o Render grátis não tem IP fixo. A conexão continua protegida por usuário, senha e TLS.
6. **Crie as tabelas** (uma vez), no seu computador, criando um arquivo `.env` (copie `.env.example`) com:
   ```
   DATABASE_URL=mysql://USUARIO:SENHA@gateway01....:4000/test
   DATABASE_SSL=true
   ```
   e rodando:
   ```bash
   npm run db:push
   ```
   Responda "Yes" se perguntar. Deve terminar sem erro.

   > ⚠ **Rode `db:push` UMA ÚNICA vez.** No TiDB, uma segunda execução reclama de *chave primária* (o drizzle-kit tenta recriá-las) mesmo com tudo certo. Se isso acontecer, **não é erro do banco**: as tabelas já existem. Para conferir sem risco (somente leitura), use:
   > ```bash
   > npm run db:check     # "OK: todas as tabelas existem" → não rode db:push de novo
   > ```
   > Esta versão (2.0.1) **não altera o esquema do banco**, então quem já rodou o `db:push` na 2.0 não precisa rodar nada.

Limite grátis (Starter): cerca de 5 GiB de armazenamento e 50 milhões de linhas lidas por mês, suficiente para um condomínio/bairro.
> Fotos enviadas pelos usuários ficam **dentro do banco** — é o que mais consome espaço. Acompanhe o uso no painel do TiDB.

---

## 4. Render — o servidor (grátis, sem cartão)

1. Crie conta em <https://render.com> entrando com o GitHub (**sem cartão** para o plano Free).
2. **New + → Web Service → Build and deploy from a Git repository** → conecte o GitHub → escolha `conecta-barra`.
3. Preencha. **Há dois jeitos válidos — o recomendado é Docker** (usa o `Dockerfile` do projeto, que instala só o necessário para o servidor e é o caminho testado em produção):

   | Campo | Docker (recomendado) | Node (alternativa) |
   |---|---|---|
   | Name | qualquer nome livre (ex.: `conecta-barra`) | idem |
   | Region | a mais próxima | idem |
   | Branch | `main` | `main` |
   | Language / Runtime | **Docker** (Dockerfile Path `./Dockerfile`, Docker Context `.`) | **Node** |
   | Build Command | *(não existe — o Dockerfile faz tudo)* | `npm ci --include=dev && npm run build:server` |
   | Start Command | *(vazio — usa o `CMD` do Dockerfile)* | `npm run start:server` |
   | Instance Type | **Free** | **Free** |

   O resultado é o mesmo servidor. Em Docker o Render **não** usa `NODE_VERSION` (a imagem já é Node 22).

4. Em **Advanced**: *Health Check Path* = `/api/health`; deixe **1 instância** (o tempo real guarda as conexões em memória — não aumente).
5. **Ainda não clique em Create**: vá ao passo 5 abaixo e cadastre as variáveis na seção *Environment Variables* da mesma tela (ou crie e depois adicione em **Environment**).
6. Após criar, o endereço aparece no topo (ex.: `https://conecta-barra.onrender.com` — **o nome que você escolheu**, com ou sem `-api`). **Use sempre o endereço exato mostrado no Render**: ele é o `EXPO_PUBLIC_API_URL` do passo 9 e o `API_URL` do passo 10. Se mudar o nome do serviço depois, o endereço muda e é preciso **recompilar o APK**.

*Atalho opcional:* o arquivo `render.yaml` é um "Blueprint" (New + → Blueprint). Ele já preenche tudo acima, mas **pede para você digitar cada segredo**; nada fica gravado nele.

Limites do plano Free: hiberna após ~15 min sem acessos (primeira abertura pode demorar ~30–60 s — o passo 10 resolve), 750 h/mês de instância, **bloqueia SMTP** (por isso o e-mail usa a API HTTPS da Brevo) e o disco é temporário (por isso tudo fica no banco).

---

## 5. Variáveis de ambiente do servidor (no Render → Environment)

Gere os segredos no seu computador (no Windows use o Git Bash ou WSL):
```bash
openssl rand -hex 32     # rode 2 vezes: uma para JWT_SECRET, outra para DATA_ENCRYPTION_KEY
```

| Variável | Valor | Obrigatória |
|---|---|---|
| `NODE_ENV` | `production` | sim |
| `NODE_VERSION` | `22` | só no modo Node (em Docker, ignorada) |
| `DATABASE_URL` | a conexão do passo 3 | sim |
| `DATABASE_SSL` | `true` | sim |
| `DB_CONNECTION_LIMIT` | `5` | recomendado |
| `JWT_SECRET` | 1º valor gerado (≥ 32 caracteres) | sim |
| `DATA_ENCRYPTION_KEY` | 2º valor gerado. **Guarde uma cópia fora do Render e nunca troque**: dados cifrados ficam ilegíveis. | sim |
| `ADMIN_USERNAME` | usuário que **você** escolhe para a gestão | sim |
| `ADMIN_PASSWORD` | senha forte que **você** escolhe (depois pode ser trocada em **Conta → Segurança da conta**; a trocada passa a valer) | sim |
| `ADMIN_FORCE_ENV_PASSWORD` | `true` **só** se esquecer a senha trocada no app: volta a valer `ADMIN_PASSWORD`. Depois volte para `false`. | não |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `ADMIN_NOTIFICATION_EMAIL` | passo 6 | recomendado |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | passo 7 | recomendado |
| `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_WEB_CLIENT_SECRET` | passo 8 | opcional |
| `REQUIRE_EMAIL_VERIFICATION` | `true` (padrão) ou `false` | opcional |
| `REQUIRE_RESIDENT_APPROVAL` | `true` = novos cadastros esperam aprovação da gestão | opcional |
| `PUBLIC_URL` | só se **não** usar Render (no Render é automático) | opcional |

Depois de salvar, o Render reinicia. Abra nos logs (**Logs**) o bloco `[config]`: ele marca `OK` / `FALTA` / `ATENÇÃO` para cada item e diz o que fazer. No navegador, abra também:

- `https://SEU-SERVIDOR.onrender.com/api/health` → deve mostrar `{"ok":true,...}`
- `https://SEU-SERVIDOR.onrender.com/api/health/config` → diagnóstico **sem segredos** (inclui o endereço de retorno do Google, se for usar)

O login da gestão (usuário/senha do `ADMIN_*`) fica **desativado** enquanto os dois não estiverem definidos.

---

## 6. Brevo — e-mail de confirmação e "esqueci a senha" (grátis, sem cartão)

Este era o ponto do erro "configuração do e-mail": o Render grátis **bloqueia SMTP** (portas 25/465/587), então o servidor envia por **API HTTPS** da Brevo.

1. Crie conta em <https://www.brevo.com> (plano **Free**: 300 e-mails/dia).
2. **Remetente:** Menu → *Senders, Domains & Dedicated IPs* → **Senders → Add a sender**. Informe nome ("Conecta Barra") e **um e-mail que você consegue abrir**. A Brevo manda um código para esse e-mail — **valide**. Sem validar, nenhum e-mail sai.
3. **Chave de API:** *SMTP & API* → aba **API Keys** → **Generate a new API key** → copie (começa com `xkeysib-`).
4. **Importante:** em *Security → Authorized IPs*, **deixe a restrição de IP desativada** (o Render grátis troca de IP; com restrição ativa a Brevo recusa).
5. No Render cadastre:
   - `BREVO_API_KEY` = a chave
   - `BREVO_SENDER_EMAIL` = **o mesmo e-mail validado** no item 2
   - `ADMIN_NOTIFICATION_EMAIL` = e-mail da gestão para receber avisos
6. **Teste:** entre no app como gestão → Painel → card **E-mails com falha** → botão **Enviar e-mail de teste**. A mensagem de erro (se houver) diz exatamente o que corrigir (chave inválida, remetente não validado, IP bloqueado…).

> **Risco honesto:** se o remetente for `@gmail.com`/`@outlook.com`, alguns provedores mandam o e-mail para **spam** (regras DMARC). Funciona na maioria das vezes, mas se falhar, o ideal é um e-mail de **domínio próprio** (domínio custa dinheiro; não é obrigatório). Alternativa sem custo: `REQUIRE_EMAIL_VERIFICATION=false` — o cadastro funciona sem código por e-mail (e sem "esqueci a senha" automático).

---

## 7. Firebase — notificações push (grátis, sem cartão)

Use o plano **Spark** (gratuito). **Não** ative Blaze (pede cartão).

1. Entre em <https://console.firebase.google.com> com uma conta Google → **Adicionar projeto** → nome `conecta-barra` → pode desativar o Google Analytics → **Criar**.
2. **Adicionar app → Android**. O **nome do pacote** precisa ser **exatamente** `com.conectabarra.app` (é o valor de `APP_PACKAGE_ID`; se mudar um, mude o outro). Apelido livre. Clique **Registrar app**.
3. **Baixe o `google-services.json`** e coloque **na raiz do projeto** (ao lado do `package.json`). **Não** envie ao GitHub (já está no `.gitignore`); o EAS o leva junto na compilação. Pode pular o resto do assistente.
4. **Chave do servidor:** ⚙ *Configurações do projeto* → aba **Contas de serviço** → **Gerar nova chave privada** → baixa um arquivo `.json`.
5. No Render, crie `FIREBASE_SERVICE_ACCOUNT_JSON` e **cole o conteúdo inteiro do arquivo `.json`** (ou, se o painel reclamar das quebras de linha, converta para base64: `base64 -w0 arquivo.json`). Depois **apague o arquivo** do computador ou guarde em lugar seguro; não suba ao GitHub.
6. Se, nos logs, aparecer erro de "API não habilitada", em <https://console.cloud.google.com> → APIs → habilite **Firebase Cloud Messaging API (V1)** para esse projeto.

Teste: com o app instalado e logado, o painel da gestão enviando um aviso deve gerar a notificação no celular. Em `/api/health/config` o item de push deve aparecer como configurado.

---

## 8. Login com Google (opcional)

Só necessário se quiser o botão "Continuar com Google". Sem ele, o app funciona normalmente com usuário e senha.

1. <https://console.cloud.google.com> → crie um projeto (ou use o do Firebase).
2. **APIs e serviços → Tela de permissão OAuth**: tipo **Externo**, preencha nome do app e e-mail; em *Público-alvo* deixe em **Teste** e adicione seu e-mail como usuário de teste (ou publique o app).
3. **Credenciais → Criar credenciais → ID do cliente OAuth → Tipo: Aplicativo da Web**.
4. Em **URIs de redirecionamento autorizados**, adicione exatamente: `https://SEU-SERVIDOR.onrender.com/api/auth/google/callback` (o valor certo também aparece em `/api/health/config`).
5. Copie **ID do cliente** e **Chave secreta** para `GOOGLE_WEB_CLIENT_ID` e `GOOGLE_WEB_CLIENT_SECRET` no Render.

---

## 9. Expo (EAS) — compilar o aplicativo (grátis, sem cartão)

1. Crie conta em <https://expo.dev/signup>.
2. No computador, na pasta do projeto:
   ```bash
   npx eas-cli login
   npx eas-cli init     # cria o projeto na SUA conta e mostra o projectId
   ```
   Se perguntar para criar o projeto, responda **Yes**. Copie o **projectId** (formato `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
3. Abra **`eas.json`** e troque os dois textos "COLOQUE-AQUI…" em `build → base → env`:
   ```json
   "EXPO_PUBLIC_API_URL": "https://conecta-barra-api.onrender.com",
   "EXPO_PUBLIC_EAS_PROJECT_ID": "o-projectId-copiado"
   ```
   O endereço é o do Render (passo 4), **sem barra no final e com `https://`**.
   Se o `eas init` acrescentar `owner`/`projectId` em outro arquivo, mantenha: o importante é que o ID coincida.
4. Confirme que `google-services.json` está na raiz (passo 7).
5. Confira tudo: `npm run setup:check` → todos os itens obrigatórios devem estar ✔.
6. **Compile o APK:**
   ```bash
   npm run build:apk      # usa `npx eas-cli` por dentro: não precisa instalar o eas globalmente
   ```
   Na primeira vez o EAS pergunta se deve gerar a *keystore* (assinatura): responda **Yes** e deixe o EAS guardá-la. Ao terminar, mostra um **link/QR** para baixar o `.apk`. Envie o link aos moradores ou baixe no celular e instale (permita "instalar apps desconhecidos").
7. **Para publicar na Google Play** (opcional; a conta de desenvolvedor Play **cobra taxa única** — fora do escopo "grátis"): `npm run build:aab`.

Observações:
- O plano grátis do EAS tem **cota mensal limitada** de compilações (em fila de baixa prioridade; pode levar de alguns minutos a mais de uma hora para começar). Ao acabar, espere o mês virar ou use a opção local abaixo.
- **Opção local (sem cota):** com Android Studio/JDK 17 instalados, `npm run build:apk:local` gera o APK no seu PC (`android/app/build/outputs/apk/release/`).
- **Quem já instalou o APK 2.0.0:** a 2.0.1 mudou só o JavaScript e o servidor, então basta `npm run update:ota -- "Correções 2.0.1"` (o app baixa na próxima abertura; pode levar duas aberturas) **e** reimplantar o servidor no Render. Não precisa novo APK.
- Atualizações só de código JavaScript podem ir **sem recompilar**: `npm run update:ota -- "mensagem"` (EAS Update, gratuito dentro dos limites). Mudou biblioteca nativa, pacote ou `app.config.ts` → compile outro APK.
- A mesma `keystore` precisa ser usada nas próximas versões para o app atualizar por cima; o EAS a guarda para você (`eas credentials` mostra/baixa — faça uma cópia de segurança).

---

## 10. Manter o servidor acordado (despertador grátis)

O Render Free dorme após ~15 min sem acessos. Escolha **uma** opção:

**A) GitHub Actions** (já incluído em `.github/workflows/keepalive.yml`)
1. No repositório: **Settings → Secrets and variables → Actions → aba Variables → New repository variable**.
2. Nome `API_URL`, valor `https://SEU-SERVIDOR.onrender.com` (sem barra no final).
3. Aba **Actions** → habilite os workflows → *keep-alive* → **Run workflow** para testar. Deve ficar verde.
> O GitHub pode atrasar execuções e **desativa agendamentos após 60 dias sem nenhuma atividade** no repositório: um commit qualquer ou "Enable workflow" reativa.

**B) cron-job.org** (independente do GitHub)
1. Crie conta grátis em <https://cron-job.org>.
2. **Create cronjob** → URL `https://SEU-SERVIDOR.onrender.com/api/health` → a cada **10 minutos** → salvar.

(UptimeRobot, plano grátis, também serve: monitor HTTP a cada 5 min na mesma URL.)

Aviso de transparência: o Render Free tem cota de 750 h/mês por conta. Um único serviço ligado 24 h cabe (≈ 744 h), mas **não** mantenha dois serviços Free ligados ao mesmo tempo na mesma conta.

---

## 11. Primeiro uso e testes (checklist)

- [ ] `/api/health` → `{"ok":true}`
- [ ] `/api/health/config` → itens obrigatórios OK
- [ ] No app, **Cadastrar** um morador de teste → conclui; com Brevo ativa, chega o código de 6 dígitos por e-mail
- [ ] **Esqueci a senha** envia e-mail
- [ ] Entrar como gestão (`ADMIN_USERNAME`/`ADMIN_PASSWORD`) → Painel: tocar em cada card de **Resumo rápido** e **Indicadores de gestão** abre a lista que forma o número
- [ ] Enviar aviso → notificação chega no celular (Firebase)
- [ ] Painel → E-mails com falha → **Enviar e-mail de teste**

---

## 12. Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| Compilação para com "COMPILAÇÃO INTERROMPIDA" | falta URL, projectId ou `google-services.json` | Faça o item indicado (passos 4, 7, 9) |
| App abre e diz "sem conexão"/demora muito | servidor dormindo (Render Free) | Aguarde ~1 min; configure o passo 10 |
| "Erro ao criar cadastro" | banco inacessível ou tabelas não criadas | `npm run db:push`; veja `/api/health/db`; confira `DATABASE_URL` e `DATABASE_SSL=true` |
| E-mail não chega | remetente não validado, chave errada, IP restrito, ou caiu no spam | Botão de e-mail de teste mostra a causa; passo 6 |
| Cadastro ficou "preso" após falha de e-mail | cadastro abandonado | Tente cadastrar de novo com os mesmos dados: a versão 2.0 libera cadastro não confirmado |
| Sem notificações | `google-services.json` ou chave Firebase de outro projeto / pacote diferente | Pacote = `com.conectabarra.app` nos dois; refaça passo 7 e **compile outro APK** |
| Servidor não sobe: "JWT_SECRET…" / "DATA_ENCRYPTION_KEY…" | variável ausente | Passo 5 |
| `db:push` reclama de chave primária na 2ª vez | normal no TiDB (não é idempotente) | `npm run db:check`; se disser OK, ignore |
| Aparecem vários administradores na lista de usuários | contas criadas por versões antigas/testes | Entre como gestão → Painel de usuários → aviso amarelo → **Remover administradores extras** (mantém só a conta logada) |
| Esqueci a senha da gestão trocada no app | — | No Render: `ADMIN_FORCE_ENV_PASSWORD=true`, entre com `ADMIN_PASSWORD`, depois volte para `false` |
| Google: `redirect_uri_mismatch` | URI diferente no Google Cloud | Copie de `/api/health/config` |
| Banco cheio | fotos no banco | Peça fotos menores; limpe registros antigos; acompanhe no TiDB |

---

## 13. Rodar tudo no seu computador (desenvolvimento)

```bash
cp .env.example .env     # preencha DATABASE_URL, JWT_SECRET, DATA_ENCRYPTION_KEY, ADMIN_*
npm install
npm run db:push
npm run dev              # servidor + app (Expo)
```

Alternativa com Docker: `docker compose up --build` (veja `docker-compose.yml`; ainda precisa de um MySQL/TiDB).

---

## 14. Limites e avisos honestos

- **Esta versão foi revisada e corrigida por leitura de código; não foi possível executar o app nem a checagem completa de tipos no ambiente de revisão** (sem rede/dependências). Rode `npm run check` e teste em um aparelho antes de distribuir.
- Planos gratuitos mudam. Confira limites atuais em cada site antes de contar com eles.
- **Backups:** a gestão tem exportação de dados, mas ela **não inclui fotos/mídia**. Guarde também uma cópia de `DATA_ENCRYPTION_KEY`.
- Tudo é gratuito **sem cartão**, exceto a eventual publicação na Google Play (taxa única) e domínio próprio para e-mail (opcional).
