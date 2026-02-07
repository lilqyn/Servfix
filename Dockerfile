# syntax=docker/dockerfile:1
FROM node:22-bookworm AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
ARG VITE_API_BASE
ENV VITE_API_BASE=$VITE_API_BASE
ENV NODE_ENV=production
ARG PRISMA_SCHEMA_HASH
ENV PRISMA_SCHEMA_HASH=$PRISMA_SCHEMA_HASH
RUN npx prisma generate --schema prisma/schema.prisma
RUN npm run build && npm run build:server
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
EXPOSE 4000
CMD ["node", "server/dist/index.js"]
