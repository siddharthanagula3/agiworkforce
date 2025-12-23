



if [ "$HOOK_EVENT_TYPE" != "SessionEnd" ]; then
  exit 0
fi


REPORT_DIR="$HOME/.agiworkforce/reports"
REPORT_FILE="$REPORT_DIR/session-$HOOK_SESSION_ID.txt"


mkdir -p "$REPORT_DIR"


cat > "$REPORT_FILE" << EOF
===========================================
AGI Workforce Session Report
===========================================

Session ID: $HOOK_SESSION_ID
Event Type: $HOOK_EVENT_TYPE
Timestamp:  $(date '+%Y-%m-%d %H:%M:%S')

Event Data:
$HOOK_EVENT_JSON

===========================================
Report generated at: $(date)
===========================================
EOF

echo "Session report generated: $REPORT_FILE"
exit 0
