import { getExtensionTokensCssAuto } from '../../../tokens';

export function buildPanelStyles(): string {
  return `
    /* ── AGI design tokens follow the browser/OS colour scheme ── */
    ${getExtensionTokensCssAuto(':host')}

    :host { display:block; }

    .agi-panel {
      position:fixed;
      top:8px; bottom:8px; right:-400px;
      width:min(380px, 100vw); max-width:100vw; height:auto;
      background:var(--agi-ext-bg);
      border:1px solid var(--agi-ext-border-strong);
      border-right:0;
      border-radius:18px 0 0 18px;
      box-shadow:-12px 0 40px color-mix(in srgb, black 24%, transparent);
      z-index:2147483647;
      display:flex; flex-direction:column;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      font-size:14px; color:var(--agi-ext-text);
      transition:right 0.24s cubic-bezier(0.4,0,0.2,1);
      overflow:hidden;
      box-sizing:border-box;
    }

    .agi-panel.open { right:0; }

    /* ── Header ──────────────────────────────────────────────────────────── */
    .agi-header {
      display:flex; align-items:center;
      padding:12px 14px;
      border-bottom:1px solid var(--agi-ext-border);
      background:var(--agi-ext-surface);
      color:var(--agi-ext-text);
      flex-shrink:0;
    }

    .agi-logo {
      font-size:15px; font-weight:700;
      letter-spacing:0;
      flex:1;
      min-width:28px;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }

    .agi-provider-pill {
      font-size:11px; font-weight:600;
      background:color-mix(in srgb, var(--agi-ext-accent) 12%, transparent);
      border:1px solid color-mix(in srgb, var(--agi-ext-accent) 34%, transparent);
      color:var(--agi-ext-accent);
      border-radius:12px;
      padding:3px 8px;
      margin-right:8px;
      white-space:nowrap;
      flex-shrink:0;
      cursor:default;
    }

    .agi-close-btn {
      background:transparent; border:none; cursor:pointer;
      color:var(--agi-ext-text-muted); font-size:18px;
      width:28px; height:28px;
      display:flex; align-items:center; justify-content:center;
      border-radius:50%;
      transition:background 0.15s;
      line-height:1;
      flex-shrink:0;
    }
    .agi-close-btn:hover { background:var(--agi-ext-hover); color:var(--agi-ext-text); }

    /* ── Quick actions ───────────────────────────────────────────────────── */
    .agi-actions-row {
      display:flex; gap:6px; flex-wrap:wrap;
      padding:12px 14px 0;
      flex-shrink:0;
    }

    .agi-action-chip {
      display:inline-flex; align-items:center; gap:4px;
      padding:5px 11px;
      background:var(--agi-ext-surface); border:1px solid var(--agi-ext-border);
      border-radius:20px;
      font-size:12px; font-weight:500; color:var(--agi-ext-text-muted);
      cursor:pointer;
      transition:background 0.15s,border-color 0.15s,color 0.15s;
      white-space:nowrap;
    }
    .agi-action-chip:hover {
      background:var(--agi-ext-hover); border-color:var(--agi-ext-accent); color:var(--agi-ext-accent);
    }
    .agi-action-chip:disabled { opacity:0.48; cursor:default; }

    /* ── Response area ───────────────────────────────────────────────────── */
    .agi-response-area {
      flex:1; overflow-y:auto;
      padding:14px;
      font-size:13.5px; line-height:1.6; color:var(--agi-ext-text);
      word-break:break-word;
    }

    .agi-response-area:empty::before {
      content:"Ask anything about this page…";
      color:var(--agi-ext-text-muted); font-style:italic;
    }

    .agi-response-area .agi-thinking {
      display:inline-block;
      width:6px; height:14px;
      background:var(--agi-ext-accent);
      border-radius:2px;
      animation:agi-blink 0.9s step-end infinite;
      vertical-align:text-bottom;
      margin-left:1px;
    }

    @keyframes agi-blink {
      0%,100% { opacity:1; } 50% { opacity:0; }
    }

    .agi-access-state {
      color:var(--agi-ext-text); font-size:13px;
      background:var(--agi-ext-surface); border:1px solid var(--agi-ext-border-strong);
      border-radius:12px; padding:12px;
      margin-top:6px;
    }
    .agi-access-state--retryable_error,
    .agi-access-state--account_unavailable,
    .agi-access-state--rate_limited,
    .agi-access-state--request_rejected {
      background:var(--agi-ext-danger-bg);
      border-color:var(--agi-ext-danger-border);
    }
    .agi-access-state-title { font-weight:650; margin-bottom:4px; }
    .agi-access-state-message { color:var(--agi-ext-text-muted); margin-bottom:9px; }
    .agi-access-state--cancelled .agi-access-state-message { margin-bottom:0; }
    .agi-state-action {
      border:1px solid var(--agi-ext-border-strong); border-radius:999px;
      padding:6px 11px; background:var(--agi-ext-surface); color:var(--agi-ext-text);
      font:inherit; font-weight:600; cursor:pointer;
    }
    .agi-state-action:hover { background:var(--agi-ext-hover); }

    .agi-disclosure {
      color:var(--agi-ext-text-muted); font-size:11px;
      background:var(--agi-ext-bg); border-top:1px solid var(--agi-ext-border);
      padding:8px 14px 0;
      line-height:1.4; flex-shrink:0;
    }

    /* ── Composer ────────────────────────────────────────────────────────── */
    .agi-composer {
      display:flex; gap:8px; align-items:flex-end;
      padding:10px 14px 14px;
      border-top:1px solid var(--agi-ext-border);
      background:var(--agi-ext-bg);
      flex-shrink:0;
    }

    .agi-textarea {
      flex:1;
      resize:none; border:1px solid var(--agi-ext-border);
      border-radius:16px; padding:10px 12px;
      font-size:13px; font-family:inherit; color:var(--agi-ext-text);
      background:var(--agi-ext-surface); outline:none;
      min-height:40px; max-height:120px;
      line-height:1.5;
      transition:border-color 0.15s,box-shadow 0.15s;
    }
    .agi-textarea:focus-visible {
      border-color:var(--agi-ext-accent);
      box-shadow:0 0 0 3px color-mix(in srgb, var(--agi-ext-focus) 20%, transparent);
    }

    .agi-submit-btn {
      width:34px; height:34px;
      background:var(--agi-ext-accent);
      border:none; border-radius:50%; cursor:pointer; color:var(--agi-ext-on-accent);
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
      background:var(--agi-ext-bg);
      border-top:1px solid var(--agi-ext-border);
      flex-shrink:0;
    }

    .agi-open-side-panel {
      background:transparent; border:1px solid var(--agi-ext-border-strong);
      border-radius:6px; padding:5px 12px;
      font-size:12px; font-weight:500; color:var(--agi-ext-text-muted); cursor:pointer;
      transition:background 0.15s,border-color 0.15s,color 0.15s;
      white-space:nowrap;
    }
    .agi-open-side-panel:hover {
      background:var(--agi-ext-hover); border-color:var(--agi-ext-text-muted); color:var(--agi-ext-text);
    }

    button:focus-visible {
      outline:2px solid var(--agi-ext-focus);
      outline-offset:2px;
    }

    @media (max-width:500px) {
      .agi-panel { top:0; bottom:0; border-radius:0; }
      .agi-actions-row { flex-wrap:nowrap; overflow-x:auto; padding-bottom:4px; }
      .agi-action-chip { flex:0 0 auto; }
    }

    @media (prefers-reduced-motion: reduce) {
      .agi-panel, .agi-close-btn, .agi-action-chip, .agi-textarea,
      .agi-submit-btn, .agi-open-side-panel, .agi-state-action { transition:none; }
      .agi-response-area .agi-thinking { animation:none; }
    }

    @media (forced-colors: active) {
      .agi-panel, .agi-action-chip, .agi-composer, .agi-disclosure,
      .agi-textarea, .agi-access-state, .agi-state-action,
      .agi-open-side-panel { forced-color-adjust:auto; }
      .agi-provider-pill { color:Highlight; border-color:Highlight; }
      .agi-submit-btn { background:Highlight; color:HighlightText; }
      .agi-response-area .agi-thinking { background:Highlight; }
    }
  `;
}
