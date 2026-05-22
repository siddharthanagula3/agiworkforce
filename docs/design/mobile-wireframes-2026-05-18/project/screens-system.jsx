// screens-system.jsx — Page 00 (System) and Page 01 (Components)
// One big non-phone artboard per page showing tokens + the 12 cross-cutting components.

function _SysSwatch({ name, hex, dark, textOn = 'auto' }) {
  const p = wfPalette(dark);
  const on =
    textOn === 'auto'
      ? parseInt(hex.replace('#', ''), 16) > 0x808080
        ? '#1a1915'
        : '#fff'
      : textOn;
  return (
    <div style={{ borderRadius: 10, border: `1.5px solid ${p.rule}`, overflow: 'hidden' }}>
      <div
        style={{
          height: 56,
          background: hex,
          padding: '8px 10px',
          color: on,
          fontFamily: "'Patrick Hand', cursive",
          fontSize: 11,
          display: 'flex',
          alignItems: 'flex-start',
        }}
      >
        {name}
      </div>
      <div style={{ padding: '6px 10px 8px', background: dark ? p.surface : '#fff' }}>
        <span className="wf-mono" style={{ fontSize: 10, color: p.ink2 }}>
          {hex}
        </span>
      </div>
    </div>
  );
}

function _SysSection({ title, dark, children }) {
  const p = wfPalette(dark);
  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          marginBottom: 12,
          paddingBottom: 6,
          borderBottom: `1px dashed ${p.ink3}`,
        }}
      >
        <span className="wf-stamp" style={{ fontSize: 11, color: p.ink2, letterSpacing: 2 }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function SystemPage({ dark }) {
  const p = wfPalette(dark);
  const W = 1280,
    H = 2040;

  // Light + dark palette swatches
  const palette = [
    ['bg-base', '#faf9f7', '#1a1915'],
    ['bg-raised', '#ffffff', '#242220'],
    ['bg-sheet', '#ffffff', '#2e2b28'],
    ['bg-hover', '#f0eeeb', '#363330'],
    ['bg-code', '#f6f8fa', '#11100d'],
    ['text-primary', '#1a1915', '#e8e4db'],
    ['text-secondary', '#6b6560', '#8b8680'],
    ['text-muted', '#8b8680', '#5c5955'],
    ['accent-primary · teal', '#21808d', '#3eb8c4'],
    ['accent-secondary · terracotta', '#da7756', '#e89272'],
    ['state-danger', '#dc2626', '#ef4444'],
    ['state-success', '#16a34a', '#22c55e'],
    ['state-warning', '#d97706', '#f59e0b'],
  ];

  const typeRamp = [
    ['Display', '34/40', 600, 'Hello, Siddhartha'],
    ['H1', '28/34', 600, 'Settings'],
    ['H2', '22/28', 600, 'Memory'],
    ['Body', '16/24', 400, 'Body text — Claude Opus 4.7 just ran.'],
    ['Body-emphasis', '16/24', 600, 'Switch to Sonnet 4.6'],
    ['Caption', '13/18', 400, '↳ Llama 3.2 3B · on-device · Tier 2'],
    ['Mono', '14/22', 400, 'await client.messages.create({…})'],
  ];

  const radii = [
    ['xs · 6', 6],
    ['sm · 10', 10],
    ['md · 14', 14],
    ['lg · 20', 20],
    ['full · 999', 999],
  ];

  return (
    <div
      style={{
        width: W,
        height: H,
        background: p.bg,
        color: p.ink,
        padding: 56,
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 6 }}>
        <span className="wf-script" style={{ fontSize: 48, fontWeight: 700, color: p.ink }}>
          AGI Mobile — System
        </span>
        <span className="wf-hand" style={{ fontSize: 16, color: p.ink3 }}>
          tokens · type · iconography · radius · brand
        </span>
      </div>
      <div style={{ marginBottom: 32 }}>
        <WireText dark={dark} hand size={14} color={p.ink2}>
          {dark ? 'Dark theme' : 'Light theme'} · inherits 16 locked decisions from Desktop v1
          prompt
        </WireText>
      </div>

      <_SysSection title="01 · Color palette" dark={dark}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '180px repeat(2, 1fr)',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <div></div>
          <div>
            <span className="wf-stamp" style={{ fontSize: 10, color: p.ink3 }}>
              LIGHT
            </span>
          </div>
          <div>
            <span className="wf-stamp" style={{ fontSize: 10, color: p.ink3 }}>
              DARK
            </span>
          </div>
          {palette.map(([name, light, darkHex]) => (
            <React.Fragment key={name}>
              <div>
                <WireText dark={dark} hand size={13}>
                  {name}
                </WireText>
              </div>
              <_SysSwatch name={name} hex={light} dark={dark} />
              <_SysSwatch name={name} hex={darkHex} dark={dark} textOn="#fff" />
            </React.Fragment>
          ))}
        </div>
      </_SysSection>

      <_SysSection
        title="02 · Type ramp · SF Pro / Roboto (no custom font load on mobile)"
        dark={dark}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '180px 100px 1fr',
            gap: 10,
            alignItems: 'baseline',
          }}
        >
          {typeRamp.map(([name, sz, wt, sample]) => (
            <React.Fragment key={name}>
              <div>
                <WireText dark={dark} hand size={13} color={p.ink2}>
                  {name}
                </WireText>
              </div>
              <div>
                <span className="wf-mono" style={{ fontSize: 11, color: p.ink3 }}>
                  {sz} / {wt}
                </span>
              </div>
              <div
                style={{
                  fontFamily:
                    name === 'Mono'
                      ? 'JetBrains Mono, monospace'
                      : '-apple-system, SF Pro, system-ui',
                  fontWeight: wt,
                  fontSize: parseInt(sz),
                  color: p.ink,
                  lineHeight: 1.2,
                }}
              >
                {sample}
              </div>
            </React.Fragment>
          ))}
        </div>
      </_SysSection>

      <_SysSection title="03 · Radius scale" dark={dark}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end' }}>
          {radii.map(([name, r]) => (
            <div
              key={name}
              style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}
            >
              <div
                style={{
                  width: 72,
                  height: 72,
                  background: dark ? p.raised : '#fff',
                  border: `1.5px solid ${p.rule}`,
                  borderRadius: r > 100 ? 36 : r,
                }}
              />
              <WireText dark={dark} hand size={12} color={p.ink3}>
                {name}
              </WireText>
            </div>
          ))}
        </div>
      </_SysSection>

      <_SysSection
        title="04 · Iconography · Lucide 24px / 1.5 stroke (one family, all screens)"
        dark={dark}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14 }}>
          {[
            'menu',
            'plus',
            'send',
            'mic',
            'chev',
            'x',
            'check',
            'search',
            'settings',
            'user',
            'chat',
            'bolt',
            'folder',
            'cam',
            'img',
            'file',
            'github',
            'plug',
            'skill',
            'bell',
            'lock',
            'eye',
            'globe',
            'sliders',
            'pen',
            'trash',
            'star',
            'code',
            'book',
            'spark',
            'cloud',
            'cpu',
            'refresh',
            'heart',
            'flag',
            'calendar',
          ].map((k) => (
            <div
              key={k}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
            >
              <WireGlyph dark={dark} kind={k} size={28} />
              <span className="wf-mono" style={{ fontSize: 9, color: p.ink3 }}>
                {k}
              </span>
            </div>
          ))}
        </div>
      </_SysSection>

      <_SysSection
        title="05 · Brand mark · neutral geometric placeholder (final A/B/C pending)"
        dark={dark}
      >
        <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          <WireBrand dark={dark} size={88} />
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="wf-script" style={{ fontSize: 64, fontWeight: 700, color: p.ink }}>
                AGI
              </span>
              <WireText dark={dark} hand size={20} color={p.ink3}>
                · your AI team.
              </WireText>
            </div>
            <div style={{ marginTop: 12 }}>
              <WireText dark={dark} hand size={13} color={p.ink3}>
                Wordmark always SF Pro Display Bold. Tagline only on About + Onboarding hero.
              </WireText>
            </div>
            <div
              style={{
                marginTop: 10,
                padding: 10,
                border: `1.2px dashed ${p.danger}`,
                borderRadius: 8,
                display: 'inline-block',
              }}
            >
              <WireText dark={dark} hand size={11} color={p.danger}>
                Never mimic: Claude burst · OpenAI spiral · Gemini sparkle · Perplexity orbit
              </WireText>
            </div>
          </div>
        </div>
      </_SysSection>

      <_SysSection title="06 · Three-tier runtime · capability-routed (no UI switcher)" dark={dark}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {[
            ['Tier 1 · Apple Foundation Models', 'iOS 18.2+ · ANE', 'on-device · ~700 MB'],
            [
              'Tier 2 · react-native-executorch',
              'A15+ · ExecuTorch runtime',
              'on-device · Llama 3.2 3B · ~2.1 GB',
            ],
            [
              'Tier 3 · llama.rn (GGUF)',
              'older devices · CPU fallback',
              'on-device · Qwen 2.5 0.5B · ~400 MB',
            ],
          ].map(([t, l1, l2]) => (
            <div
              key={t}
              style={{
                padding: 14,
                border: `1.5px solid ${p.rule}`,
                borderRadius: 12,
                background: dark ? p.surface : '#fff',
              }}
            >
              <WireText dark={dark} hand size={13} weight={600}>
                {t}
              </WireText>
              <div style={{ marginTop: 6 }}>
                <WireText dark={dark} hand size={12} color={p.ink3}>
                  {l1}
                </WireText>
              </div>
              <div style={{ marginTop: 2 }}>
                <WireText dark={dark} hand size={12} color={p.ink3}>
                  {l2}
                </WireText>
              </div>
            </div>
          ))}
        </div>
      </_SysSection>

      <_SysSection title="07 · v1 = local-only · cloud is waitlist" dark={dark}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              border: `1.5px dashed ${p.ok}`,
              background: dark ? '#1a2922' : '#d9eddc',
            }}
          >
            <WireText dark={dark} hand size={12} color={p.ok}>
              SHIPS IN v1 · FREE FOREVER
            </WireText>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                'Text chat · capability-routed',
                'Image analysis with question',
                'Voice in + voice out',
                'File Q&A (PDF, TXT, MD, code)',
                'HealthKit · Photos · Calendar · Files',
                'OCR · Translate',
                'Memory (local-encrypted sqlite-vec)',
                'Skills (copy from GitHub)',
                'Projects',
                'Multi-model compare across local',
              ].map((t) => (
                <div key={t} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <WireGlyph dark={dark} kind="check" size={11} />
                  <WireText dark={dark} hand size={11}>
                    {t}
                  </WireText>
                </div>
              ))}
            </div>
          </div>
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              border: `1.5px dashed ${p.ink3}`,
              background: dark ? p.surface : '#fbf8f1',
            }}
          >
            <WireText dark={dark} hand size={12} color={p.ink3}>
              WAITLIST · CLOUD UNLOCKS
            </WireText>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                'Bigger cloud models (Opus, GPT-5, Gemini)',
                'BYOK provider key entry',
                'Web search',
                'Computer use',
                'Server-OAuth connectors (GitHub, Notion, Linear, Slack, Drive)',
                'Plaid · Finance',
                'Cloud subscriptions + top-up (PPP-adjusted, India-first)',
              ].map((t) => (
                <div key={t} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <WireGlyph dark={dark} kind="lock" size={11} />
                  <WireText dark={dark} hand size={11} color={p.ink2}>
                    {t}
                  </WireText>
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: 8,
                padding: '6px 10px',
                borderRadius: 8,
                background: dark ? p.bg : '#fff',
              }}
            >
              <WireText dark={dark} hand size={10} color={p.ink3}>
                Image generation deferred to v1.1 (thermal cost too high in 2026)
              </WireText>
            </div>
          </div>
        </div>
      </_SysSection>

      <_SysSection title="08 · Developer brand · India-first GTM" dark={dark}>
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            border: `1.5px solid ${p.rule}`,
            background: dark ? p.surface : '#fff',
          }}
        >
          <WireText dark={dark} hand size={14} weight={600}>
            AGI Automation LLC · Delaware, USA
          </WireText>
          <div
            style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}
          >
            {[
              'Apple-verified developer',
              'DPDP Act 2023 compliant',
              'No account required',
              'Works in airplane mode',
              'Your conversations never leave your phone',
              'Hindi UI · deferred to v1.1',
            ].map((s) => (
              <div
                key={s}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: dark ? p.bg : '#f6f4ec',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <WireGlyph dark={dark} kind="check" size={12} />
                <WireText dark={dark} hand size={10}>
                  {s}
                </WireText>
              </div>
            ))}
          </div>
        </div>
      </_SysSection>

      <WireStateStamp dark={dark} color={dark ? '#f59e0b' : '#b56700'}>
        {dark ? 'Dark · WIP' : 'Light · WIP'}
      </WireStateStamp>
    </div>
  );
}

