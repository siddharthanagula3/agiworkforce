/**
 * CSS styles for the in-page chat overlay panel (Shadow DOM scope).
 *
 * Kept in a separate module so panel.ts stays under 300 LOC.
 * All selectors are scoped to :host / .agi-* so they cannot leak to the page.
 *
 * @module inPagePanel/panelStyles
 */
export function buildPanelStyles(): string {
  return `
    :host { display:block; }

    .agi-panel {
      position:fixed;
      top:0; right:-400px;
      width:380px; height:100vh;
      background:#fff;
      border-left:1px solid #e5e7eb;
      box-shadow:-4px 0 32px rgba(0,0,0,0.12);
      z-index:2147483647;
      display:flex; flex-direction:column;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      font-size:14px; color:#111827;
      transition:right 0.28s cubic-bezier(0.4,0,0.2,1);
      overflow:hidden;
      box-sizing:border-box;
    }

    .agi-panel.open { right:0; }

    /* ── Header ──────────────────────────────────────────────────────────── */
    .agi-header {
      display:flex; align-items:center;
      padding:14px 16px;
      border-bottom:1px solid #f3f4f6;
      background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);
      color:#fff;
      flex-shrink:0;
    }

    .agi-logo {
      font-size:15px; font-weight:700;
      letter-spacing:-0.3px;
      flex:1;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }

    .agi-provider-pill {
      font-size:11px; font-weight:600;
      background:rgba(255,255,255,0.2);
      border-radius:12px;
      padding:3px 10px;
      margin-right:10px;
      white-space:nowrap;
      max-width:120px; overflow:hidden; text-overflow:ellipsis;
      cursor:default;
    }

    .agi-close-btn {
      background:transparent; border:none; cursor:pointer;
      color:#fff; font-size:18px;
      width:28px; height:28px;
      display:flex; align-items:center; justify-content:center;
      border-radius:50%;
      transition:background 0.15s;
      line-height:1;
      flex-shrink:0;
    }
    .agi-close-btn:hover { background:rgba(255,255,255,0.2); }

    /* ── Quick actions ───────────────────────────────────────────────────── */
    .agi-actions-row {
      display:flex; gap:6px; flex-wrap:wrap;
      padding:12px 14px 0;
      flex-shrink:0;
    }

    .agi-action-chip {
      display:inline-flex; align-items:center; gap:4px;
      padding:5px 12px;
      background:#f3f4f6; border:1px solid #e5e7eb;
      border-radius:20px;
      font-size:12px; font-weight:600; color:#374151;
      cursor:pointer;
      transition:background 0.15s,border-color 0.15s,color 0.15s;
      white-space:nowrap;
    }
    .agi-action-chip:hover {
      background:#ede9fe; border-color:#c4b5fd; color:#5b21b6;
    }

    /* ── Response area ───────────────────────────────────────────────────── */
    .agi-response-area {
      flex:1; overflow-y:auto;
      padding:14px;
      font-size:13.5px; line-height:1.6; color:#1f2937;
      word-break:break-word;
    }

    .agi-response-area:empty::before {
      content:"Ask anything about this page…";
      color:#9ca3af; font-style:italic;
    }

    .agi-response-area .agi-thinking {
      display:inline-block;
      width:6px; height:14px;
      background:#6366f1;
      border-radius:2px;
      animation:agi-blink 0.9s step-end infinite;
      vertical-align:text-bottom;
      margin-left:1px;
    }

    @keyframes agi-blink {
      0%,100% { opacity:1; } 50% { opacity:0; }
    }

    .agi-error {
      color:#dc2626; font-size:13px;
      background:#fef2f2; border:1px solid #fecaca;
      border-radius:8px; padding:10px 12px;
      margin-top:6px;
    }

    /* ── Composer ────────────────────────────────────────────────────────── */
    .agi-composer {
      display:flex; gap:8px; align-items:flex-end;
      padding:10px 14px 14px;
      border-top:1px solid #f3f4f6;
      background:#fafafa;
      flex-shrink:0;
    }

    .agi-textarea {
      flex:1;
      resize:none; border:1px solid #d1d5db;
      border-radius:8px; padding:9px 12px;
      font-size:13px; font-family:inherit; color:#111827;
      background:#fff; outline:none;
      min-height:40px; max-height:120px;
      line-height:1.5;
      transition:border-color 0.15s,box-shadow 0.15s;
    }
    .agi-textarea:focus {
      border-color:#6366f1;
      box-shadow:0 0 0 3px rgba(99,102,241,0.15);
    }

    .agi-submit-btn {
      width:38px; height:38px;
      background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);
      border:none; border-radius:8px; cursor:pointer; color:#fff;
      font-size:16px;
      display:flex; align-items:center; justify-content:center;
      flex-shrink:0;
      transition:opacity 0.15s,transform 0.15s;
    }
    .agi-submit-btn:hover { opacity:0.9; }
    .agi-submit-btn:active { transform:scale(0.93); }
    .agi-submit-btn:disabled { opacity:0.45; cursor:default; }

    /* ── Footer ──────────────────────────────────────────────────────────── */
    .agi-footer {
      display:flex; justify-content:center;
      padding:8px 14px 10px;
      background:#fafafa;
      border-top:1px solid #f3f4f6;
      flex-shrink:0;
    }

    .agi-open-side-panel {
      background:transparent; border:1px solid #d1d5db;
      border-radius:6px; padding:5px 12px;
      font-size:12px; font-weight:500; color:#6b7280; cursor:pointer;
      transition:background 0.15s,border-color 0.15s,color 0.15s;
      white-space:nowrap;
    }
    .agi-open-side-panel:hover {
      background:#f3f4f6; border-color:#9ca3af; color:#374151;
    }
  `;
}
