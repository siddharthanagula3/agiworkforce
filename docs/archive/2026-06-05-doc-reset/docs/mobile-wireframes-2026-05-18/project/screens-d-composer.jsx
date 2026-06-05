// screens-d-composer.jsx — Section D · Composer overlays (4 screens; 6 variants on Model picker; voice flow)

// ────────────────────────────────────────────────────────────────
// D12 · Plus menu sheet — 3 VARIANTS
// ────────────────────────────────────────────────────────────────

// V1 — AGI-spec grid · lock #11 order
function PlusMenu_V1({ dark = false }) {
  const p = wfPalette(dark);
  const items = [
    ['cam', 'Camera'],
    ['img', 'Photos'],
    ['file', 'Files'],
    ['github', 'GitHub'],
    ['skill', 'Skills'],
    ['plug', 'Connectors'],
    ['bolt', 'Plugins'],
    ['globe', 'Web search'],
    ['pen', 'Style'],
  ];
  return (
    <WirePhone dark={dark}>
      <WireTopBar
        dark={dark}
        left="menu"
        title=""
        right={<WireGlyph dark={dark} kind="plus" size={22} />}
      />
      <WireBg dark={dark} style={{ opacity: 0.2 }}>
        <WireBubble dark={dark} role="user">
          <WireParagraph dark={dark} lines={1} widths={['52%']} />
        </WireBubble>
        <WireBubble dark={dark} role="assistant">
          <WireParagraph dark={dark} lines={3} />
        </WireBubble>
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 30 }} />
      <WireSheet dark={dark} h={460} style={{ zIndex: 40 }}>
        <div style={{ padding: '0 18px 4px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            ATTACH
          </WireText>
        </div>
        <div
          style={{
            padding: '8px 14px 8px',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
          }}
        >
          {items.map(([g, name]) => (
            <div
              key={name}
              style={{
                aspectRatio: 1,
                borderRadius: 16,
                border: `1.5px solid ${p.rule}`,
                background: dark ? p.surface : '#fff',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <WireGlyph dark={dark} kind={g} size={26} />
              <WireText dark={dark} hand size={12}>
                {name}
              </WireText>
            </div>
          ))}
        </div>
      </WireSheet>
    </WirePhone>
  );
}

// V2 — Perplexity Options-style · 4 squares + selected mode + research/multi-model
function PlusMenu_V2({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark} style={{ opacity: 0.2 }}>
        <div style={{ flex: 1, padding: '160px 0', textAlign: 'center' }}>
          <span
            className="wf-script"
            style={{ fontSize: 44, fontWeight: 500, color: p.ink3, letterSpacing: -0.5 }}
          >
            AGI <span style={{ color: p.ink4 }}>pro</span>
          </span>
        </div>
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 30 }} />
      <WireSheet dark={dark} h={580} style={{ zIndex: 40 }}>
        <div
          style={{
            padding: '0 22px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span className="wf-script" style={{ fontSize: 24, fontWeight: 700, color: p.ink }}>
            Options
          </span>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              background: dark ? p.raised : '#ebe6d8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WireGlyph dark={dark} kind="x" size={16} />
          </div>
        </div>
        {/* 4 big squares */}
        <div
          style={{
            padding: '4px 18px 6px',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
          }}
        >
          {[
            ['img', 'Image'],
            ['cam', 'Camera'],
            ['file', 'File'],
            ['plug', 'Connectors'],
          ].map(([g, n]) => (
            <div
              key={n}
              style={{
                aspectRatio: 1,
                borderRadius: 14,
                background: dark ? p.raised : '#f0ece2',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <WireGlyph dark={dark} kind={g} size={24} />
              <WireText dark={dark} hand size={12}>
                {n}
              </WireText>
            </div>
          ))}
        </div>
        <div style={{ padding: '0 22px 8px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            50 uploads remaining this month
          </WireText>
        </div>
        {/* selected mode pill */}
        <div style={{ padding: '0 18px 6px' }}>
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 14,
              background: dark ? p.raised : '#f0ece2',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <WireGlyph dark={dark} kind="search" size={18} />
            <WireText dark={dark} hand size={15} weight={600}>
              Search
            </WireText>
            <div style={{ flex: 1 }} />
            <WireGlyph dark={dark} kind="check" size={18} />
          </div>
        </div>
        {/* feature rows */}
        <div style={{ padding: '4px 22px' }}>
          {[
            ['globe', 'Deep research', 'In-depth reports and analysis', null],
            ['sliders', 'Model council', 'Multiple AI models at once', 'max', true],
            ['cloud', 'Cloud · waitlist', 'Opus, GPT-5, Gemini', 'soon', true],
            ['skill', 'Skills', 'Run a saved micro-tool', null],
          ].map(([g, t, sub, badge, locked]) => (
            <div
              key={t}
              style={{
                padding: '12px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderTop: `1px solid ${p.ink4}`,
              }}
            >
              <WireGlyph dark={dark} kind={g} size={20} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <WireText dark={dark} hand size={14} weight={600}>
                    {t}
                  </WireText>
                  {badge && (
                    <div
                      style={{
                        padding: '2px 7px',
                        borderRadius: 5,
                        background: badge === 'max' ? p.accent : 'transparent',
                        border: badge === 'max' ? 'none' : `1px solid ${p.accent}`,
                      }}
                    >
                      <span
                        className="wf-hand"
                        style={{
                          fontSize: 9,
                          color: badge === 'max' ? '#fff' : p.accent,
                          fontWeight: 600,
                        }}
                      >
                        {badge}
                      </span>
                    </div>
                  )}
                </div>
                <div>
                  <WireText dark={dark} hand size={11} color={p.ink3}>
                    {sub}
                  </WireText>
                </div>
              </div>
              {locked && <WireGlyph dark={dark} kind="lock" size={16} />}
            </div>
          ))}
        </div>
      </WireSheet>
    </WirePhone>
  );
}

// V3 — ChatGPT-style · camera/photos quick-row + photo strip + descriptive list
function PlusMenu_V3({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark} style={{ opacity: 0.18 }}>
        <div style={{ flex: 1 }} />
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 30 }} />
      <WireSheet dark={dark} h={700} style={{ zIndex: 40 }}>
        <div
          style={{
            padding: '0 22px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <WireText dark={dark} hand size={14} weight={600}>
            AGI
          </WireText>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <WireText dark={dark} hand size={12} color={p.ink3}>
              Limited photos access
            </WireText>
            <WireGlyph dark={dark} kind="info" size={14} />
          </div>
        </div>
        {/* Camera + Photos squares + photo strip */}
        <div style={{ padding: '0 18px 14px', display: 'flex', gap: 10 }}>
          {[
            ['cam', 'Camera'],
            ['img', 'Photos'],
          ].map(([g, n]) => (
            <div
              key={n}
              style={{
                width: 96,
                height: 96,
                borderRadius: 12,
                background: dark ? p.raised : '#f0ece2',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <WireGlyph dark={dark} kind={g} size={26} />
              <WireText dark={dark} hand size={12} weight={600}>
                {n}
              </WireText>
            </div>
          ))}
          {/* photo strip */}
          <div style={{ flex: 1, display: 'flex', gap: 6, overflow: 'hidden' }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 96,
                  borderRadius: 12,
                  background: dark ? p.raised : '#d4d0c4',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div
                  className={dark ? 'wf-hatch-d' : 'wf-hatch-l'}
                  style={{ position: 'absolute', inset: 0 }}
                />
                {i === 1 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      border: `2px solid ${p.ink}`,
                      background: p.bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: p.ink }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div style={{ height: 1, background: p.ink4, margin: '0 22px' }} />
        {/* descriptive list */}
        <div style={{ padding: '6px 22px' }}>
          {[
            ['img', 'Create image', 'Visualize anything'],
            ['globe', 'Deep research', 'Get a detailed report'],
            ['search', 'Web search', 'Find real-time news and info'],
            ['cpu', 'Computer use', 'Get work done for you'],
            ['file', 'Add files', 'Analyze or summarize'],
            ['github', 'GitHub', 'Access repositories, issues, PRs…'],
            ['calendar', 'Calendar', 'Find and reference events…'],
            ['skill', 'Skills', 'Run a saved micro-tool'],
          ].map(([g, t, sub]) => (
            <div
              key={t}
              style={{ padding: '10px 0', display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <WireGlyph dark={dark} kind={g} size={22} />
              <div style={{ flex: 1 }}>
                <WireText dark={dark} hand size={14} weight={600}>
                  {t}
                </WireText>
                <div>
                  <WireText dark={dark} hand size={11} color={p.ink3}>
                    {sub}
                  </WireText>
                </div>
              </div>
            </div>
          ))}
        </div>
      </WireSheet>
    </WirePhone>
  );
}

// Keep PlusMenu export for legacy callers
const PlusMenu = PlusMenu_V1;

// ────────────────────────────────────────────────────────────────
// D13 · Model picker sheet — 6 VARIANTS
// ────────────────────────────────────────────────────────────────
const MODELS_TASKS = ['Coding', 'Writing', 'Research', 'Cheapest', 'Local'];

// V1 — Task groups + slider (per the prompt)
function Picker_V1({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark} style={{ opacity: 0.18 }}>
        <div style={{ flex: 1 }} />
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 30 }} />
      <WireSheet dark={dark} h={680} style={{ zIndex: 40 }}>
        <div style={{ padding: '0 18px 16px' }}>
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 14,
              border: `1.5px solid ${p.ink3}`,
              background: dark ? p.surface : '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <WireGlyph dark={dark} kind="search" size={16} />
            <WireText dark={dark} hand size={14} color={p.ink3} italic>
              Search models…
            </WireText>
          </div>
          <div
            style={{ marginTop: 14, display: 'flex', gap: 6, overflowX: 'auto' }}
            className="wf-scroll"
          >
            {['All', ...MODELS_TASKS].map((t, i) => (
              <div
                key={t}
                style={{
                  padding: '5px 11px',
                  borderRadius: 14,
                  border: `1.2px solid ${i === 1 ? p.ink : p.ink3}`,
                  background: i === 1 ? p.ink : 'transparent',
                  color: i === 1 ? p.bg : p.ink,
                  whiteSpace: 'nowrap',
                }}
              >
                <span className="wf-hand" style={{ fontSize: 12 }}>
                  {t}
                </span>
              </div>
            ))}
          </div>

          {/* Current pick + recommended in selected task */}
          <div style={{ marginTop: 14 }}>
            <WireText dark={dark} hand size={11} color={p.ink3}>
              BEST FOR CODING
            </WireText>
          </div>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              {
                name: 'Claude Sonnet 4.6',
                tag: 'current',
                meta: 'cloud · ~$0.002/turn',
                selected: true,
              },
              {
                name: 'Claude Opus 4.7',
                tag: 'recommended',
                meta: 'cloud · ~$0.012/turn · 82% used',
              },
            ].map((m) => (
              <div
                key={m.name}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: `1.5px solid ${m.selected ? p.accent : p.rule}`,
                  background: dark
                    ? m.selected
                      ? p.accentSoft
                      : p.surface
                    : m.selected
                      ? '#dceaeb'
                      : '#fff',
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <WireText dark={dark} hand size={14} weight={600}>
                    {m.name}
                  </WireText>
                  <span
                    className="wf-hand"
                    style={{
                      fontSize: 10,
                      color: p.ink3,
                      padding: '2px 6px',
                      border: `1px solid ${p.ink4}`,
                      borderRadius: 6,
                    }}
                  >
                    {m.tag}
                  </span>
                </div>
                <div style={{ marginTop: 4 }}>
                  <WireText dark={dark} hand size={11} color={p.ink3}>
                    {m.meta}
                  </WireText>
                </div>
              </div>
            ))}
          </div>

          {/* Reasoning slider */}
          <div
            style={{
              marginTop: 16,
              padding: '12px 12px',
              borderRadius: 12,
              border: `1.5px dashed ${p.ink3}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <WireText dark={dark} hand size={12} weight={600}>
                Reasoning
              </WireText>
              <WireText dark={dark} hand size={11} color={p.ink3}>
                Medium
              </WireText>
            </div>
            <div
              style={{
                marginTop: 12,
                position: 'relative',
                height: 4,
                borderRadius: 2,
                background: dark ? p.ink4 : '#e2dccb',
              }}
            >
              <div
                style={{ width: '50%', height: '100%', background: p.accent, borderRadius: 2 }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: -6,
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  background: p.accent,
                  border: `2px solid ${dark ? p.bg : '#fff'}`,
                  transform: 'translateX(-50%)',
                }}
              />
            </div>
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between' }}>
              {['Min', 'Low', 'Med', 'High', 'Max'].map((s) => (
                <WireText key={s} dark={dark} hand size={10} color={p.ink3}>
                  {s}
                </WireText>
              ))}
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderRadius: 12,
              border: `1.2px dashed ${p.ink3}`,
            }}
          >
            <WireText dark={dark} hand size={13}>
              More models · by provider
            </WireText>
            <WireGlyph dark={dark} kind="chev" size={16} />
          </div>
        </div>
      </WireSheet>
    </WirePhone>
  );
}

// V2 — Perplexity-style · "Best" hero card + provider-logo list + max badges
function Picker_V2({ dark = false }) {
  const p = wfPalette(dark);
  const rows = [
    ['◈', 'Sonar 2'],
    ['Ⓞ', 'GPT-5.4'],
    ['Ⓞ', 'GPT-5.5', 'max'],
    ['◆', 'Gemini 3.1 Pro'],
    ['✸', 'Claude Sonnet 4.6'],
    ['✸', 'Claude Opus 4.7', 'max'],
    ['K', 'Kimi K2.6'],
    ['◐', 'Nemotron 3 Super'],
    ['🦙', 'Llama 3.2 3B', 'on-device'],
  ];
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark} style={{ opacity: 0.18 }}>
        <div style={{ flex: 1 }} />
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 30 }} />
      <WireSheet dark={dark} h={680} style={{ zIndex: 40 }}>
        <div
          style={{
            padding: '0 22px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span className="wf-script" style={{ fontSize: 22, fontWeight: 700, color: p.ink }}>
            Models
          </span>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              background: dark ? p.raised : '#ebe6d8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WireGlyph dark={dark} kind="x" size={16} />
          </div>
        </div>
        {/* Best hero card */}
        <div style={{ padding: '0 18px 12px' }}>
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 16,
              background: dark ? p.raised : '#f0ece2',
            }}
          >
            <div
              style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}
            >
              <div>
                <WireText dark={dark} hand size={17} weight={700}>
                  Best
                </WireText>
                <div style={{ marginTop: 2 }}>
                  <WireText dark={dark} hand size={12} color={p.ink3}>
                    Best for everyday searches · auto-routes
                  </WireText>
                </div>
              </div>
              <WireGlyph dark={dark} kind="check" size={20} />
            </div>
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${p.ink4}`, marginTop: 4 }} />
        {/* Model list */}
        <div style={{ padding: '4px 0' }}>
          {rows.map(([logo, name, badge], i) => (
            <div
              key={name}
              style={{ padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: 18, color: p.ink }}>{logo}</span>
              </div>
              <WireText dark={dark} hand size={15} weight={600}>
                {name}
              </WireText>
              {badge === 'max' && (
                <div style={{ padding: '2px 8px', borderRadius: 5, background: p.accent }}>
                  <span
                    className="wf-hand"
                    style={{ fontSize: 10, color: '#fff', fontWeight: 600 }}
                  >
                    max
                  </span>
                </div>
              )}
              {badge === 'on-device' && (
                <div
                  style={{
                    padding: '2px 8px',
                    borderRadius: 5,
                    background: dark ? p.accentSoft : '#cfe6e9',
                  }}
                >
                  <span
                    className="wf-hand"
                    style={{ fontSize: 10, color: p.accent, fontWeight: 600 }}
                  >
                    on-device
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </WireSheet>
    </WirePhone>
  );
}

// V3 — Carousel cards · big tiles for top picks
function Picker_V3({ dark = false }) {
  const p = wfPalette(dark);
  const tiles = [
    { name: 'Opus 4.7', meta: 'best reasoning · ~$0.012', tag: '82% used', cap: true },
    { name: 'Sonnet 4.6', meta: 'balanced · ~$0.002', tag: 'recommended', sel: true },
    { name: 'Llama 3.2 3B', meta: 'on-device · Tier 2', tag: 'free', local: true },
  ];
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark} style={{ opacity: 0.18 }}>
        <div style={{ flex: 1 }} />
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 30 }} />
      <WireSheet dark={dark} h={680} style={{ zIndex: 40 }}>
        <div style={{ padding: '0 18px' }}>
          <WireText dark={dark} hand size={15} weight={600}>
            Top picks for coding
          </WireText>
        </div>
        <div
          style={{ padding: '12px 14px', display: 'flex', gap: 10, overflowX: 'auto' }}
          className="wf-scroll"
        >
          {tiles.map((t) => (
            <div
              key={t.name}
              style={{
                minWidth: 200,
                padding: 14,
                borderRadius: 16,
                border: `${t.sel ? 2 : 1.5}px solid ${t.sel ? p.accent : t.cap ? p.danger : p.rule}`,
                background: dark ? (t.sel ? p.accentSoft : p.surface) : t.sel ? '#dceaeb' : '#fff',
              }}
            >
              <span
                className="wf-hand"
                style={{ fontSize: 10, color: t.cap ? p.danger : t.sel ? p.accent : p.ink3 }}
              >
                {t.tag.toUpperCase()}
              </span>
              <div style={{ marginTop: 6 }}>
                <WireText dark={dark} hand size={15} weight={600}>
                  {t.name}
                </WireText>
              </div>
              <div style={{ marginTop: 4 }}>
                <WireText dark={dark} hand size={11} color={p.ink3}>
                  {t.meta}
                </WireText>
              </div>
              <div
                style={{
                  marginTop: 14,
                  height: 60,
                  borderRadius: 8,
                  border: `1px dashed ${p.ink4}`,
                }}
              />
            </div>
          ))}
        </div>
        <div style={{ padding: '0 18px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            ALL MODELS
          </WireText>
        </div>
        <div style={{ padding: '4px 0' }}>
          {['Haiku 4', 'GPT-5.4 (BYOK)', 'Gemini 2.5 (BYOK)', 'DeepSeek R3 (BYOK)'].map((n) => (
            <WireListRow
              key={n}
              dark={dark}
              leading={<WireIcon dark={dark} size={22} glyph={n[0]} />}
              title={n}
              sub="·"
              trailing={<WireGlyph dark={dark} kind="chev" size={14} />}
            />
          ))}
        </div>
      </WireSheet>
    </WirePhone>
  );
}

// V4 — Decision tree · "What are you doing?" → recs
function Picker_V4({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark} style={{ opacity: 0.18 }}>
        <div style={{ flex: 1 }} />
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 30 }} />
      <WireSheet dark={dark} h={680} style={{ zIndex: 40 }}>
        <div style={{ padding: '0 22px 6px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            STEP 1
          </WireText>
          <div style={{ marginTop: 4 }}>
            <span className="wf-script" style={{ fontSize: 22, fontWeight: 700, color: p.ink }}>
              What are you trying to do?
            </span>
          </div>
        </div>
        <div
          style={{
            padding: '12px 18px',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 10,
          }}
        >
          {[
            ['code', 'Refactor / build code', true],
            ['pencil', 'Write or edit prose'],
            ['globe', 'Research with sources'],
            ['img', 'Generate an image'],
            ['waveform', 'Talk it out'],
            ['cpu', 'Run on-device'],
          ].map(([g, t, sel]) => (
            <div
              key={t}
              style={{
                padding: 12,
                borderRadius: 12,
                border: `${sel ? 2 : 1.2}px solid ${sel ? p.accent : p.ink3}`,
                background: dark ? (sel ? p.accentSoft : p.surface) : sel ? '#dceaeb' : '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <WireGlyph dark={dark} kind={g} size={20} />
              <WireText dark={dark} hand size={12}>
                {t}
              </WireText>
            </div>
          ))}
        </div>
        <div style={{ padding: '6px 22px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            RECOMMENDED
          </WireText>
        </div>
        <div style={{ padding: '4px 0' }}>
          {[
            ['Sonnet 4.6', 'Balanced for refactor work · ~$0.002/turn', true],
            ['Opus 4.7', 'Best for tricky reasoning · 82% used', false],
            ['Llama 3.2 3B', 'On-device · slower but free', false],
          ].map(([n, m, sel]) => (
            <WireListRow
              key={n}
              dark={dark}
              h={50}
              leading={<WireIcon dark={dark} size={26} glyph={n[0]} />}
              title={n}
              sub={m}
              trailing={sel ? <WireGlyph dark={dark} kind="check" size={18} /> : null}
            />
          ))}
        </div>
      </WireSheet>
    </WirePhone>
  );
}

// V5 — Cost-first table · numbers up front
function Picker_V5({ dark = false }) {
  const p = wfPalette(dark);
  const rows = [
    ['Opus 4.7', '$0.012', '~14s', 'reasoning', true, '82% used'],
    ['Sonnet 4.6', '$0.002', '~3s', 'balanced', false, ''],
    ['Haiku 4', '$0.0005', '~1s', 'fast', false, ''],
    ['Llama 3.2 3B', 'free', '~6s', 'local', false, 'on-device'],
    ['GPT-5.4', '~$0.018', '~5s', 'BYOK', false, ''],
  ];
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark} style={{ opacity: 0.18 }}>
        <div style={{ flex: 1 }} />
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 30 }} />
      <WireSheet dark={dark} h={620} style={{ zIndex: 40 }}>
        <div style={{ padding: '0 18px 6px' }}>
          <WireText dark={dark} hand size={15} weight={600}>
            Cost & speed
          </WireText>
        </div>
        <div style={{ padding: '6px 18px 0' }}>
          <div
            style={{
              borderRadius: 12,
              border: `1.5px solid ${p.rule}`,
              background: dark ? p.surface : '#fff',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 1fr 0.8fr 0.8fr 0.4fr',
                padding: '8px 10px',
                background: dark ? p.raised : '#f5f0e3',
              }}
            >
              {['Model', 'cost/turn', 'p50', 'note', ''].map((h, i) => (
                <span
                  key={i}
                  className="wf-arch"
                  style={{
                    fontSize: 9,
                    color: p.ink3,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  {h}
                </span>
              ))}
            </div>
            {rows.map(([n, c, lat, note, sel, tag], i) => (
              <div
                key={n}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 1fr 0.8fr 0.8fr 0.4fr',
                  padding: '10px 10px',
                  borderTop: `1px dashed ${p.ink4}`,
                  background: sel ? (dark ? p.accentSoft : '#dceaeb') : 'transparent',
                  alignItems: 'center',
                }}
              >
                <div>
                  <WireText dark={dark} hand size={12} weight={sel ? 600 : 400}>
                    {n}
                  </WireText>
                  {tag && (
                    <div>
                      <WireText
                        dark={dark}
                        hand
                        size={9}
                        color={tag === '82% used' ? p.danger : p.ok}
                      >
                        · {tag}
                      </WireText>
                    </div>
                  )}
                </div>
                <WireText dark={dark} mono size={11}>
                  {c}
                </WireText>
                <WireText dark={dark} mono size={11}>
                  {lat}
                </WireText>
                <WireText dark={dark} hand size={11} color={p.ink3}>
                  {note}
                </WireText>
                {sel ? <WireGlyph dark={dark} kind="check" size={14} /> : <div />}
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 12,
              border: `1.2px dashed ${p.ink3}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <WireText dark={dark} hand size={12}>
              Group by provider
            </WireText>
            <span className="wf-hand" style={{ fontSize: 11, color: p.accent }}>
              switch →
            </span>
          </div>
        </div>
      </WireSheet>
    </WirePhone>
  );
}

// V6 — Inline composer expansion · no sheet, model picker grows the composer
function Picker_V6({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar
        dark={dark}
        left="menu"
        title=""
        right={<WireGlyph dark={dark} kind="plus" size={22} />}
      />
      <WireBg dark={dark} style={{ opacity: 0.2 }}>
        <WireBubble dark={dark} role="user">
          <WireParagraph dark={dark} lines={1} widths={['52%']} />
        </WireBubble>
      </WireBg>
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background: p.bg,
          borderTop: `1.5px solid ${p.rule}`,
          padding: '12px 14px 16px',
          zIndex: 40,
        }}
      >
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 12,
            border: `1.5px solid ${p.rule}`,
            background: dark ? p.surface : '#fff',
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <WireGlyph dark={dark} kind="search" size={14} />
            <WireText dark={dark} hand size={13} color={p.ink3} italic>
              Filter models…
            </WireText>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {['cheapest', 'fastest', 'on-device', 'most powerful'].map((t) => (
            <WireChip key={t} dark={dark}>
              {t}
            </WireChip>
          ))}
        </div>
        <div style={{ maxHeight: 280, overflow: 'auto' }} className="wf-scroll">
          {[
            ['Sonnet 4.6', '~$0.002', true],
            ['Opus 4.7', '~$0.012 · 82% used', false],
            ['Haiku 4', '~$0.0005', false],
            ['Llama 3.2 3B', 'on-device · Tier 2', false],
            ['GPT-5.4', 'BYOK', false],
          ].map(([n, m, sel]) => (
            <div
              key={n}
              style={{
                padding: '10px 4px',
                borderTop: `1px dashed ${p.ink4}`,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <WireIcon dark={dark} size={22} glyph={n[0]} />
              <div style={{ flex: 1 }}>
                <WireText dark={dark} hand size={13} weight={sel ? 600 : 400}>
                  {n}
                </WireText>
                <div>
                  <WireText dark={dark} hand size={10} color={p.ink3}>
                    {m}
                  </WireText>
                </div>
              </div>
              {sel && <WireGlyph dark={dark} kind="check" size={16} />}
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 8,
            padding: '8px 10px',
            borderTop: `1.5px solid ${p.rule}`,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <WireText dark={dark} hand size={12} color={p.ink3}>
            Reasoning
          </WireText>
          <div
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: dark ? p.ink4 : '#e2dccb',
              position: 'relative',
            }}
          >
            <div style={{ width: '50%', height: '100%', background: p.accent, borderRadius: 2 }} />
          </div>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            Med
          </WireText>
        </div>
      </div>
    </WirePhone>
  );
}

// ────────────────────────────────────────────────────────────────
// D14 · Voice recording (full-screen takeover)
// ────────────────────────────────────────────────────────────────
function VoiceRecord({ dark = true, state = 'recording' }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <div
        style={{
          flex: 1,
          background: p.bg,
          color: p.ink,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* top */}
        <div
          style={{
            padding: '20px 28px 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <WireText dark={dark} mono size={20} weight={600}>
            00:24
          </WireText>
          <div style={{ padding: '4px 10px', borderRadius: 12, border: `1px dashed ${p.ink3}` }}>
            <span className="wf-hand" style={{ fontSize: 11, color: p.ink3 }}>
              on-device · iOS Speech
            </span>
          </div>
        </div>
        {/* orb */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
          }}
        >
          <div style={{ position: 'relative', width: 200, height: 200 }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: p.brand,
                opacity: 0.12,
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 24,
                borderRadius: '50%',
                background: p.brand,
                opacity: 0.25,
              }}
            />
            <div
              style={{ position: 'absolute', inset: 60, borderRadius: '50%', background: p.brand }}
            />
          </div>
          {/* waveform */}
          <svg width="280" height="40" viewBox="0 0 280 40">
            {Array.from({ length: 36 }).map((_, i) => {
              const h = 4 + Math.abs(Math.sin(i * 1.7)) * 28;
              return (
                <rect
                  key={i}
                  x={i * 8}
                  y={20 - h / 2}
                  width="3"
                  height={h}
                  rx="1.5"
                  fill={p.ink2}
                  opacity={0.7}
                />
              );
            })}
          </svg>
          <WireText dark={dark} hand size={14} color={p.ink3}>
            {state === 'recording' ? 'Listening…' : 'Transcribing…'}
          </WireText>
        </div>
        {/* controls */}
        <div
          style={{
            padding: '0 24px 36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              border: `1.5px solid ${p.rule}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WireGlyph dark={dark} kind="x" size={22} />
          </div>
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              background: p.brand,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WireGlyph dark={true} kind="send" size={28} />
          </div>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              border: `1.5px solid ${p.rule}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WireGlyph dark={dark} kind="pause" size={22} />
          </div>
        </div>
      </div>
    </WirePhone>
  );
}

// ────────────────────────────────────────────────────────────────
// D15 · Voice review · transcript in composer
// ────────────────────────────────────────────────────────────────
function VoiceReview({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar
        dark={dark}
        left="menu"
        title=""
        right={<WireGlyph dark={dark} kind="plus" size={22} />}
      />
      <WireBg dark={dark}>
        <WireBubble dark={dark} role="user">
          <WireParagraph dark={dark} lines={1} widths={['52%']} />
        </WireBubble>
        <WireBubble dark={dark} role="assistant">
          <WireParagraph dark={dark} lines={3} />
        </WireBubble>
      </WireBg>
      <div
        style={{ padding: '10px 14px 14px', borderTop: `1px dashed ${p.ink4}`, background: p.bg }}
      >
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 18,
            border: `1.5px solid ${p.accent}`,
            background: dark ? p.surface : '#fff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <WireGlyph dark={dark} kind="check" size={14} />
            <WireText dark={dark} hand size={11} color={p.accent}>
              TRANSCRIBED · 00:24 · on-device
            </WireText>
          </div>
          <WireText dark={dark} hand size={14}>
            Can you help me refactor the validator we just discussed to handle recursive tree nodes?
            Use discriminated unions if possible.
          </WireText>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <WireGlyph dark={dark} kind="mic" size={18} />
            <span className="wf-hand" style={{ fontSize: 12, color: p.accent }}>
              Tap to re-record
            </span>
            <div style={{ flex: 1 }} />
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                background: p.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <WireGlyph dark={true} kind="send" size={16} />
            </div>
          </div>
        </div>
      </div>
    </WirePhone>
  );
}

function renderSectionD() {
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
      id="composer"
      title="05 — Composer overlays"
      subtitle="plus menu · model picker (6 variants) · voice record · voice review"
    >
      {wrap(
        'd12-v1-light',
        '05.1 · Plus menu · V1 AGI grid · light',
        false,
        <PlusMenu_V1 dark={false} />,
      )}
      {wrap(
        'd12-v2-light',
        '05.1 · Plus menu · V2 Perplexity Options · light',
        false,
        <PlusMenu_V2 dark={false} />,
      )}
      {wrap(
        'd12-v3-light',
        '05.1 · Plus menu · V3 ChatGPT list+strip · light',
        false,
        <PlusMenu_V3 dark={false} />,
      )}
      {wrap(
        'd12-v2-dark',
        '05.1 · Plus menu · V2 Perplexity Options · dark',
        true,
        <PlusMenu_V2 dark />,
      )}
      {wrap(
        'd12-v3-dark',
        '05.1 · Plus menu · V3 ChatGPT list+strip · dark',
        true,
        <PlusMenu_V3 dark />,
      )}

      {wrap(
        'd13-v1-light',
        '05.2 · Model picker · V1 task-groups + slider · light',
        false,
        <Picker_V1 dark={false} />,
      )}
      {wrap(
        'd13-v2-light',
        '05.2 · Model picker · V2 by-provider list · light',
        false,
        <Picker_V2 dark={false} />,
      )}
      {wrap(
        'd13-v3-light',
        '05.2 · Model picker · V3 carousel tiles · light',
        false,
        <Picker_V3 dark={false} />,
      )}
      {wrap(
        'd13-v4-light',
        '05.2 · Model picker · V4 decision-tree · light',
        false,
        <Picker_V4 dark={false} />,
      )}
      {wrap(
        'd13-v5-light',
        '05.2 · Model picker · V5 cost-table · light',
        false,
        <Picker_V5 dark={false} />,
      )}
      {wrap(
        'd13-v6-light',
        '05.2 · Model picker · V6 inline-expansion · light',
        false,
        <Picker_V6 dark={false} />,
      )}

      {wrap('d13-v1-dark', '05.2 · Model picker · V1 task-groups · dark', true, <Picker_V1 dark />)}
      {wrap('d13-v5-dark', '05.2 · Model picker · V5 cost-table · dark', true, <Picker_V5 dark />)}

      {wrap('d14-dark', '05.3 · Voice recording · dark', true, <VoiceRecord dark />)}
      {wrap('d14-light', '05.3 · Voice recording · light', false, <VoiceRecord dark={false} />)}
      {wrap(
        'd14-transcribing',
        '05.3 · Voice transcribing · dark',
        true,
        <VoiceRecord dark state="transcribing" />,
      )}

      {wrap('d15-light', '05.4 · Voice review · light', false, <VoiceReview dark={false} />)}
      {wrap('d15-dark', '05.4 · Voice review · dark', true, <VoiceReview dark />)}
    </DCSection>
  );
}

Object.assign(window, {
  PlusMenu,
  PlusMenu_V1,
  PlusMenu_V2,
  PlusMenu_V3,
  Picker_V1,
  Picker_V2,
  Picker_V3,
  Picker_V4,
  Picker_V5,
  Picker_V6,
  VoiceRecord,
  VoiceReview,
  renderSectionD,
});
