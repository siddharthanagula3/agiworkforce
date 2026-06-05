// screens-b-chat.jsx — Section B · Chat surface (4 screens, 6 variants on empty state)

// ─── Common chat shell helpers ─────────────────────────────────
function _ChatTop({ dark, hasModel = true }) {
  const p = wfPalette(dark);
  return (
    <div
      style={{
        height: 56,
        padding: '0 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderBottom: `1px dashed ${p.ink4}`,
        flexShrink: 0,
      }}
    >
      <WireGlyph dark={dark} kind="menu" size={24} />
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <WireModeToggle dark={dark} cloudJoined />
      </div>
      <WireGlyph dark={dark} kind="plus" size={22} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// B5 · Empty state — 6 VARIANTS
// ────────────────────────────────────────────────────────────────

// Variant 1 — CONVENTIONAL · centered greeting + 6 chips
function ChatEmpty_V1({ dark }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <_ChatTop dark={dark} />
      <WireBg dark={dark}>
        <div style={{ padding: '120px 24px 0', textAlign: 'center' }}>
          <div style={{ marginBottom: 18 }}>
            <WireBrand dark={dark} size={40} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <span
              className="wf-script"
              style={{ fontSize: 32, fontWeight: 700, color: p.ink, lineHeight: 1.15 }}
            >
              What can I help with,
              <br />
              Siddhartha?
            </span>
          </div>
          <div>
            <WireText dark={dark} hand size={13} color={p.ink3}>
              Drawer top-left · model pill in composer
            </WireText>
          </div>
        </div>
      </WireBg>
      <WireTaskChips dark={dark} active={0} />
      <WireComposer dark={dark} />
    </WirePhone>
  );
}

// Variant 2 — TIME-VARIANT · late-night copy, no brand mark, smaller display
function ChatEmpty_V2({ dark }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <_ChatTop dark={dark} />
      <WireBg dark={dark}>
        <div style={{ padding: '160px 24px 0', textAlign: 'left' }}>
          <div style={{ marginBottom: 12 }}>
            <span
              className="wf-arch"
              style={{ fontSize: 11, color: p.brand, textTransform: 'uppercase', letterSpacing: 2 }}
            >
              11:47 pm · Tuesday
            </span>
          </div>
          <span
            className="wf-script"
            style={{ fontSize: 36, fontWeight: 700, color: p.ink, lineHeight: 1.1 }}
          >
            It's late-night,
            <br />
            Siddhartha.
          </span>
          <div style={{ marginTop: 10 }}>
            <WireText dark={dark} hand size={14} color={p.ink3}>
              What's on your mind?
            </WireText>
          </div>
        </div>
      </WireBg>
      <WireTaskChips dark={dark} active={1} />
      <WireComposer dark={dark} />
    </WirePhone>
  );
}

