#!/bin/bash
# Example hook: Log all events to a file

LOG_FILE="$HOME/.agiworkforce/hook-events.log"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Get current timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Log the event
echo "[$TIMESTAMP] Event: $HOOK_EVENT_TYPE | Session: $HOOK_SESSION_ID" >> "$LOG_FILE"

# Optionally log full JSON (can be verbose)
# echo "[$TIMESTAMP] $HOOK_EVENT_JSON" >> "$LOG_FILE"

# Exit successfully
exit 0
