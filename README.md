# Conecta Barra 2.0

Aplicativo (Expo / React Native) + servidor (Express + tRPC + MySQL) de comunicação e gestão de moradores.

**Esta versão não traz nenhuma conta pré-configurada.** Você cria as suas (GitHub, TiDB Cloud, Render, Brevo, Firebase, Expo) e informa os dados em variáveis. Tudo com planos gratuitos e sem cartão.

- 📘 **Passo a passo completo:** [`GUIA-DE-IMPLANTACAO.md`](./GUIA-DE-IMPLANTACAO.md)
- 🔎 **Erros encontrados e corrigidos:** [`ERROS-ENCONTRADOS.md`](./ERROS-ENCONTRADOS.md)
- ✅ **O que falta configurar:** `npm run setup:check`

## Resumo

| Peça | Onde fica |
|---|---|
| Código | GitHub |
| Banco | TiDB Cloud Starter |
| Servidor (`server/`) | Render (Web Service Free) |
| E-mail | Brevo (API HTTPS) |
| Push | Firebase Cloud Messaging |
| APK | Expo EAS Build |

## Comandos

```bash
npm install
npm run setup:check      # lista contas/repositórios necessários e o que falta
npm run db:push          # cria as tabelas no banco (uma vez)
npm run dev              # servidor + app em desenvolvimento
npm run build:server     # gera dist/ do servidor (usado no Render)
npm run build:apk        # compila o APK no Expo EAS (exige configuração completa)
npm run build:aab        # pacote para Google Play
npm run build:apk:local  # compila no próprio PC (Android Studio + JDK 17)
npm run check            # checagem de tipos
```

A compilação é **interrompida** com uma mensagem explicativa se faltar: URL do servidor, ID do projeto Expo ou `google-services.json`.

Diagnóstico do servidor (sem segredos): `https://SEU-SERVIDOR/api/health/config`.
