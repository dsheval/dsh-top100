FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY collector/package.json collector/package.json
COPY schema/package.json schema/package.json
# CI audits the full lockfile before building; keep network audits outside cached layers.
RUN npm ci --no-audit --no-fund

COPY collector collector
COPY schema schema
COPY plugin/src/shared plugin/src/shared
COPY plugin/src/install/install-spec.ts plugin/src/install/install-spec.ts
COPY plugin/src/install/install-verify.ts plugin/src/install/install-verify.ts
COPY plugin/src/install/npm-selector.ts plugin/src/install/npm-selector.ts
COPY config config

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai
ENV DATABASE_PATH=/app/runtime/dsh-top100.sqlite
ENV SOURCE_DATA_PATH=/app/data/plugins.json
ENV PUBLIC_DATA_DIR=/app/runtime/public-data

CMD ["npm", "run", "scheduler"]
