# syntax=docker/dockerfile:1
#
# Build context is the repository root, not this directory:
#   docker build -f apps/web/Dockerfile .
# The root .dockerignore keeps .git, node_modules and every .env out of it.
# docs/runbooks/web-container-portability-drill.md owns the operating procedure.

ARG NODE_BUILD_IMAGE=node:24-bookworm
ARG NODE_RUNTIME_IMAGE=node:24-bookworm-slim

FROM ${NODE_BUILD_IMAGE} AS builder

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
RUN corepack enable

WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile

ARG AGI_RELEASE_SHA
ARG DATABASE_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_AGI_BOT_PROTECTION=off
ARG NODE_HEAP_MB=6144

ENV AGI_WEB_STANDALONE=1
ENV AGI_BOT_PROTECTION=${NEXT_PUBLIC_AGI_BOT_PROTECTION}
ENV NEXT_PUBLIC_AGI_BOT_PROTECTION=${NEXT_PUBLIC_AGI_BOT_PROTECTION}
ENV AGI_RELEASE_SHA=${AGI_RELEASE_SHA}
ENV DATABASE_URL=${DATABASE_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
ENV NODE_OPTIONS=--max-old-space-size=${NODE_HEAP_MB}

RUN pnpm --filter @agiworkforce/web build

FROM ${NODE_RUNTIME_IMAGE} AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV WORKFLOW_TARGET_WORLD=local
ENV WORKFLOW_LOCAL_DATA_DIR=/app/workflow-data
ENV WORKFLOW_NODE_HTTP=1

WORKDIR /app

COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /repo/apps/web/public ./apps/web/public

RUN mkdir -p ${WORKFLOW_LOCAL_DATA_DIR} && chown node:node ${WORKFLOW_LOCAL_DATA_DIR}

USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=10s --start-period=45s --retries=8 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
