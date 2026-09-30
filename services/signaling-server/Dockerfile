FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS deps

WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches/ ./patches/
COPY services/signaling-server/package.json ./services/signaling-server/package.json
RUN corepack enable && pnpm install --filter @agiworkforce/signaling-server... --frozen-lockfile --ignore-scripts

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS builder

WORKDIR /workspace
COPY --from=deps /workspace/ ./
COPY services/signaling-server/tsconfig.docker.json ./services/signaling-server/tsconfig.json
COPY services/signaling-server/src/ ./services/signaling-server/src/
RUN corepack enable && pnpm --filter @agiworkforce/signaling-server run build

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS prod-deps

WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches/ ./patches/
COPY services/signaling-server/package.json ./services/signaling-server/package.json
RUN corepack enable && pnpm install --filter @agiworkforce/signaling-server... --prod --frozen-lockfile --ignore-scripts

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS production

RUN rm -rf /usr/local/lib/node_modules/npm && \
    rm -f /usr/local/bin/npm /usr/local/bin/npx && \
    apk add --no-cache dumb-init && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 signaling

WORKDIR /workspace/services/signaling-server
COPY --from=prod-deps --chown=signaling:nodejs /workspace/node_modules/ /workspace/node_modules/
COPY --from=prod-deps --chown=signaling:nodejs /workspace/services/signaling-server/node_modules/ ./node_modules/
COPY --from=builder --chown=signaling:nodejs /workspace/services/signaling-server/dist/ ./dist/
COPY --chown=signaling:nodejs services/signaling-server/package.json ./

USER signaling
ENV NODE_ENV=production \
    PORT=4000 \
    SIGNALING_HOST=0.0.0.0 \
    SIGNALING_WS_PATH=/ws
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:4000/ready || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
