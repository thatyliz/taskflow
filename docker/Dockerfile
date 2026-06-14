# =============================================================
# Kube News — Dockerfile
# Fase 1: Build manual de container Node.js
# Aprendizado: estrutura de imagem, layers, e boas práticas
# =============================================================

# Alpine reduz o tamanho da imagem final (~50MB x ~900MB no node:20 full)
# Neste projeto, Alpine foi escolhida para otimizar o tamanho do container,
# acelerando o pull da imagem e reduzindo a superfície de ataque.

FROM node:20.10.0-alpine3.18

LABEL org.opencontainers.image.title="kube-news" \
      org.opencontainers.image.description="News portal — SRE learning lab" \
      org.opencontainers.image.version="3.0.0" \
      org.opencontainers.image.authors="Thatiana Liz" \
      org.opencontainers.image.source="https://github.com/thatyliz/kube-news" 

WORKDIR /app

COPY taskflow/package*.json ./

RUN npm install

# Criação de usuário e grupo não-root para execução da aplicação
RUN addgroup -S taskflowgroup && adduser -S taskflowuser -G taskflowgroup

RUN chown -R taskflowuser:taskflowgroup /app

COPY --chown=taskflowuser:taskflowgroup taskflow/src ./src
COPY --chown=taskflowuser:taskflowgroup taskflow/public ./public
COPY --chown=taskflowuser:taskflowgroup taskflow/scripts ./scripts

# Executa o container com o usuário não-root
USER taskflowuser

EXPOSE 3000

CMD ["sh", "-c", "node src/config/migrate.js && node src/server.js"]
