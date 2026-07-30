# syntax=docker/dockerfile:1.7

# Build from the monorepo root:
#   docker build --file services/api-gateway/Dockerfile .
#
# The gateway consumes workspace packages, so a service-directory build
# context cannot produce a correct or reproducible image.
FROM node:24.13.0-alpine3.23 AS base

RUN corepack enable && corepack prepare pnpm@9.15.3 --activate

FROM base AS pruner
WORKDIR /workspace

COPY . .
RUN pnpm dlx turbo@2.10.5 prune @agiworkforce/api-gateway --docker --out-dir /out

FROM base AS installer
WORKDIR /app

# Install from the pruned manifest and lockfile before copying source so source
# edits do not invalidate the dependency layer.
COPY --from=pruner /out/json/ ./
COPY --from=pruner /out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

COPY --from=pruner /out/full/ ./
# Turbo prune does not include this root config even though workspace package
# tsconfigs extend it.
COPY tsconfig.base.json ./tsconfig.base.json

RUN pnpm --filter @agiworkforce/api-gateway build
# Bundle workspace TypeScript and production dependencies into a real Node
# artifact. The workspace packages intentionally expose TypeScript source for
# app bundlers; plain tsc output cannot be executed by Node on a clean host.
RUN pnpm exec esbuild services/api-gateway/src/index.ts \
  --bundle \
  --platform=node \
  --target=node24 \
  --format=cjs \
  --sourcemap \
  --outfile=/bundle/index.js \
  --external:bufferutil \
  --external:utf-8-validate

FROM node:24.13.0-alpine3.23 AS production

ARG RELEASE_SHA=development

RUN apk add --no-cache dumb-init \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs gateway

WORKDIR /app

COPY --from=installer --chown=gateway:nodejs /bundle/index.js ./dist/index.js
COPY --from=installer --chown=gateway:nodejs /bundle/index.js.map ./dist/index.js.map
COPY --from=installer --chown=gateway:nodejs /app/services/api-gateway/package.json ./package.json

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    RELEASE_SHA=${RELEASE_SHA}

LABEL org.opencontainers.image.source="https://github.com/agiworkforce/agiworkforce" \
      org.opencontainers.image.revision="${RELEASE_SHA}"

USER gateway
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
