FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

RUN rm -rf /usr/local/lib/node_modules /opt/yarn-* && \
    rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg && \
    apk add --no-cache clamav-daemon clamav-libunrar dumb-init && \
    addgroup -S -g 1001 scanner && \
    adduser -S -D -H -u 1001 -G scanner scanner && \
    mkdir -p /var/lib/clamav && \
    chown scanner:scanner /var/lib/clamav

COPY clamav/clamd.conf clamav/freshclam.conf /etc/clamav/

USER scanner

RUN freshclam --config-file=/etc/clamav/freshclam.conf --stdout

WORKDIR /app

COPY package.json ./
COPY src/ ./src/

ENV NODE_ENV=production \
    PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/health || exit 1

ENTRYPOINT ["dumb-init", "--single-child", "--"]

CMD ["node", "src/index.ts"]