function ComponentsPage({ dark }) {
  const p = wfPalette(dark);
  const W = 1280,
    H = 1640;

  const Tile = ({ name, children, h = 130 }) => (
    <div
      style={{
        padding: 14,
        border: `1.5px solid ${p.rule}`,
        borderRadius: 12,
        background: dark ? p.surface : '#fff',
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <WireText dark={dark} hand size={12} weight={600}>
          {name}
        </WireText>
      </div>
      <div
        style={{
          minHeight: h,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        {children}
      </div>
    </div>
  );

  return (
    <div
      style={{
        width: W,
        height: H,
        background: p.bg,
        color: p.ink,
        padding: 56,
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 24 }}>
        <span className="wf-script" style={{ fontSize: 44, fontWeight: 700 }}>
          Cross-cutting components
        </span>
        <span className="wf-hand" style={{ fontSize: 16, color: p.ink3 }}>
          12 reusables · §5 of prompt
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <Tile name="01 · Provenance chip (lock #8)">
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}
          >
            <WireProvenance
              dark={dark}
              model="Apple Foundation 3B"
              tier="Tier 1"
              tps="38 t/s"
              ttft="90ms"
            />
            <WireProvenance
              dark={dark}
              model="Llama 3.2 3B"
              tier="Tier 2"
              tps="22 t/s"
              ttft="180ms"
            />
            <WireProvenance
              dark={dark}
              model="Qwen 2.5 0.5B"
              tier="Tier 3"
              tps="14 t/s"
              ttft="60ms"
            />
          </div>
        </Tile>

        <Tile name="02 · Tool-call bar">
          <div style={{ width: '100%' }}>
            <WireToolCall dark={dark} label="web_search" status="done · 4 results" />
            <WireToolCall dark={dark} label="read_file" status="running…" expanded />
          </div>
        </Tile>

        <Tile name="03 · Inline citation pill">
          <div style={{ padding: 8 }}>
            <WireText dark={dark} hand size={13}>
              The drawer pattern (vs bottom tab) reduces vertical chrome on mobile
              <sup
                style={{
                  marginLeft: 2,
                  padding: '1px 5px',
                  borderRadius: 8,
                  border: `1px solid ${p.accent}`,
                  color: p.accent,
                  fontSize: 9,
                }}
              >
                1
              </sup>
              and matches Claude iOS density
              <sup
                style={{
                  marginLeft: 2,
                  padding: '1px 5px',
                  borderRadius: 8,
                  border: `1px solid ${p.accent}`,
                  color: p.accent,
                  fontSize: 9,
                }}
              >
                2
              </sup>
              .
            </WireText>
          </div>
        </Tile>

        <Tile name="04 · Sheet handle">
          <div
            style={{
              width: '100%',
              padding: 20,
              background: p.bg,
              border: `1px dashed ${p.ink4}`,
              borderRadius: 10,
            }}
          >
            <div
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                background: p.ink3,
                margin: '0 auto',
              }}
            />
          </div>
        </Tile>

        <Tile name="05 · Snackbar / toast">
          <div
            style={{
              width: '100%',
              padding: '10px 14px',
              background: p.ink,
              color: p.bg,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <WireGlyph dark={!dark} kind="check" size={16} />
            <span className="wf-hand" style={{ flex: 1, fontSize: 13 }}>
              Memory saved
            </span>
            <span className="wf-hand" style={{ fontSize: 12, color: p.accentSoft }}>
              Undo
            </span>
          </div>
        </Tile>

        <Tile name="06 · Empty-state illustration">
          <div style={{ width: '100%', textAlign: 'center', padding: 14 }}>
            <WireBrand dark={dark} size={44} />
            <div style={{ marginTop: 8 }}>
              <WireText dark={dark} hand size={14} weight={600}>
                No projects yet
              </WireText>
            </div>
            <div style={{ marginTop: 4 }}>
              <WireText dark={dark} hand size={12} color={p.ink3}>
                Start one and pin it to memory
              </WireText>
            </div>
            <div style={{ marginTop: 10 }}>
              <WireButton dark={dark} variant="fill" size="sm">
                + New project
              </WireButton>
            </div>
          </div>
        </Tile>

        <Tile name="07 · Loading skeleton">
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <WireAvatar dark={dark} size={28} />
              <div style={{ flex: 1 }}>
                <WireParagraph dark={dark} lines={2} widths={['60%', '45%']} />
              </div>
            </div>
            <WireParagraph dark={dark} lines={3} />
          </div>
        </Tile>

        <Tile name="08 · Cap banner">
          <WireBanner dark={dark} kind="warn" action="View">
            82% of Opus used today · resets in 6h
          </WireBanner>
        </Tile>

        <Tile name="09 · Cap-reached (DEPRECATED in v1 — kept as ref)">
          <div
            style={{
              width: '100%',
              padding: 14,
              background: p.bg,
              border: `1.5px dashed ${p.ink3}`,
              borderRadius: 12,
              opacity: 0.6,
            }}
          >
            <WireGlyph dark={dark} kind="lock" size={20} />
            <div style={{ marginTop: 6 }}>
              <WireText dark={dark} hand size={13} weight={600}>
                v1 has no caps — runs free on-device.
              </WireText>
            </div>
            <div style={{ marginTop: 4 }}>
              <WireText dark={dark} hand size={11} color={p.ink3}>
                Caps return when cloud opens (post-waitlist).
              </WireText>
            </div>
          </div>
        </Tile>

        <Tile name="10 · Cloud waitlist preview">
          <div
            style={{
              width: '100%',
              padding: 14,
              background: p.bg,
              border: `1.5px solid ${p.rule}`,
              borderRadius: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <WireGlyph dark={dark} kind="cloud" size={18} />
              <WireText dark={dark} hand size={13} weight={600}>
                Cloud is on the waitlist
              </WireText>
            </div>
            <div style={{ marginTop: 6 }}>
              <WireText dark={dark} hand size={12} color={p.ink3}>
                v1 ships on-device. Email us for Opus/GPT-5/Gemini.
              </WireText>
            </div>
            <div style={{ marginTop: 10 }}>
              <WireButton dark={dark} variant="accent" size="sm">
                Join waitlist
              </WireButton>
            </div>
          </div>
        </Tile>

        <Tile name="11 · Permission prompt (in-app)">
          <div
            style={{
              width: '100%',
              padding: 14,
              background: p.bg,
              border: `1.5px solid ${p.rule}`,
              borderRadius: 12,
            }}
          >
            <WireGlyph dark={dark} kind="mic" size={20} />
            <div style={{ marginTop: 6 }}>
              <WireText dark={dark} hand size={13} weight={600}>
                Use your mic for voice input?
              </WireText>
            </div>
            <div style={{ marginTop: 4 }}>
              <WireText dark={dark} hand size={11} color={p.ink3}>
                Audio stays on-device by default. You can opt into Whisper API in Settings → Voice.
              </WireText>
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
              <WireButton dark={dark} variant="accent" size="sm">
                Allow
              </WireButton>
              <WireButton dark={dark} size="sm">
                Not now
              </WireButton>
            </div>
          </div>
        </Tile>

        <Tile name="12 · Provider-key entry (DEPRECATED in v1)">
          <div
            style={{
              width: '100%',
              padding: 14,
              background: p.bg,
              border: `1.5px dashed ${p.ink3}`,
              borderRadius: 12,
              opacity: 0.6,
            }}
          >
            <WireGlyph dark={dark} kind="cloud" size={20} />
            <div style={{ marginTop: 6 }}>
              <WireText dark={dark} hand size={13} weight={600}>
                BYOK returns post-waitlist
              </WireText>
            </div>
            <div style={{ marginTop: 4 }}>
              <WireText dark={dark} hand size={11} color={p.ink3}>
                v1 doesn't surface API-key entry. Cloud waitlist gates it.
              </WireText>
            </div>
          </div>
        </Tile>
      </div>

      <WireStateStamp dark={dark} color={dark ? '#f59e0b' : '#b56700'}>
        {dark ? 'Dark' : 'Light'}
      </WireStateStamp>
    </div>
  );
}

function renderSection00() {
  return (
    <DCSection
      id="sys00"
      title="00 — System"
      subtitle="tokens · type · iconography · radius · brand"
    >
      <DCArtboard id="sys-light" label="00.1 · System · light" width={1280} height={2040}>
        <SystemPage dark={false} />
      </DCArtboard>
      <DCArtboard id="sys-dark" label="00.2 · System · dark" width={1280} height={2040}>
        <SystemPage dark={true} />
      </DCArtboard>
    </DCSection>
  );
}

function renderSection01() {
  return (
    <DCSection id="comp01" title="01 — Components" subtitle="12 cross-cutting reusables (§5)">
      <DCArtboard id="comp-light" label="01.1 · Components · light" width={1280} height={1640}>
        <ComponentsPage dark={false} />
      </DCArtboard>
      <DCArtboard id="comp-dark" label="01.2 · Components · dark" width={1280} height={1640}>
        <ComponentsPage dark={true} />
      </DCArtboard>
    </DCSection>
  );
}

Object.assign(window, { SystemPage, ComponentsPage, renderSection00, renderSection01 });
