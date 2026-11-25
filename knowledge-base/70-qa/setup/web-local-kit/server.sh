#!/bin/bash
# Start or stop the local compiled web app for the web-lane human-style runs.
# Usage: server.sh start [rate-limit-scale] | stop | status
W=${AGI_CHECKOUT:-$HOME/Desktop/agiworkforce}
D=$HOME/.cache/agi-audit/web-lane
L=$D/logs
P=$D/pids
mkdir -p "$L" "$P"

stop_one() { [ -f "$P/$1.pid" ] && kill "$(cat "$P/$1.pid")" 2>/dev/null; rm -f "$P/$1.pid"; }

case "${1:-status}" in
  start)
    SCALE="${2:-4}"
    cd "$W" || exit 2
    if ! redis-cli -p 6379 ping >/dev/null 2>&1; then
      redis-server --port 6379 --bind 127.0.0.1 --save "" --appendonly no --daemonize yes --logfile "$L/redis.log" --dir "$D" --pidfile "$P/redis.pid"
      echo "started local redis on 6379"; touch "$P/redis.mine"
    fi
    node scripts/dev-db-ws-proxy.mjs > "$L/ws.log" 2>&1 &
    echo $! > "$P/ws.pid"
    node infrastructure/sandbox/dev.mjs --port 3210 --extension-id eklnfbegeeidfblbmkcblolipefganpj > "$L/sandbox.log" 2>&1 &
    echo $! > "$P/sandbox.pid"
    cd apps/web || exit 2
    set -a; source .env.local; set +a
    export NEXT_PUBLIC_APP_URL=http://localhost:3000 NEXT_PUBLIC_SITE_URL=http://localhost:3000 NEXT_PUBLIC_SANDBOX_ORIGIN=http://localhost:3210
    export VERCEL_ENV=preview AGI_ALLOW_INVALID_ENV=1 NEXT_TELEMETRY_DISABLED=1 UPLOAD_SCAN_REQUIRED=false AGI_RATE_LIMIT_SCALE="$SCALE"
    export KV_REST_API_URL= KV_REST_API_TOKEN= KV_REST_API_READ_ONLY_TOKEN= KV_URL= REDIS_URL= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN=
    RUNLOG="$L/server-$(date +%Y%m%dT%H%M%S).log"
    ln -sfn "$RUNLOG" "$L/server-current.log"
    nohup pnpm exec next start -p 3000 > "$RUNLOG" 2>&1 &
    echo $! > "$P/web.pid"
    for i in $(seq 1 40); do
      curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/login 2>/dev/null | grep -q 200 && { echo "web up after ${i}s (rate-limit scale $SCALE)"; exit 0; }
      sleep 1
    done
    echo "web did not answer in 40s"; tail -20 "$L/server-current.log"; exit 1
    ;;
  stop)
    stop_one web; stop_one ws; stop_one sandbox
    pkill -f "next-server.*web-lane" 2>/dev/null
    lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null
    if [ -f "$P/redis.mine" ]; then redis-cli -p 6379 shutdown nosave >/dev/null 2>&1; rm -f "$P/redis.mine" "$P/redis.pid"; fi
    echo stopped
    ;;
  status)
    for port in 3000 3210 5433 6379 5432; do printf "%s: " $port; lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null | head -1 || true; echo; done
    ;;
esac
