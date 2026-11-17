# Backend do Conecta Barra (API + WebSocket). Imagem enxuta: não instala nada do app Android.
FROM node:22-slim AS build
WORKDIR /app
COPY deploy/server-package.json package.json
RUN npm install
COPY server ./server
COPY shared ./shared
COPY drizzle ./drizzle
COPY drizzle.config.ts tsconfig.json ./
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/shared ./shared
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
