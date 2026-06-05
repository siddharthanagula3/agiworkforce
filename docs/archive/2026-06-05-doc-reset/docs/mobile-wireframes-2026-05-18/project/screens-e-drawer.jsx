// screens-e-drawer.jsx — Section E · Drawer + nav (3 screens, 6 variants on drawer)

const DRAWER_ITEMS = [
  ['chat', 'Chat', true],
  ['skill', 'Skills'],
  ['folder', 'Projects'],
  ['arrow', 'Dispatch'],
  ['plug', 'Connectors'],
  ['settings', 'Settings'],
];

// V1 — Conventional left drawer · avatar top, items, About bottom
function Drawer_V1({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar
        dark={dark}
        left="menu"
        title=""
        right={<WireGlyph dark={dark} kind="plus" size={22} />}
      />
      <WireBg dark={dark} style={{ opacity: 0.15 }}>
        <div style={{ flex: 1 }} />
      </WireBg>
      <WireDrawer dark={dark} w={340}>
        {/* profile */}
        <div style={{ padding: '20px 18px 16px', borderBottom: `1px dashed ${p.ink4}` }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <WireAvatar dark={dark} size={44} label="S" />
            <div style={{ flex: 1 }}>
              <WireText dark={dark} hand size={14} weight={600}>
                Siddhartha Bhat
              </WireText>
              <div style={{ marginTop: 2 }}>
                <WireText dark={dark} hand size={11} color={p.ink3}>
                  siddhartha@example.com
                </WireText>
              </div>
            </div>
            <div style={{ padding: '3px 8px', borderRadius: 10, border: `1px solid ${p.ok}` }}>
              <span className="wf-hand" style={{ fontSize: 10, color: p.ok }}>
                LOCAL
              </span>
            </div>
          </div>
        </div>
        {/* items */}
        <div style={{ padding: '8px 0' }}>
          {DRAWER_ITEMS.map(([g, name, active]) => (
            <div
              key={name}
              style={{
                margin: '2px 10px',
                padding: '11px 12px',
                borderRadius: 10,
                background: active ? (dark ? p.raised : '#ebe5d4') : 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <WireGlyph dark={dark} kind={g} size={20} />
              <WireText dark={dark} hand size={14} weight={active ? 600 : 400}>
                {name}
              </WireText>
              {active && (
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <span className="wf-hand" style={{ fontSize: 10, color: p.ink3 }}>
                    ·
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ padding: '12px 22px 18px', borderTop: `1px dashed ${p.ink4}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
            <WireGlyph dark={dark} kind="info" size={18} />
            <WireText dark={dark} hand size={13}>
              About AGI
            </WireText>
          </div>
          <WireText dark={dark} hand size={10} color={p.ink3}>
            v1.0.0 · build 1 · @sidd
          </WireText>
        </div>
      </WireDrawer>
    </WirePhone>
  );
}

// V2 — ChatGPT-style · features list + Projects folders + Recents · floating new-chat FAB
function Drawer_V2({ dark = false }) {
  const p = wfPalette(dark);
  const features = [
    ['img', 'Images'],
    ['code', 'Codex'],
    ['globe', 'More'],
  ];
  const projects = [
    ['+ New project', true],
    ['AGI Automation LLC'],
    ['jobs'],
    ['claude prompt'],
    ['··· See more'],
  ];
  const recents = [
    'Mobile AI App Strategy',
    'Credit Card Rewards Optimization',
    'Secure Financial Connection Help',
    'Secure Financial Connections',
    'Secure Financial Account Connection',
    'AGI Workforce Competitive Analysis',
    'ChatGPT Pro Mode Selection',
  ];
  return (
    <WirePhone dark={dark}>
      <div
        style={{
          flex: 1,
          background: p.bg,
          color: p.ink,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* top bar */}
        <div style={{ padding: '12px 18px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="wf-script" style={{ fontSize: 26, fontWeight: 700, color: p.ink }}>
            AGI
          </span>
          <div style={{ flex: 1 }} />
          <div
            style={{
              padding: '6px 6px',
              borderRadius: 22,
              background: dark ? p.raised : '#f0ece2',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <WireGlyph dark={dark} kind="search" size={18} />
            </div>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                background: p.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span className="wf-hand" style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>
                SN
              </span>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0 88px' }} className="wf-scroll">
          {/* features */}
          {features.map(([g, n]) => (
            <div
              key={n}
              style={{ padding: '12px 22px', display: 'flex', alignItems: 'center', gap: 14 }}
            >
              <WireGlyph dark={dark} kind={g} size={20} />
              <WireText dark={dark} hand size={15} weight={600}>
                {n}
              </WireText>
            </div>
          ))}

          {/* Projects section */}
          <div style={{ padding: '20px 22px 6px' }}>
            <span className="wf-script" style={{ fontSize: 18, fontWeight: 700, color: p.ink }}>
              Projects
            </span>
          </div>
          {projects.map(([n, plus], i) => (
            <div
              key={n}
              style={{ padding: '10px 22px', display: 'flex', alignItems: 'center', gap: 14 }}
            >
              <WireGlyph
                dark={dark}
                kind={i === 0 ? 'plus' : i === projects.length - 1 ? 'menu' : 'folder2'}
                size={20}
              />
              <WireText dark={dark} hand size={14} weight={500}>
                {n.replace('+ ', '').replace('··· ', '')}
              </WireText>
            </div>
          ))}

          {/* Recents */}
          <div style={{ padding: '20px 22px 6px' }}>
            <span className="wf-script" style={{ fontSize: 18, fontWeight: 700, color: p.ink }}>
              Recents
            </span>
          </div>
          {recents.map((t, i) => (
            <div key={i} style={{ padding: '13px 22px' }}>
              <WireText dark={dark} hand size={14}>
                {t}
              </WireText>
            </div>
          ))}
        </div>

        {/* floating new-chat FAB */}
        <div
          style={{
            position: 'absolute',
            bottom: 18,
            right: 18,
            padding: '10px 18px',
            borderRadius: 24,
            background: p.ink,
            color: p.bg,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <WireGlyph dark={!dark} kind="pen" size={16} />
          <span className="wf-hand" style={{ fontSize: 14, fontWeight: 600 }}>
            Chat
          </span>
        </div>
      </div>
    </WirePhone>
  );
}

// V3 — Icon rail · narrow, icons-only column · second pane on tap
function Drawer_V3({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar dark={dark} left="menu" title="" />
      <WireBg dark={dark} style={{ opacity: 0.15 }}>
        <div style={{ flex: 1 }} />
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 30 }} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 86,
          background: p.bg,
          borderRight: `1.5px solid ${p.rule}`,
          zIndex: 40,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '20px 0', display: 'flex', justifyContent: 'center' }}>
          <WireAvatar dark={dark} size={36} label="S" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 0' }}>
          {DRAWER_ITEMS.map(([g, name, active]) => (
            <div
              key={name}
              style={{
                padding: '14px 0',
                textAlign: 'center',
                background: active ? (dark ? p.raised : '#ebe5d4') : 'transparent',
                borderLeft: active ? `3px solid ${p.accent}` : '3px solid transparent',
              }}
            >
              <WireGlyph dark={dark} kind={g} size={22} />
              <div style={{ marginTop: 2 }}>
                <WireText dark={dark} hand size={9} color={p.ink3}>
                  {name}
                </WireText>
              </div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ padding: '14px 0', textAlign: 'center' }}>
          <WireGlyph dark={dark} kind="settings" size={20} />
        </div>
      </div>
      {/* secondary pane */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 86,
          width: 250,
          background: p.bg,
          borderRight: `1.5px solid ${p.rule}`,
          zIndex: 40,
          padding: '16px',
        }}
      >
        <WireText dark={dark} hand size={14} weight={600}>
          Chat
        </WireText>
        <div style={{ marginTop: 8 }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            RECENT
          </WireText>
        </div>
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {['EU AI Act §50', 'Zod refactor', 'Lisbon trip', 'Sourdough'].map((t) => (
            <div
              key={t}
              style={{ padding: '8px 10px', borderRadius: 8, border: `1px dashed ${p.ink4}` }}
            >
              <WireText dark={dark} hand size={12}>
                {t}
              </WireText>
            </div>
          ))}
        </div>
      </div>
    </WirePhone>
  );
}

// V4 — Full-screen drawer takeover · grid of destinations
function Drawer_V4({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <div
        style={{
          flex: 1,
          background: p.bg,
          color: p.ink,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px 22px 0', display: 'flex', alignItems: 'center' }}>
          <WireGlyph dark={dark} kind="x" size={22} />
          <div style={{ flex: 1 }} />
          <WireAvatar dark={dark} size={32} label="S" />
        </div>
        <div style={{ padding: '24px 22px 0' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            HEY,
          </WireText>
          <div style={{ marginTop: 4 }}>
            <span className="wf-script" style={{ fontSize: 36, fontWeight: 700, color: p.ink }}>
              Siddhartha
            </span>
          </div>
          <div style={{ marginTop: 2 }}>
            <WireChip dark={dark} active>
              Local
            </WireChip>
          </div>
        </div>
        <div
          style={{
            padding: '20px 18px 0',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 10,
          }}
        >
          {DRAWER_ITEMS.map(([g, name, active]) => (
            <div
              key={name}
              style={{
                padding: 18,
                borderRadius: 16,
                border: `${active ? 2 : 1.2}px solid ${active ? p.accent : p.rule}`,
                background: active ? (dark ? p.accentSoft : '#dceaeb') : 'transparent',
              }}
            >
              <WireGlyph dark={dark} kind={g} size={24} />
              <div style={{ marginTop: 8 }}>
                <WireText dark={dark} hand size={15} weight={600}>
                  {name}
                </WireText>
              </div>
              <div style={{ marginTop: 2 }}>
                <WireText dark={dark} hand size={10} color={p.ink3}>
                  {name === 'Chat'
                    ? '3 conversations'
                    : name === 'Skills'
                      ? '12 installed'
                      : name === 'Projects'
                        ? '4 active'
                        : name === 'Dispatch'
                          ? '1 running'
                          : name === 'Connectors'
                            ? '7 connected'
                            : 'tier · billing · privacy'}
                </WireText>
              </div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            padding: '16px 22px',
            display: 'flex',
            justifyContent: 'space-between',
            borderTop: `1px dashed ${p.ink4}`,
          }}
        >
          <WireText dark={dark} hand size={12}>
            About AGI · v1.0.0
          </WireText>
          <WireText dark={dark} hand size={12} color={p.accent}>
            What's new →
          </WireText>
        </div>
      </div>
    </WirePhone>
  );
}

// V5 — Right-side drawer · "team" framing
function Drawer_V5({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar
        dark={dark}
        left={null}
        title=""
        right={<WireGlyph dark={dark} kind="menu" size={24} />}
      />
      <WireBg dark={dark} style={{ opacity: 0.15 }}>
        <div style={{ flex: 1 }} />
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 30 }} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: 340,
          background: p.bg,
          borderLeft: `1.5px solid ${p.rule}`,
          zIndex: 40,
          padding: '16px 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            YOUR AI TEAM
          </WireText>
          <WireGlyph dark={dark} kind="x" size={20} />
        </div>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            ['chat', 'Chat', 'one conversation, every model'],
            ['skill', 'Skills', '12 micro-tools you wrote'],
            ['folder', 'Projects', '4 workspaces · pinned'],
            ['arrow', 'Dispatch', '1 running on Desktop'],
            ['plug', 'Connectors', 'GitHub, Notion, Linear, +4'],
            ['settings', 'Settings', 'tier · memory · privacy'],
          ].map(([g, n, sub]) => (
            <div
              key={n}
              style={{
                padding: '11px 12px',
                borderRadius: 12,
                border: `1.2px solid ${p.ink3}`,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <WireGlyph dark={dark} kind={g} size={20} />
              <div style={{ flex: 1 }}>
                <WireText dark={dark} hand size={13} weight={600}>
                  {n}
                </WireText>
                <div>
                  <WireText dark={dark} hand size={10} color={p.ink3}>
                    {sub}
                  </WireText>
                </div>
              </div>
              <WireGlyph dark={dark} kind="chev" size={16} />
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 14,
            padding: '10px 12px',
            borderRadius: 12,
            background: dark ? p.raised : '#ebe5d4',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <WireAvatar dark={dark} size={36} label="S" />
          <div style={{ flex: 1 }}>
            <WireText dark={dark} hand size={12} weight={600}>
              Siddhartha
            </WireText>
            <div>
              <WireText dark={dark} hand size={10} color={p.ink3}>
                Local · cloud waitlist
              </WireText>
            </div>
          </div>
        </div>
      </div>
    </WirePhone>
  );
}

// V6 — Bottom-sheet "switcher" · gesture-friendly · big tap targets
function Drawer_V6({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar dark={dark} left="menu" title="" />
      <WireBg dark={dark} style={{ opacity: 0.18 }}>
        <div style={{ flex: 1 }} />
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 30 }} />
      <WireSheet dark={dark} h={620} style={{ zIndex: 40 }}>
        <div style={{ padding: '0 18px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0 14px' }}>
            <WireAvatar dark={dark} size={42} label="S" />
            <div style={{ flex: 1 }}>
              <WireText dark={dark} hand size={14} weight={600}>
                Siddhartha
              </WireText>
              <div>
                <WireText dark={dark} hand size={11} color={p.ink3}>
                  Local · 3 models loaded
                </WireText>
              </div>
            </div>
            <WireGlyph dark={dark} kind="settings" size={20} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {DRAWER_ITEMS.map(([g, n, active]) => (
              <div
                key={n}
                style={{
                  aspectRatio: 1,
                  borderRadius: 14,
                  border: `${active ? 2 : 1.2}px solid ${active ? p.accent : p.ink3}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  background: active ? (dark ? p.accentSoft : '#dceaeb') : 'transparent',
                }}
              >
                <WireGlyph dark={dark} kind={g} size={26} />
                <WireText dark={dark} hand size={12} weight={active ? 600 : 400}>
                  {n}
                </WireText>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 12,
              border: `1.2px dashed ${p.ink3}`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <WireGlyph dark={dark} kind="info" size={18} />
            <WireText dark={dark} hand size={12}>
              About AGI · v1.0.0 · build 1
            </WireText>
          </div>
        </div>
      </WireSheet>
    </WirePhone>
  );
}

// E17 · Drawer collapsed (gesture peek)
function DrawerCollapsed({ dark = false }) {
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
      <WireComposer dark={dark} />
      {/* peek strip with gesture finger hint */}
      <div
        style={{
          position: 'absolute',
          top: 60,
          bottom: 36,
          left: 0,
          width: 48,
          background: p.bg,
          borderRight: `1.5px solid ${p.rule}`,
          zIndex: 30,
          padding: '14px 6px 0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {DRAWER_ITEMS.slice(0, 4).map(([g, n], i) => (
          <div
            key={n}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: i === 0 ? (dark ? p.raised : '#ebe5d4') : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WireGlyph dark={dark} kind={g} size={18} />
          </div>
        ))}
      </div>
      {/* gesture indicator */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: 56,
          transform: 'translateY(-50%)',
          zIndex: 35,
          padding: '6px 10px',
          borderRadius: 16,
          background: p.ink,
          color: p.bg,
        }}
      >
        <span className="wf-hand" style={{ fontSize: 11 }}>
          ← swipe right to expand
        </span>
      </div>
    </WirePhone>
  );
}

// E18 · About
function About({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar dark={dark} left="back" title="About AGI" />
      <WireBg dark={dark}>
        <div style={{ padding: '32px 24px 0', textAlign: 'center' }}>
          <WireBrand dark={dark} size={64} />
          <div style={{ marginTop: 14 }}>
            <span className="wf-script" style={{ fontSize: 48, fontWeight: 700, color: p.ink }}>
              AGI
            </span>
          </div>
          <div style={{ marginTop: 4 }}>
            <WireText dark={dark} hand size={15} color={p.ink2}>
              your AI team.
            </WireText>
          </div>
          <div style={{ marginTop: 6 }}>
            <WireText dark={dark} hand size={11} color={p.ink3}>
              by AGI Automation LLC · Delaware, USA
            </WireText>
          </div>
        </div>
        {/* trust signals */}
        <div style={{ padding: '20px 18px 0' }}>
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              border: `1.5px dashed ${p.ok}`,
              background: dark ? '#1a2922' : '#d9eddc',
            }}
          >
            {[
              ['Apple-verified developer', 'check'],
              ['DPDP Act 2023 compliant', 'lock'],
              ['No account required', 'user'],
              ['Works in airplane mode', 'cpu'],
              ['Your conversations never leave your phone', 'eye'],
            ].map(([t, g], i) => (
              <div
                key={t}
                style={{
                  padding: '6px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  borderBottom: i < 4 ? `1px dashed ${p.ink4}` : undefined,
                }}
              >
                <WireGlyph dark={dark} kind={g} size={14} />
                <WireText dark={dark} hand size={12} color={p.ok}>
                  {t}
                </WireText>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: '14px 18px 0' }}>
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              border: `1.5px solid ${p.rule}`,
              background: dark ? p.surface : '#fff',
            }}
          >
            {[
              ['Version', '1.0.0 · build 1'],
              ['Released', 'May 18, 2026'],
              ['Mode', 'On-device only · cloud waitlist'],
              ['Device tier', 'Tier 1 · A17 Pro'],
              ['Active model', 'Apple Foundation 3B'],
              ['Cache', '84 MB · 2.18 GB models'],
            ].map(([k, v], i) => (
              <div
                key={k}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: i < 5 ? `1px dashed ${p.ink4}` : undefined,
                }}
              >
                <WireText dark={dark} hand size={13}>
                  {k}
                </WireText>
                <WireText dark={dark} hand size={13} color={p.ink2}>
                  {v}
                </WireText>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            {[
              'Privacy policy',
              'Terms of service',
              'DPDP Act 2023 (India)',
              'Article 50 (EU AI Act)',
              'Open-source acknowledgments',
              'Send feedback',
            ].map((l, i) => (
              <WireListRow
                key={l}
                dark={dark}
                title={l}
                trailing={<WireGlyph dark={dark} kind="chev" size={14} />}
              />
            ))}
          </div>
          <div style={{ marginTop: 14, marginBottom: 14, textAlign: 'center' }}>
            <WireText dark={dark} hand size={11} color={p.ink3}>
              © 2026 AGI Automation LLC · Made with ☕ for Indian devs
            </WireText>
          </div>
        </div>
      </WireBg>
    </WirePhone>
  );
}

function renderSectionE() {
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
      id="drawer"
      title="06 — Drawer & nav"
      subtitle="drawer (6 variants) · gesture peek · about"
    >
      {wrap(
        'e16-v1-light',
        '06.1 · Drawer · V1 conventional · light',
        false,
        <Drawer_V1 dark={false} />,
      )}
      {wrap(
        'e16-v2-light',
        '06.1 · Drawer · V2 ChatGPT-style · light',
        false,
        <Drawer_V2 dark={false} />,
      )}
      {wrap(
        'e16-v3-light',
        '06.1 · Drawer · V3 icon-rail · light',
        false,
        <Drawer_V3 dark={false} />,
      )}
      {wrap(
        'e16-v4-light',
        '06.1 · Drawer · V4 full-screen · light',
        false,
        <Drawer_V4 dark={false} />,
      )}
      {wrap(
        'e16-v5-light',
        '06.1 · Drawer · V5 right-side · light',
        false,
        <Drawer_V5 dark={false} />,
      )}
      {wrap(
        'e16-v6-light',
        '06.1 · Drawer · V6 bottom-sheet · light',
        false,
        <Drawer_V6 dark={false} />,
      )}
      {wrap('e16-v1-dark', '06.1 · Drawer · V1 conventional · dark', true, <Drawer_V1 dark />)}
      {wrap('e16-v2-dark', '06.1 · Drawer · V2 ChatGPT-style · dark', true, <Drawer_V2 dark />)}
      {wrap('e16-v4-dark', '06.1 · Drawer · V4 full-screen · dark', true, <Drawer_V4 dark />)}

      {wrap(
        'e17-light',
        '06.2 · Drawer gesture peek · light',
        false,
        <DrawerCollapsed dark={false} />,
      )}
      {wrap('e17-dark', '06.2 · Drawer gesture peek · dark', true, <DrawerCollapsed dark />)}

      {wrap('e18-light', '06.3 · About · light', false, <About dark={false} />)}
      {wrap('e18-dark', '06.3 · About · dark', true, <About dark />)}
    </DCSection>
  );
}

Object.assign(window, {
  Drawer_V1,
  Drawer_V2,
  Drawer_V3,
  Drawer_V4,
  Drawer_V5,
  Drawer_V6,
  DrawerCollapsed,
  About,
  renderSectionE,
});
