


LOG_FILE="$HOME/.agiworkforce/hook-events.log"


mkdir -p "$(dirname "$LOG_FILE")"


TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')


echo "[$TIMESTAMP] Event: $HOOK_EVENT_TYPE | Session: $HOOK_SESSION_ID" >> "$LOG_FILE"





exit 0
