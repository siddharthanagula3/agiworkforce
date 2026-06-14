/**
 * SurfaceMockups — code-rendered UI mockups for AGI surfaces.
 *
 * Each component faithfully reproduces the real surface layout:
 * phone portrait for Mobile, full browser window with side panel for Chrome,
 * full-width editor with AGI panel for VS Code.
 * No screenshots — rendered in CSS so they stay sharp on every display.
 */

/* ─────────────────────────── AGI Mobile ───────────────────────────── */

export function MobileMockup() {
  return (
    <figure className="agi-sm agi-sm--mobile" aria-label="AGI Mobile interface">
      {/* Phone shell */}
      <div className="agi-sm-phone">
        {/* Status bar */}
        <div className="agi-sm-status" aria-hidden="true">
          <span className="agi-sm-time">11:10</span>
          <span className="agi-sm-signal">
            <i />
            <i />
            <i />
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
              <path
                d="M1 8.5C2.8 5.5 5.2 4 7 4s4.2 1.5 6 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M3.5 8.5C4.8 6.8 5.8 6 7 6s2.2.8 3.5 2.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="7" cy="9" r="1" fill="currentColor" />
            </svg>
            <svg width="22" height="11" viewBox="0 0 22 11" fill="none">
              <rect
                x="0.5"
                y="0.5"
                width="18"
                height="10"
                rx="2.5"
                stroke="currentColor"
                strokeOpacity="0.35"
              />
              <rect x="1.5" y="1.5" width="14" height="8" rx="1.5" fill="currentColor" />
              <path d="M20 3.5v4a1.5 1.5 0 000-4z" fill="currentColor" fillOpacity="0.4" />
            </svg>
          </span>
        </div>

        {/* Nav bar */}
        <div className="agi-sm-nav" aria-hidden="true">
          <span className="agi-sm-hamburger">☰</span>
          <span className="agi-sm-app-name">AGI</span>
          <span className="agi-sm-compose">✎</span>
        </div>

        {/* Main area */}
        <div className="agi-sm-main" aria-hidden="true">
          {/* Mode toggle */}
          <div className="agi-sm-mode-toggle">
            <span className="agi-sm-mode-btn agi-sm-mode-btn--active">⊞ Local</span>
            <span className="agi-sm-mode-btn">☁ Cloud</span>
          </div>

          {/* Greeting */}
          <p className="agi-sm-greeting">How can I help you tonight?</p>
          <p className="agi-sm-sub">
            Start privately on this device. Use the sidebar for recents and projects.
          </p>
        </div>

        {/* Composer area */}
        <div className="agi-sm-composer-wrap" aria-hidden="true">
          <div className="agi-sm-project-bar">
            <span>⊟ No project</span>
            <span className="agi-sm-chevron">∨</span>
          </div>
          <div className="agi-sm-composer">
            <p className="agi-sm-placeholder">What's on your mind?</p>
            <div className="agi-sm-composer-foot">
              <span className="agi-sm-attach">+</span>
              <span className="agi-sm-model">⊡ AGI Standard ∨</span>
              <span className="agi-sm-mic">🎙</span>
              <span className="agi-sm-send">➤</span>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}

/* ─────────────────────────── VS Code Extension ─────────────────────── */

export function VSCodeMockup() {
  return (
    <figure className="agi-sm agi-sm--vscode" aria-label="AGI VS Code extension interface">
      <div className="agi-sm-vscode-shell">
        {/* Title bar */}
        <div className="agi-sm-vscode-chrome" aria-hidden="true">
          <span className="agi-hw-lights">
            <i />
            <i />
            <i />
          </span>
          <span className="agi-sm-vscode-title">workspace.ts | AGI in VS Code</span>
          <span className="agi-hw-surface">VS CODE</span>
        </div>

        <div className="agi-sm-vscode-body" aria-hidden="true">
          {/* Activity bar */}
          <div className="agi-sm-vscode-activity">
            <span>⊞</span>
            <span>⊘</span>
            <span className="agi-sm-vscode-act--active">◈</span>
            <span>⊙</span>
            <span>⊗</span>
            <span>⊕</span>
          </div>

          {/* Editor gutter — more lines for height */}
          <div className="agi-sm-vscode-editor">
            <div className="agi-sm-vscode-code">
              <span className="agi-sm-vscode-ln">1</span>
              <span>
                <em className="agi-sm-vscode-kw">import</em>{' '}
                <span className="agi-sm-vscode-dim">
                  {'{'} processChat, ChatConfig {'}'}
                </span>
              </span>
              <span className="agi-sm-vscode-ln">2</span>
              <span>
                <em className="agi-sm-vscode-kw">from</em>{' '}
                <span className="agi-sm-vscode-fn">'@agi/sdk'</span>
              </span>
              <span className="agi-sm-vscode-ln">3</span>
              <span className="agi-sm-vscode-dim">&nbsp;</span>
              <span className="agi-sm-vscode-ln">4</span>
              <span>
                <em className="agi-sm-vscode-kw">export async function</em>{' '}
                <span className="agi-sm-vscode-fn">runChat</span>
                <span className="agi-sm-vscode-dim">(</span>
              </span>
              <span className="agi-sm-vscode-ln">5</span>
              <span className="agi-sm-vscode-dim indent">
                {' '}
                config<span className="agi-sm-vscode-punc">:</span>{' '}
                <span className="agi-sm-vscode-type">ChatConfig</span>
              </span>
              <span className="agi-sm-vscode-ln">6</span>
              <span className="agi-sm-vscode-dim">
                {')'} <span className="agi-sm-vscode-punc">:</span>{' '}
                <span className="agi-sm-vscode-type">Promise</span>
                {'<string>'} {'{'}
              </span>
              <span className="agi-sm-vscode-ln">7</span>
              <span className="agi-sm-vscode-dim indent">
                <em className="agi-sm-vscode-kw">const</em> stream{' '}
                <span className="agi-sm-vscode-punc">=</span>
              </span>
              <span className="agi-sm-vscode-ln">8</span>
              <span className="agi-sm-vscode-dim indent">
                &nbsp;&nbsp;<span className="agi-sm-vscode-kw">await</span>{' '}
                <span className="agi-sm-vscode-fn">processChat</span>(config)
              </span>
              <span className="agi-sm-vscode-ln">9</span>
              <span className="agi-sm-vscode-dim indent">
                <em className="agi-sm-vscode-kw">return</em> stream.text()
              </span>
              <span className="agi-sm-vscode-ln">10</span>
              <span className="agi-sm-vscode-dim">{'}'}</span>
            </div>
          </div>

          {/* AGI panel */}
          <div className="agi-sm-vscode-panel">
            <div className="agi-sm-vscode-panel-header">
              <span className="agi-sm-vscode-panel-title">AGI</span>
              <span className="agi-sm-vscode-panel-badge">@agi</span>
            </div>

            <div className="agi-sm-vscode-chat">
              <div className="agi-sm-vscode-msg agi-sm-vscode-msg--user">
                <span className="agi-sm-vscode-avatar">U</span>
                <div>
                  <p>@agi explain runChat and add error handling</p>
                </div>
              </div>
              <div className="agi-sm-vscode-msg agi-sm-vscode-msg--agi">
                <span className="agi-sm-vscode-avatar agi-sm-vscode-avatar--agi">A</span>
                <div>
                  <p className="agi-sm-vscode-reply">
                    <span className="agi-sm-vscode-typing" />
                  </p>
                  <p>
                    Streams a chat response from <code>processChat</code>. Add a{' '}
                    <code>try/catch</code> around the stream call. Want me to write it?
                  </p>
                </div>
              </div>
            </div>

            <div className="agi-sm-vscode-input">
              <span className="agi-sm-vscode-at">@agi</span>
              <span className="agi-sm-vscode-cursor" />
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}

/* ─────────────────────────── Chrome Extension ──────────────────────── */

export function ChromeMockup() {
  return (
    <figure className="agi-sm agi-sm--chrome" aria-label="AGI Chrome extension interface">
      <div className="agi-sm-chrome-browser">
        {/* Tab bar */}
        <div className="agi-sm-chrome-tabbar" aria-hidden="true">
          <span className="agi-hw-lights">
            <i />
            <i />
            <i />
          </span>
          <div className="agi-sm-chrome-tabs-row">
            <div className="agi-sm-chrome-tab agi-sm-chrome-tab--active">
              <span className="agi-sm-chrome-tab-favicon">📄</span>
              <span className="agi-sm-chrome-tab-label">Q3 Strategy · Google Docs</span>
            </div>
            <div className="agi-sm-chrome-tab">
              <span className="agi-sm-chrome-tab-favicon">✦</span>
              <span className="agi-sm-chrome-tab-label">New Tab</span>
            </div>
            <span className="agi-sm-chrome-tab-add">+</span>
          </div>
          <span className="agi-hw-surface">CHROME</span>
        </div>

        {/* Address bar */}
        <div className="agi-sm-chrome-addressbar" aria-hidden="true">
          <span className="agi-sm-chrome-navbtn">‹</span>
          <span className="agi-sm-chrome-navbtn">›</span>
          <span className="agi-sm-chrome-navbtn">↺</span>
          <div className="agi-sm-chrome-urlpill">
            <span className="agi-sm-chrome-lock">🔒</span>
            <span>docs.google.com/document/d/1xQ3Strategy…</span>
          </div>
          <div className="agi-sm-chrome-extbtn">AGI</div>
        </div>

        {/* Viewport: web page + AGI side panel */}
        <div className="agi-sm-chrome-viewport" aria-hidden="true">
          {/* Web page being read */}
          <div className="agi-sm-chrome-webpage">
            <div className="agi-sm-chrome-doc-header">
              <span className="agi-sm-chrome-doc-icon">📄</span>
              <span className="agi-sm-chrome-doc-title">Q3 Strategy Document</span>
            </div>
            <div className="agi-sm-chrome-doc-content">
              <div className="agi-sm-chrome-textline agi-sm-chrome-textline--h1" />
              <div className="agi-sm-chrome-textline" style={{ width: '94%' }} />
              <div className="agi-sm-chrome-textline" style={{ width: '88%' }} />
              <div className="agi-sm-chrome-textline" style={{ width: '97%' }} />
              <div className="agi-sm-chrome-textline" style={{ width: '82%' }} />
              <div className="agi-sm-chrome-textline" style={{ width: '91%' }} />
              <div className="agi-sm-chrome-textgap" />
              <div className="agi-sm-chrome-textline agi-sm-chrome-textline--h2" />
              <div className="agi-sm-chrome-textline" style={{ width: '89%' }} />
              <div className="agi-sm-chrome-textline" style={{ width: '76%' }} />
              <div
                className="agi-sm-chrome-textline agi-sm-chrome-textline--sel"
                style={{ width: '93%' }}
              />
              <div
                className="agi-sm-chrome-textline agi-sm-chrome-textline--sel"
                style={{ width: '85%' }}
              />
              <div
                className="agi-sm-chrome-textline agi-sm-chrome-textline--sel"
                style={{ width: '91%' }}
              />
              <div
                className="agi-sm-chrome-textline agi-sm-chrome-textline--sel"
                style={{ width: '79%' }}
              />
              <div className="agi-sm-chrome-textgap" />
              <div className="agi-sm-chrome-textline agi-sm-chrome-textline--h2" />
              <div className="agi-sm-chrome-textline" style={{ width: '92%' }} />
              <div className="agi-sm-chrome-textline" style={{ width: '86%' }} />
              <div className="agi-sm-chrome-textline" style={{ width: '78%' }} />
            </div>
          </div>

          {/* AGI side panel */}
          <div className="agi-sm-chrome-sidepanel">
            <div className="agi-sm-chrome-panel-hdr">
              <span className="agi-sm-chrome-panel-logo">AGI</span>
              <span className="agi-sm-chrome-panel-mode">◆ Local</span>
            </div>

            <div className="agi-sm-chrome-page-strip">
              <span className="agi-sm-chrome-page-icon">📄</span>
              <div>
                <p className="agi-sm-chrome-page-title">Q3 Strategy Doc</p>
                <p className="agi-sm-chrome-page-meta">docs.google.com · 4,200 words selected</p>
              </div>
              <span className="agi-sm-chrome-page-badge">CONTEXT</span>
            </div>

            <div className="agi-sm-chrome-chat">
              <div className="agi-sm-chrome-msg agi-sm-chrome-msg--user">
                Summarise the key risks from this doc
              </div>
              <div className="agi-sm-chrome-msg agi-sm-chrome-msg--agi">
                <span className="agi-sm-chrome-agi-name">AGI</span>
                <p>
                  Three risks stand out: market timing, dependency on a single cloud provider, and
                  regulatory uncertainty in the EU…
                </p>
                <p className="agi-sm-chrome-fade">Paired with AGI Desktop · Local mode</p>
              </div>
            </div>

            <div className="agi-sm-chrome-composer">
              <div className="agi-sm-chrome-input-row">
                <span className="agi-sm-chrome-page-ctx">📄</span>
                <span className="agi-sm-chrome-placeholder agi-hw-type">Ask about this page…</span>
                <span className="agi-sm-chrome-send">➤</span>
              </div>
              <div className="agi-sm-chrome-foot">
                <span>Paired · Desktop bridge</span>
                <span className="agi-sm-chrome-model">Local ∨</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}
