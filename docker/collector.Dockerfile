FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY collector/package.json collector/package.json
COPY schema/package.json schema/package.json
# CI audits the full lockfile before building; keep network audits outside cached layers.
RUN npm ci --no-audit --no-fund

COPY collector collector
COPY schema schema
COPY plugin/src/shared/install-source.ts plugin/src/shared/install-source.ts
COPY plugin/src/shared/reviewed-descriptions.json plugin/src/shared/reviewed-descriptions.json
COPY config config

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai
ENV DATABASE_PATH=/app/runtime/dsh-top100.sqlite
ENV SOURCE_DATA_PATH=/app/data/plugins.json
ENV PUBLIC_DATA_DIR=/app/runtime/public-data

CMD ["npm", "run", "scheduler"]
