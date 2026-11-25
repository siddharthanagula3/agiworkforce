#!/bin/bash
# Stands in for the hosting platform's timer: calls the schedule sweep the way the platform does.
# Production calls it every 15 minutes; here every 2 minutes so a test does not wait a quarter hour.
# Usage: clock.sh start | stop
D=$HOME/.cache/agi-audit/web-lane
case "${1:-start}" in
  start)
    SECRET=$(grep -E '^CRON_SECRET=' "${AGI_CHECKOUT:-$HOME/Desktop/agiworkforce}/apps/web/.env.local" | tail -1 | cut -d= -f2- | tr -d '"')
    (
      while true; do
        code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SECRET" http://localhost:3000/api/cron/run-schedules)
        echo "$(date '+%H:%M:%S') run-schedules $code" >> "$D/logs/clock.log"
        sleep 120
      done
    ) &
    echo $! > "$D/pids/clock.pid"
    echo "clock started"
    ;;
  stop)
    [ -f "$D/pids/clock.pid" ] && kill "$(cat "$D/pids/clock.pid")" 2>/dev/null
    rm -f "$D/pids/clock.pid"
    echo "clock stopped"
    ;;
esac
