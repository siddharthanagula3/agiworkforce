// screens-android.jsx — Android variants for Drawer, Onboarding, Settings/Storage (per prompt §0)

// Sketchy Android device shell (Pixel-ish, 412×892 dp)
function WireAndroid({ dark, children, label }) {
  const p = wfPalette(dark);
  return (
    <div
      style={{
        width: 412,
        height: 892,
        position: 'relative',
        background: p.bg,
        color: p.ink,
        borderRadius: 42,
        border: `2px solid ${p.rule}`,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* punch-hole camera */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 14,
          height: 14,
          borderRadius: 7,
          background: p.ink,
          zIndex: 50,
        }}
      />
      {/* status bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 36,
          padding: '8px 22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 30,
        }}
      >
        <span className="wf-hand" style={{ fontSize: 12, fontWeight: 600 }}>
          9:41
        </span>
        <div style={{ flex: 1 }} />
        <span className="wf-hand" style={{ fontSize: 11, color: p.ink3 }}>
          ▴ ⌬ ▮
        </span>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 36,
          bottom: 28,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
        className="wf-scroll"
      >
        {children}
      </div>
      {/* gesture pill */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 120,
          height: 4,
          borderRadius: 2,
          background: p.ink,
          opacity: 0.7,
          zIndex: 50,
        }}
      />
      {label && (
        <div
          className="wf-stamp"
          style={{
            position: 'absolute',
            bottom: -22,
            left: 0,
            right: 0,
            textAlign: 'center',
            color: dark ? '#cbc4b3' : '#5c5955',
            fontSize: 11,
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

// Android · Drawer (Material 3 navigation drawer)
function AndroidDrawer({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WireAndroid dark={dark}>
      <div
        style={{
          height: 56,
          padding: '0 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <WireGlyph dark={dark} kind="menu" size={24} />
        <WireText dark={dark} hand size={16} weight={600}>
          AGI
        </WireText>
        <div style={{ flex: 1 }} />
        <WireGlyph dark={dark} kind="search" size={22} />
        <WireGlyph dark={dark} kind="plus" size={22} />
      </div>
      <WireBg dark={dark} style={{ opacity: 0.18 }}>
        <div style={{ flex: 1 }} />
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 30 }} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 320,
          background: p.bg,
          zIndex: 40,
          padding: 0,
          boxShadow: '0 0 24px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ padding: '20px 18px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <WireAvatar dark={dark} size={42} label="S" />
          <div>
            <WireText dark={dark} hand size={14} weight={600}>
              Siddhartha
            </WireText>
            <div>
              <WireText dark={dark} hand size={11} color={p.ink3}>
                Local · siddhartha@
              </WireText>
            </div>
          </div>
        </div>
        <div style={{ padding: '6px 0' }}>
          {[
            ['chat', 'Chat', true],
            ['skill', 'Skills'],
            ['folder', 'Projects'],
            ['arrow', 'Dispatch'],
            ['plug', 'Connectors'],
            ['settings', 'Settings'],
          ].map(([g, n, active]) => (
            <div
              key={n}
              style={{
                margin: '0 12px',
                padding: '12px 16px',
                borderRadius: 28,
                background: active ? (dark ? p.accentSoft : '#dceaeb') : 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <WireGlyph dark={dark} kind={g} size={22} />
              <WireText dark={dark} hand size={14} weight={active ? 600 : 400}>
                {n}
              </WireText>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 'auto', padding: '12px 18px 18px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            v1.0.0 · build 1 · About
          </WireText>
        </div>
      </div>
    </WireAndroid>
  );
}

// Android · Onboarding hero
function AndroidOnboarding({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WireAndroid dark={dark}>
      <WireBg dark={dark}>
        <div
          style={{
            flex: 1,
            padding: '50px 28px 0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <WireBrand dark={dark} size={72} />
          <div style={{ marginTop: 22 }}>
            <span className="wf-script" style={{ fontSize: 56, fontWeight: 700 }}>
              AGI
            </span>
          </div>
          <div style={{ marginTop: 6 }}>
            <WireText dark={dark} hand size={16} color={p.ink2}>
              your AI team.
            </WireText>
          </div>
          <div style={{ marginTop: 14, maxWidth: 300 }}>
            <WireText dark={dark} hand size={13} color={p.ink3}>
              On-device by default. BYOK or paid cloud — your choice.
            </WireText>
          </div>
        </div>
        <div style={{ padding: '0 24px 32px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Material 3 Filled button */}
          <div
            style={{
              height: 56,
              borderRadius: 28,
              background: p.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="wf-hand" style={{ fontSize: 16, color: '#fff', fontWeight: 600 }}>
              Continue
            </span>
          </div>
          {/* Outlined button */}
          <div
            style={{
              height: 50,
              borderRadius: 25,
              border: `1.5px solid ${p.rule}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="wf-hand" style={{ fontSize: 15, color: p.ink, fontWeight: 600 }}>
              Sign in
            </span>
          </div>
        </div>
      </WireBg>
    </WireAndroid>
  );
}

// Android · Storage settings (Material 3 list density)
function AndroidStorage({ dark = false }) {
  const p = wfPalette(dark);
  const segs = [
    ['Conversations', 0.0124, p.accent],
    ['Cache', 0.084, p.brand],
    ['On-device models', 2.1, p.warn],
  ];
  const tot = segs.reduce((a, [, v]) => a + v, 0);
  return (
    <WireAndroid dark={dark}>
      <div
        style={{
          height: 56,
          padding: '0 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          flexShrink: 0,
        }}
      >
        <WireGlyph dark={dark} kind="chevl" size={22} />
        <WireText dark={dark} hand size={17} weight={600}>
          Storage
        </WireText>
      </div>
      <WireBg dark={dark}>
        <div style={{ padding: '8px 18px 14px' }}>
          <div style={{ padding: 16, borderRadius: 20, background: dark ? p.surface : '#f0ece2' }}>
            <WireText dark={dark} hand size={11} color={p.ink3}>
              USED
            </WireText>
            <div style={{ marginTop: 4 }}>
              <span className="wf-script" style={{ fontSize: 36, fontWeight: 700, color: p.ink }}>
                {tot.toFixed(2)} GB
              </span>
            </div>
            <div
              style={{
                marginTop: 12,
                height: 14,
                borderRadius: 7,
                background: dark ? p.bg : '#fff',
                overflow: 'hidden',
                display: 'flex',
              }}
            >
              {segs.map(([n, v, c]) => (
                <div key={n} style={{ width: (v / tot) * 100 + '%', background: c }} />
              ))}
            </div>
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {segs.map(([n, v, c]) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: c }} />
                  <WireText dark={dark} hand size={11}>
                    {n}
                  </WireText>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: '4px 18px 4px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            BREAKDOWN
          </WireText>
        </div>
        {[
          ['Conversations', '12.4 MB · 124 chats', 'Clear'],
          ['Cache', '84 MB · web search, files', 'Clear'],
          ['On-device models', '2.1 GB · Llama 3.2 3B', 'Manage'],
        ].map(([t, sub, action]) => (
          <div
            key={t}
            style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}
          >
            <WireGlyph dark={dark} kind="download" size={22} />
            <div style={{ flex: 1 }}>
              <WireText dark={dark} hand size={14} weight={500}>
                {t}
              </WireText>
              <div>
                <WireText dark={dark} hand size={11} color={p.ink3}>
                  {sub}
                </WireText>
              </div>
            </div>
            <div style={{ padding: '6px 14px', borderRadius: 18, border: `1px solid ${p.ink3}` }}>
              <span className="wf-hand" style={{ fontSize: 13, color: p.ink }}>
                {action}
              </span>
            </div>
          </div>
        ))}
        <div style={{ padding: '14px 18px 24px' }}>
          <div
            style={{
              padding: '14px',
              borderRadius: 16,
              background: dark ? p.dangerSoft : '#fbdada',
              border: `1px solid ${p.danger}`,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <WireGlyph dark={dark} kind="download" size={20} />
            <div style={{ flex: 1 }}>
              <span className="wf-hand" style={{ fontSize: 14, color: p.danger, fontWeight: 600 }}>
                Export all my data
              </span>
              <div>
                <WireText dark={dark} hand size={11} color={p.ink3}>
                  DSAR · emailed as .zip within 24h
                </WireText>
              </div>
            </div>
          </div>
        </div>
      </WireBg>
    </WireAndroid>
  );
}

function renderSectionAndroid() {
  const W = 450,
    H = 980;
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
      id="android"
      title="12 — Android variants"
      subtitle="Drawer · Onboarding · Storage/Settings (per prompt §0)"
    >
      {wrap(
        'and-drawer-light',
        '12.1 · Android drawer · light',
        false,
        <AndroidDrawer dark={false} />,
      )}
      {wrap('and-drawer-dark', '12.1 · Android drawer · dark', true, <AndroidDrawer dark />)}

      {wrap(
        'and-onb-light',
        '12.2 · Android onboarding · light',
        false,
        <AndroidOnboarding dark={false} />,
      )}
      {wrap('and-onb-dark', '12.2 · Android onboarding · dark', true, <AndroidOnboarding dark />)}

      {wrap(
        'and-stor-light',
        '12.3 · Android storage · light',
        false,
        <AndroidStorage dark={false} />,
      )}
      {wrap('and-stor-dark', '12.3 · Android storage · dark', true, <AndroidStorage dark />)}
    </DCSection>
  );
}

Object.assign(window, {
  WireAndroid,
  AndroidDrawer,
  AndroidOnboarding,
  AndroidStorage,
  renderSectionAndroid,
});