// Variant 3 — PERPLEXITY-STYLE · wordmark centered, segmented mode, rich composer
function ChatEmpty_V3({ dark }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      {/* custom top: avatar + segmented control + secondary avatar */}
      <div
        style={{
          height: 56,
          padding: '0 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <WireAvatar dark={dark} size={32} label="S" fill={p.accent} />
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              display: 'flex',
              gap: 0,
              padding: 4,
              borderRadius: 20,
              background: dark ? p.raised : '#f0ece2',
            }}
          >
            <div
              style={{
                padding: '6px 22px',
                borderRadius: 16,
                background: dark ? p.bg : '#fff',
                boxShadow: '0 1px 2px rgba(0,0,0,.06)',
              }}
            >
              <WireGlyph dark={dark} kind="spark" size={18} />
            </div>
            <div style={{ padding: '6px 22px' }}>
              <WireGlyph dark={dark} kind="code" size={18} />
            </div>
          </div>
        </div>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: dark ? p.raised : '#d4d2c8',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            className={dark ? 'wf-hatch-d' : 'wf-hatch-l'}
            style={{ position: 'absolute', inset: 0 }}
          />
        </div>
      </div>
      <WireBg dark={dark}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 24px',
          }}
        >
          <span
            className="wf-script"
            style={{
              fontSize: 44,
              fontWeight: 500,
              color: p.ink,
              lineHeight: 1,
              letterSpacing: -0.5,
            }}
          >
            <span style={{ color: p.ink }}>AGI</span> <span style={{ color: p.ink3 }}>pro</span>
          </span>
        </div>
      </WireBg>
      {/* Perplexity-style composer */}
      <div style={{ padding: '0 14px 16px', background: p.bg, flexShrink: 0 }}>
        <div
          style={{
            padding: '14px 14px',
            borderRadius: 24,
            border: `1.5px solid ${p.ink4}`,
            background: dark ? p.surface : '#fff',
          }}
        >
          <WireText dark={dark} hand size={15} color={p.ink3} italic>
            Ask anything…
          </WireText>
          <div style={{ height: 28 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                border: `1.2px solid ${p.ink3}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <WireGlyph dark={dark} kind="plus" size={16} />
            </div>
            <div
              style={{
                padding: '5px 12px',
                borderRadius: 14,
                background: dark ? p.raised : '#f0ece2',
              }}
            >
              <span className="wf-hand" style={{ fontSize: 12, fontWeight: 600 }}>
                Model
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                background: dark ? p.raised : '#f0ece2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <WireGlyph dark={dark} kind="eye" size={14} />
            </div>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                background: dark ? p.raised : '#f0ece2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <WireGlyph dark={dark} kind="mic" size={14} />
            </div>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                background: p.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <WireGlyph dark={true} kind="waveform" size={14} />
            </div>
          </div>
        </div>
      </div>
    </WirePhone>
  );
}

// Variant 4 — COMPANION-FORWARD · pulsing orb hints voice-first
function ChatEmpty_V4({ dark }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <_ChatTop dark={dark} />
      <WireBg dark={dark}>
        <div style={{ padding: '70px 24px 0', textAlign: 'center' }}>
          {/* Orb */}
          <div style={{ position: 'relative', width: 130, height: 130, margin: '0 auto 18px' }}>
            <div
              style={{
                position: 'absolute',
                inset: 16,
                borderRadius: '50%',
                background: p.brand,
                opacity: 0.18,
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 28,
                borderRadius: '50%',
                border: `2px dashed ${p.brand}`,
                opacity: 0.55,
              }}
            />
            <div
              style={{ position: 'absolute', inset: 44, borderRadius: '50%', background: p.brand }}
            />
          </div>
          <span className="wf-script" style={{ fontSize: 26, fontWeight: 700, color: p.ink }}>
            Tap to talk, Siddhartha
          </span>
          <div style={{ marginTop: 6 }}>
            <WireText dark={dark} hand size={13} color={p.ink3}>
              or type below
            </WireText>
          </div>
        </div>
      </WireBg>
      <WireTaskChips dark={dark} active={0} />
      <WireComposer dark={dark} />
    </WirePhone>
  );
}

// Variant 5 — DENSE / RECENTS · recents row + chips + composer
function ChatEmpty_V5({ dark }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <_ChatTop dark={dark} />
      <WireBg dark={dark}>
        <div style={{ padding: '20px 18px 8px' }}>
          <span className="wf-script" style={{ fontSize: 26, fontWeight: 700, color: p.ink }}>
            Hey, Siddhartha
          </span>
        </div>
        <WireSectionLabel dark={dark} action="See all">
          Pick up where you left off
        </WireSectionLabel>
        <div
          style={{ padding: '0 14px', display: 'flex', gap: 10, overflowX: 'auto' }}
          className="wf-scroll"
        >
          {[
            ['EU AI Act §50 questions', 'Opus · 12 turns'],
            ['Refactor Zod validators', 'Sonnet · 5 turns'],
            ['Lisbon trip plan', 'Sonnet · 8 turns'],
          ].map(([t, m], i) => (
            <div
              key={i}
              style={{
                minWidth: 200,
                padding: 12,
                border: `1.2px solid ${p.ink3}`,
                borderRadius: 12,
                background: dark ? p.surface : '#fff',
              }}
            >
              <WireText dark={dark} hand size={13} weight={600}>
                {t}
              </WireText>
              <div style={{ marginTop: 6 }}>
                <WireText dark={dark} hand size={11} color={p.ink3}>
                  {m}
                </WireText>
              </div>
            </div>
          ))}
        </div>
        <WireSectionLabel dark={dark}>Quick start</WireSectionLabel>
        <div style={{ padding: '0 18px' }}>
          {[
            'Summarize a PDF I just got',
            'Draft a Slack DM',
            'Refactor this file',
            'Plan my week',
          ].map((s, i) => (
            <div
              key={i}
              style={{
                padding: '11px 0',
                borderBottom: i < 3 ? `1px dashed ${p.ink4}` : undefined,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <WireGlyph dark={dark} kind={['file', 'chat', 'code', 'calendar'][i]} size={16} />
              <span className="wf-hand" style={{ fontSize: 13, color: p.ink2 }}>
                {s}
              </span>
              <div style={{ flex: 1 }} />
              <WireGlyph dark={dark} kind="chev" size={14} />
            </div>
          ))}
        </div>
      </WireBg>
      <WireComposer dark={dark} />
    </WirePhone>
  );
}

// Variant 6 — AMBIENT / EDITORIAL · big wordmark, no chips, tagline
function ChatEmpty_V6({ dark }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <_ChatTop dark={dark} />
      <WireBg dark={dark}>
        <div
          style={{
            flex: 1,
            padding: '180px 28px 0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
          }}
        >
          <span className="wf-stamp" style={{ fontSize: 11, color: p.ink3, letterSpacing: 3 }}>
            YOUR AI TEAM
          </span>
          <div style={{ marginTop: 8 }}>
            <span
              className="wf-script"
              style={{
                fontSize: 72,
                fontWeight: 700,
                color: p.ink,
                lineHeight: 0.95,
                letterSpacing: -1,
              }}
            >
              AGI.
            </span>
          </div>
          <div style={{ marginTop: 20, maxWidth: 280 }}>
            <WireText dark={dark} hand size={16} color={p.ink2}>
              What should we build today, Siddhartha?
            </WireText>
          </div>
          <div style={{ marginTop: 28, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['Code', 'Write', 'Research', 'Image'].map((c, i) => (
              <div
                key={i}
                style={{ padding: '5px 11px', border: `1px solid ${p.ink2}`, borderRadius: 14 }}
              >
                <span className="wf-hand" style={{ fontSize: 12 }}>
                  {c}
                </span>
              </div>
            ))}
          </div>
        </div>
      </WireBg>
      <WireComposer dark={dark} />
    </WirePhone>
  );
}

// ────────────────────────────────────────────────────────────────
// B6 · Active conversation
// ────────────────────────────────────────────────────────────────
function ChatActive({ dark, streaming = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <_ChatTop dark={dark} />
      <WireBg dark={dark} style={{ paddingBottom: 0 }}>
        <WireBubble dark={dark} role="user">
          <WireText dark={dark} hand size={14}>
            Compare A15 vs M2 inference latency for 3B Llama, on-device.
          </WireText>
        </WireBubble>

        <WireBubble dark={dark} role="assistant">
          <WireText dark={dark} hand size={14}>
            Sure — on a 3B Llama (Q4_K_M), tokens/sec roughly:
          </WireText>
          <div style={{ height: 6 }} />
          <WireText dark={dark} hand size={13}>
            • A15 (executorch, ANE) · ~22 t/s, peak 1.4 GB
          </WireText>
          <WireText dark={dark} hand size={13}>
            • M2 (Metal, llama.cpp) · ~48 t/s, peak 2.1 GB
          </WireText>
          <div style={{ height: 6 }} />
          <WireProvenance
            dark={dark}
            model="Apple Foundation 3B"
            tier="Tier 1"
            tps="38 t/s"
            ttft="90ms"
          />
        </WireBubble>

        <WireToolCall dark={dark} label="vector_search · local memory" status="done · 4 matches" />

        <WireBubble dark={dark} role="user">
          <WireText dark={dark} hand size={14}>
            What about Qwen 0.5B on A12?
          </WireText>
        </WireBubble>

        <WireBubble dark={dark} role="assistant">
          <WireText dark={dark} hand size={14}>
            {streaming
              ? 'On A12 (no ANE)…'
              : 'On A12 (no ANE), Qwen 2.5 0.5B GGUF Q4 runs at roughly 14-18 t/s with peak 380 MB. Falls below the 15 t/s floor for Tier 1 routing.'}
          </WireText>
          {streaming && (
            <span className="wf-mono" style={{ fontSize: 14, color: p.ink2 }}>
              ▍
            </span>
          )}
          {!streaming && (
            <>
              <div style={{ height: 6 }} />
              <WireProvenance
                dark={dark}
                model="Llama 3.2 3B"
                tier="Tier 2"
                tps="22 t/s"
                ttft="180ms"
              />
            </>
          )}
        </WireBubble>
      </WireBg>

      {/* stop-generating FAB during streaming */}
      {streaming && (
        <div
          style={{
            position: 'absolute',
            bottom: 130,
            right: 18,
            padding: '6px 12px',
            borderRadius: 18,
            background: p.ink,
            color: p.bg,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            zIndex: 25,
          }}
        >
          <span style={{ width: 8, height: 8, background: p.danger, borderRadius: 2 }} />
          <span className="wf-hand" style={{ fontSize: 12 }}>
            Stop
          </span>
        </div>
      )}

      <WireComposer dark={dark} placeholder="Reply…" model="Opus 4.7" />
    </WirePhone>
  );
}

// ────────────────────────────────────────────────────────────────
// B7 · Long-press message actions
// ────────────────────────────────────────────────────────────────
function ChatLongPress({ dark }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <_ChatTop dark={dark} />
      <WireBg dark={dark} style={{ position: 'relative' }}>
        {/* dimmed messages */}
        <div style={{ opacity: 0.35 }}>
          <WireBubble dark={dark} role="user">
            <WireText dark={dark} hand size={14}>
              What's the right react-native-executorch tier for A14?
            </WireText>
          </WireBubble>
        </div>
        {/* highlighted message */}
        <div
          style={{ background: 'rgba(0,0,0,0.50)', position: 'absolute', inset: 0, zIndex: 5 }}
        />
        <div style={{ position: 'relative', zIndex: 10 }}>
          <WireBubble dark={dark} role="assistant">
            <div
              style={{
                padding: 12,
                borderRadius: 14,
                border: `1.5px solid ${p.brand}`,
                background: dark ? '#2a2722' : '#fff',
                boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              }}
            >
              <WireText dark={dark} hand size={14}>
                A14 doesn't have full ANE support for ExecuTorch yet — we'd route to Tier 3
                (llama.rn GGUF). You can opt into the experimental Tier 2 path in Settings →
                Capabilities.
              </WireText>
              <div style={{ height: 4 }} />
              <WireProvenance
                dark={dark}
                model="Llama 3.2 3B"
                tier="Tier 2"
                tps="22 t/s"
                ttft="180ms"
              />
            </div>
          </WireBubble>
        </div>
      </WireBg>
      {/* action sheet */}
      <WireSheet dark={dark} h={340}>
        <div style={{ padding: '4px 0' }}>
          {[
            ['copy', 'Copy'],
            ['quote', 'Quote-reply'],
            ['refresh', 'Regenerate'],
            ['pin', 'Pin to memory'],
            ['flag', 'Report'],
          ].map(([g, t], i) => (
            <WireListRow
              key={t}
              dark={dark}
              leading={
                <WireGlyph
                  dark={dark}
                  kind={g === 'copy' ? 'file' : g === 'quote' ? 'quote' : g}
                  size={20}
                />
              }
              title={t}
              trailing={<WireGlyph dark={dark} kind="chev" size={16} />}
              divider={i < 4}
            />
          ))}
        </div>
      </WireSheet>
    </WirePhone>
  );
}

// ────────────────────────────────────────────────────────────────
// B8 · Compare (Pro+)
// ────────────────────────────────────────────────────────────────
function ChatCompare({ dark, paywall = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar
        dark={dark}
        left="back"
        title="Compare"
        sub="on-device · pick 2-3 models"
        right={<WireGlyph dark={dark} kind="sliders" size={20} />}
      />
      <WireBg dark={dark}>
        {/* tabs · on-device only */}
        <div style={{ display: 'flex', borderBottom: `1px dashed ${p.ink4}` }}>
          {['Apple FM 3B', 'Llama 3.2 3B', 'Qwen 0.5B'].map((m, i) => (
            <div
              key={m}
              style={{
                flex: 1,
                padding: '10px 8px',
                textAlign: 'center',
                borderBottom: i === 0 ? `2px solid ${p.accent}` : undefined,
              }}
            >
              <span
                className="wf-hand"
                style={{
                  fontSize: 12,
                  color: i === 0 ? p.accent : p.ink3,
                  fontWeight: i === 0 ? 600 : 400,
                }}
              >
                {m}
              </span>
            </div>
          ))}
        </div>
        <WireBubble dark={dark} role="user">
          <WireText dark={dark} hand size={14}>
            What's a good 78% hydration sourdough bulk ferment time?
          </WireText>
        </WireBubble>
        <WireBubble dark={dark} role="assistant">
          <WireText dark={dark} hand size={13}>
            Apple FM says: at 78% hydration with room temp around 22°C, plan on 4–5 hours of bulk
            fermentation with stretch-and-folds every 30 min.
          </WireText>
          <div style={{ height: 6 }} />
          <WireParagraph dark={dark} lines={3} widths={['86%', '78%', '40%']} />
          <div style={{ height: 6 }} />
          <WireProvenance
            dark={dark}
            model="Apple Foundation 3B"
            tier="Tier 1"
            tps="38 t/s"
            ttft="90ms"
          />
        </WireBubble>
        <div
          style={{
            padding: '14px 14px 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <WireText dark={dark} hand size={12} color={p.ink3}>
            ← swipe between models →
          </WireText>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            3 of 3 · on-device
          </WireText>
        </div>

        {paywall && (
          <>
            <div
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 30 }}
            />
            <div
              style={{
                position: 'absolute',
                left: 24,
                right: 24,
                top: 240,
                padding: 18,
                borderRadius: 16,
                background: p.bg,
                border: `1.5px solid ${p.rule}`,
                zIndex: 40,
              }}
            >
              <WireGlyph dark={dark} kind="cloud" size={26} />
              <div style={{ marginTop: 8 }}>
                <WireText dark={dark} hand size={16} weight={600}>
                  Cloud models · waitlist
                </WireText>
              </div>
              <div style={{ marginTop: 6 }}>
                <WireText dark={dark} hand size={13} color={p.ink3}>
                  Compare across Opus, GPT-5, Gemini once cloud opens. You'll be emailed.
                </WireText>
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                <WireButton dark={dark} variant="accent" size="md">
                  Join waitlist
                </WireButton>
                <WireButton dark={dark} size="md">
                  Use local 3
                </WireButton>
              </div>
            </div>
          </>
        )}
      </WireBg>
    </WirePhone>
  );
}

function _ArtboardPair({ id, label, dark, children, w = 460, h = 1000, padDark }) {
  // Helper to wrap a phone screen with screen label below.
  return (
    <DCArtboard id={id} label={label} width={w} height={h}>
      <div
        style={{
          width: w,
          height: h,
          padding: 14,
          background: dark ? '#1a1915' : '#f0eee9',
          boxSizing: 'border-box',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {children}
      </div>
    </DCArtboard>
  );
}

function renderSectionB() {
  const W = 470,
    H = 1000;
  const wrap = (id, label, dark, El) => (
    <DCArtboard id={id} label={label} width={W} height={H}>
      <div
        style={{
          width: W,
          height: H,
          padding: 14,
          background: dark ? '#1f1c18' : '#f0eee9',
          boxSizing: 'border-box',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {El}
      </div>
    </DCArtboard>
  );
  return (
    <DCSection
      id="chat-b"
      title="03 — Chat surface"
      subtitle="empty state (6 variants) · active · long-press · compare"
    >
      {/* B5 empty state · 6 variants in light, 1 mirror in dark */}
      {wrap(
        'b5-v1-light',
        '03.1 · Empty · V1 conventional · light',
        false,
        <ChatEmpty_V1 dark={false} />,
      )}
      {wrap(
        'b5-v2-light',
        '03.1 · Empty · V2 time-variant · light',
        false,
        <ChatEmpty_V2 dark={false} />,
      )}
      {wrap(
        'b5-v3-light',
        '03.1 · Empty · V3 perplexity-style · light',
        false,
        <ChatEmpty_V3 dark={false} />,
      )}
      {wrap(
        'b5-v4-light',
        '03.1 · Empty · V4 companion-forward · light',
        false,
        <ChatEmpty_V4 dark={false} />,
      )}
      {wrap(
        'b5-v5-light',
        '03.1 · Empty · V5 recents-dense · light',
        false,
        <ChatEmpty_V5 dark={false} />,
      )}
      {wrap(
        'b5-v6-light',
        '03.1 · Empty · V6 editorial · light',
        false,
        <ChatEmpty_V6 dark={false} />,
      )}

      {wrap(
        'b5-v1-dark',
        '03.1 · Empty · V1 conventional · dark',
        true,
        <ChatEmpty_V1 dark={true} />,
      )}
      {wrap(
        'b5-v3-dark',
        '03.1 · Empty · V3 perplexity-style · dark',
        true,
        <ChatEmpty_V3 dark={true} />,
      )}
      {wrap(
        'b5-v4-dark',
        '03.1 · Empty · V4 companion-forward · dark',
        true,
        <ChatEmpty_V4 dark={true} />,
      )}
      {wrap('b5-v6-dark', '03.1 · Empty · V6 editorial · dark', true, <ChatEmpty_V6 dark={true} />)}

      {/* B6 active */}
      {wrap('b6-light', '03.2 · Active conversation · light', false, <ChatActive dark={false} />)}
      {wrap(
        'b6-stream-light',
        '03.2 · Active · streaming · light',
        false,
        <ChatActive dark={false} streaming />,
      )}
      {wrap('b6-dark', '03.2 · Active conversation · dark', true, <ChatActive dark={true} />)}

      {/* B7 long-press */}
      {wrap('b7-light', '03.3 · Long-press actions · light', false, <ChatLongPress dark={false} />)}
      {wrap('b7-dark', '03.3 · Long-press actions · dark', true, <ChatLongPress dark={true} />)}

      {/* B8 compare */}
      {wrap('b8-light', '03.4 · Compare (Pro+) · light', false, <ChatCompare dark={false} />)}
      {wrap(
        'b8-paywall-light',
        '03.4 · Compare · paywall-gated · light',
        false,
        <ChatCompare dark={false} paywall />,
      )}
      {wrap('b8-dark', '03.4 · Compare · dark', true, <ChatCompare dark={true} />)}
    </DCSection>
  );
}

Object.assign(window, {
  ChatEmpty_V1,
  ChatEmpty_V2,
  ChatEmpty_V3,
  ChatEmpty_V4,
  ChatEmpty_V5,
  ChatEmpty_V6,
  ChatActive,
  ChatLongPress,
  ChatCompare,
  renderSectionB,
});
