// screens-i-misc.jsx — Section I · Misc surfaces (Billing × 6 variants, Camera, Share, Widgets)

// ─── I35 · Billing/Pricing — 6 VARIANTS ─────────────────────────

const TIERS = [
  {
    n: 'Free',
    p: '$0',
    m: '$0',
    bullets: ['Local-only', 'BYOK unlocked', 'No managed cloud', 'You pay providers'],
    cta: 'Current',
    current: true,
  },
  {
    n: 'Hobby',
    p: '$10',
    m: '$5',
    bullets: ['1M Sonnet tok/mo', '100K Opus tok/mo', '60 voice min', '10 image gens'],
    cta: 'Upgrade',
  },
  {
    n: 'Pro',
    p: '$29.99',
    m: '$24.99',
    bullets: ['5M Sonnet · 500K Opus', '300 voice min', '50 image gens', '50 Computer actions'],
    cta: 'Upgrade',
    popular: true,
  },
  {
    n: 'Pro+',
    p: '$49.99',
    m: '$41.49',
    bullets: [
      '15M Sonnet · 1.5M Opus',
      '1500 voice min',
      '200 image gens',
      '500 Computer · Compare',
    ],
    cta: 'Upgrade',
  },
  {
    n: 'Max',
    p: '$299.99',
    m: '$249',
    bullets: ['50M Sonnet · 5M Opus', 'Unlimited voice', 'Unlimited images', '2500 Computer'],
    cta: 'Upgrade',
  },
];

const TRUST = ['No training on your data', 'BYOK never charged', 'Cancel anytime'];

// V1 — Stacked cards · M/Y toggle · current highlighted (per the spec)
function Billing_V1({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar dark={dark} left="back" title="Plans" />
      <WireBg dark={dark}>
        <div style={{ padding: '14px 18px 12px', display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              display: 'flex',
              padding: 4,
              borderRadius: 16,
              background: dark ? p.surface : '#ebe6d8',
            }}
          >
            <div
              style={{ padding: '6px 16px', borderRadius: 12, background: dark ? p.bg : '#fff' }}
            >
              <span className="wf-hand" style={{ fontSize: 13, fontWeight: 600 }}>
                Monthly
              </span>
            </div>
            <div style={{ padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="wf-hand" style={{ fontSize: 13 }}>
                Yearly
              </span>
              <span
                className="wf-hand"
                style={{
                  fontSize: 9,
                  color: p.ok,
                  padding: '1px 5px',
                  borderRadius: 5,
                  background: p.okSoft,
                  fontWeight: 600,
                }}
              >
                17%
              </span>
            </div>
          </div>
        </div>
        {TIERS.map((t) => (
          <div
            key={t.n}
            style={{
              margin: '8px 14px',
              padding: 16,
              borderRadius: 16,
              border: `${t.current || t.popular ? 2 : 1.5}px solid ${t.current ? p.accent : t.popular ? p.brand : p.rule}`,
              background: dark
                ? t.current
                  ? p.accentSoft
                  : p.surface
                : t.current
                  ? '#dceaeb'
                  : '#fff',
            }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <WireText dark={dark} hand size={18} weight={700}>
                    {t.n}
                  </WireText>
                  {t.popular && (
                    <span
                      className="wf-hand"
                      style={{
                        fontSize: 9,
                        color: '#fff',
                        padding: '2px 7px',
                        borderRadius: 5,
                        background: p.brand,
                        fontWeight: 600,
                      }}
                    >
                      POPULAR
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 2 }}>
                  <span
                    className="wf-script"
                    style={{ fontSize: 28, fontWeight: 700, color: p.ink }}
                  >
                    {t.p}
                  </span>
                  <span className="wf-hand" style={{ fontSize: 12, color: p.ink3 }}>
                    /mo
                  </span>
                </div>
              </div>
              {t.current ? (
                <div style={{ padding: '5px 10px', borderRadius: 12, background: p.accent }}>
                  <span
                    className="wf-hand"
                    style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}
                  >
                    CURRENT
                  </span>
                </div>
              ) : (
                <WireButton dark={dark} size="sm" variant={t.popular ? 'accent' : 'soft'}>
                  {t.cta}
                </WireButton>
              )}
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {t.bullets.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <WireGlyph dark={dark} kind="check" size={12} />
                  <WireText dark={dark} hand size={12}>
                    {b}
                  </WireText>
                </div>
              ))}
            </div>
          </div>
        ))}
        {/* trust */}
        <div style={{ padding: '14px 18px 24px' }}>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: `1px dashed ${p.ink3}`,
              display: 'flex',
              justifyContent: 'space-around',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            {TRUST.map((t) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <WireGlyph dark={dark} kind="check" size={12} />
                <WireText dark={dark} hand size={11} color={p.ink3}>
                  {t}
                </WireText>
              </div>
            ))}
          </div>
        </div>
      </WireBg>
    </WirePhone>
  );
}

// V2 — Horizontal carousel of tiers · big single-card focus
function Billing_V2({ dark = false }) {
  const p = wfPalette(dark);
  const focused = TIERS[2]; // Pro
  return (
    <WirePhone dark={dark}>
      <WireTopBar dark={dark} left="back" title="" />
      <WireBg dark={dark}>
        <div style={{ padding: '12px 24px 0' }}>
          <span className="wf-script" style={{ fontSize: 36, fontWeight: 700, color: p.ink }}>
            Upgrade
          </span>
          <div style={{ marginTop: 4 }}>
            <WireText dark={dark} hand size={14} color={p.ink3}>
              Tap a plan to focus · swipe to compare
            </WireText>
          </div>
        </div>
        <div
          style={{ padding: '20px 14px', display: 'flex', gap: 10, overflowX: 'auto' }}
          className="wf-scroll"
        >
          {TIERS.map((t, i) => (
            <div
              key={t.n}
              style={{
                minWidth: i === 2 ? 280 : 180,
                padding: 18,
                borderRadius: 18,
                border: `${i === 2 ? 2 : 1.2}px solid ${i === 2 ? p.accent : p.ink3}`,
                background: i === 2 ? (dark ? p.accentSoft : '#dceaeb') : dark ? p.surface : '#fff',
                transform: i === 2 ? 'none' : 'scale(0.94)',
                opacity: i === 2 ? 1 : 0.7,
              }}
            >
              <WireText dark={dark} hand size={16} weight={700}>
                {t.n}
              </WireText>
              <div style={{ marginTop: 6 }}>
                <span className="wf-script" style={{ fontSize: 30, fontWeight: 700, color: p.ink }}>
                  {t.p}
                </span>
                <span className="wf-hand" style={{ fontSize: 11, color: p.ink3 }}>
                  /mo
                </span>
              </div>
              {i === 2 && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {t.bullets.map((b, j) => (
                    <div key={j} style={{ display: 'flex', gap: 6 }}>
                      <WireGlyph dark={dark} kind="check" size={12} />
                      <WireText dark={dark} hand size={11}>
                        {b}
                      </WireText>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ padding: '0 18px' }}>
          <WireButton dark={dark} variant="accent" size="xl" w="100%">
            Continue with {focused.n}
          </WireButton>
        </div>
        <div style={{ padding: '20px 18px' }}>
          {TRUST.map((t, i) => (
            <div
              key={t}
              style={{
                padding: '8px 0',
                borderBottom: i < 2 ? `1px dashed ${p.ink4}` : undefined,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <WireGlyph dark={dark} kind="check" size={14} />
              <WireText dark={dark} hand size={13}>
                {t}
              </WireText>
            </div>
          ))}
        </div>
      </WireBg>
    </WirePhone>
  );
}

// V3 — Comparison table · feature × tier
function Billing_V3({ dark = false }) {
  const p = wfPalette(dark);
  const rows = [
    ['Models', 'BYOK', 'BYOK + Hobby', 'all + Pro', 'all + Pro+', 'all + Max'],
    ['Sonnet tok/mo', '0', '1M', '5M', '15M', '50M'],
    ['Opus tok/mo', '0', '100K', '500K', '1.5M', '5M'],
    ['Voice min', 'local', '60', '300', '1500', '∞'],
    ['Image gens', 'BYOK', '10', '50', '200', '∞'],
    ['Computer actions', '—', '—', '50', '500', '2500'],
    ['Compare (multi-model)', '—', '—', '—', '✓', '✓'],
  ];
  return (
    <WirePhone dark={dark}>
      <WireTopBar dark={dark} left="back" title="Compare plans" />
      <WireBg dark={dark}>
        <div style={{ padding: '12px 12px' }}>
          <div
            style={{
              borderRadius: 12,
              overflow: 'hidden',
              border: `1.5px solid ${p.rule}`,
              background: dark ? p.surface : '#fff',
            }}
          >
            {rows.map((row, ri) => (
              <div
                key={ri}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.3fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr',
                  borderTop: ri > 0 ? `1px dashed ${p.ink4}` : undefined,
                  background: ri === 0 ? (dark ? p.raised : '#f0ece2') : 'transparent',
                }}
              >
                {row.map((cell, ci) => (
                  <div
                    key={ci}
                    style={{
                      padding: '8px 6px',
                      textAlign: ci === 0 ? 'left' : 'center',
                      borderRight: ci < 5 ? `1px dashed ${p.ink4}` : undefined,
                    }}
                  >
                    <span
                      className="wf-hand"
                      style={{
                        fontSize: ri === 0 ? 11 : 11,
                        color: ri === 0 ? p.ink2 : p.ink,
                        fontWeight: ri === 0 ? 600 : 400,
                      }}
                    >
                      {cell}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 14,
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 4,
            }}
          >
            {TIERS.map((t, i) => (
              <div
                key={t.n}
                style={{
                  padding: '8px 4px',
                  borderRadius: 10,
                  background: i === 2 ? p.accent : 'transparent',
                  border: i === 2 ? 'none' : `1px solid ${p.ink3}`,
                  textAlign: 'center',
                }}
              >
                <span
                  className="wf-hand"
                  style={{ fontSize: 11, color: i === 2 ? '#fff' : p.ink, fontWeight: 600 }}
                >
                  {t.n}
                </span>
                <div>
                  <span
                    className="wf-hand"
                    style={{ fontSize: 10, color: i === 2 ? '#fff' : p.ink3 }}
                  >
                    {t.p}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </WireBg>
    </WirePhone>
  );
}

// V4 — Slider-based usage estimator
function Billing_V4({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar dark={dark} left="back" title="Find your plan" />
      <WireBg dark={dark}>
        <div style={{ padding: '20px 22px 0' }}>
          <span className="wf-script" style={{ fontSize: 26, fontWeight: 700, color: p.ink }}>
            How much will you use AGI?
          </span>
          <div style={{ marginTop: 4 }}>
            <WireText dark={dark} hand size={13} color={p.ink3}>
              We'll pick the right plan.
            </WireText>
          </div>
        </div>
        <div style={{ padding: '20px 18px' }}>
          {[
            ['Daily Opus prompts', 80, '~$0.012 each'],
            ['Voice minutes / day', 12, 'on-device free'],
            ['Image generations / week', 4, '~$0.04 each'],
            ['Computer-use actions / month', 0, 'Pro+ only'],
          ].map(([n, v, hint]) => (
            <div key={n} style={{ padding: '12px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <WireText dark={dark} hand size={13} weight={600}>
                  {n}
                </WireText>
                <WireText dark={dark} hand size={13} color={p.ink2}>
                  {v}
                </WireText>
              </div>
              <div
                style={{
                  marginTop: 8,
                  height: 4,
                  borderRadius: 2,
                  background: dark ? p.ink4 : '#e2dccb',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    width: Math.min(v, 100) + '%',
                    height: '100%',
                    background: p.accent,
                    borderRadius: 2,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: Math.min(v, 100) + '%',
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
              <div style={{ marginTop: 2 }}>
                <WireText dark={dark} hand size={10} color={p.ink3}>
                  {hint}
                </WireText>
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            margin: '0 14px',
            padding: 16,
            borderRadius: 16,
            border: `2px solid ${p.accent}`,
            background: dark ? p.accentSoft : '#dceaeb',
          }}
        >
          <WireText dark={dark} hand size={11} color={p.accent}>
            RECOMMENDED FOR YOU
          </WireText>
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="wf-script" style={{ fontSize: 36, fontWeight: 700, color: p.ink }}>
              Pro
            </span>
            <WireText dark={dark} hand size={14} color={p.ink2}>
              · $29.99/mo
            </WireText>
          </div>
          <div style={{ marginTop: 6 }}>
            <WireText dark={dark} hand size={12}>
              You'd use ~62% of Pro caps · room to grow.
            </WireText>
          </div>
          <div style={{ marginTop: 12 }}>
            <WireButton dark={dark} variant="accent" size="lg" w="100%">
              Continue with Pro
            </WireButton>
          </div>
        </div>
      </WireBg>
    </WirePhone>
  );
}

// V5 — Single-tier annual savings push
function Billing_V5({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar dark={dark} left="x" title="" />
      <WireBg dark={dark}>
        <div style={{ padding: '20px 24px 0', textAlign: 'center' }}>
          <span className="wf-script" style={{ fontSize: 12, color: p.brand, letterSpacing: 3 }}>
            RECOMMENDED
          </span>
          <div style={{ marginTop: 6 }}>
            <span className="wf-script" style={{ fontSize: 56, fontWeight: 700, color: p.ink }}>
              Pro+
            </span>
          </div>
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <span
              className="wf-hand"
              style={{ fontSize: 18, color: p.ink3, textDecoration: 'line-through' }}
            >
              $49.99
            </span>
            <span className="wf-script" style={{ fontSize: 56, fontWeight: 700, color: p.ink }}>
              $41.49
            </span>
            <WireText dark={dark} hand size={14} color={p.ink2}>
              /mo
            </WireText>
          </div>
          <div style={{ marginTop: 6 }}>
            <span
              className="wf-hand"
              style={{
                fontSize: 11,
                color: p.ok,
                padding: '3px 9px',
                borderRadius: 6,
                background: p.okSoft,
                fontWeight: 600,
              }}
            >
              Save 17% · billed yearly
            </span>
          </div>
        </div>
        <div style={{ padding: '24px 18px' }}>
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              background: dark ? p.surface : '#fff',
              border: `1.5px solid ${p.rule}`,
            }}
          >
            {[
              '15M Sonnet · 1.5M Opus tokens',
              '1500 voice minutes (Whisper API option)',
              '200 image generations',
              '500 Computer-use actions / mo',
              'Compare across 2–3 models',
              'Early access to Tier 1 (Apple Foundation)',
            ].map((b) => (
              <div
                key={b}
                style={{
                  padding: '8px 0',
                  borderBottom: `1px dashed ${p.ink4}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <WireGlyph dark={dark} kind="check" size={14} />
                <WireText dark={dark} hand size={13}>
                  {b}
                </WireText>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: '0 24px 8px' }}>
          <WireButton dark={dark} variant="accent" size="xl" w="100%">
            Start with Pro+ · annual
          </WireButton>
        </div>
        <div style={{ padding: '6px 24px 16px', textAlign: 'center' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            Or pay monthly · $49.99 · <span style={{ color: p.accent }}>switch tier</span>
          </WireText>
        </div>
      </WireBg>
    </WirePhone>
  );
}

// V6 — App Store-style native billing sheet
function Billing_V6({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark} style={{ opacity: 0.18 }}>
        <div style={{ flex: 1 }} />
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 30 }} />
      <WireSheet dark={dark} h={620} style={{ zIndex: 40 }}>
        <div style={{ padding: '0 22px 4px' }}>
          <WireText dark={dark} hand size={15} weight={600}>
            Confirm subscription
          </WireText>
          <div style={{ marginTop: 4 }}>
            <WireText dark={dark} hand size={12} color={p.ink3}>
              Apple ID · siddhartha@example.com
            </WireText>
          </div>
        </div>
        <div
          style={{
            margin: '12px 14px',
            padding: 14,
            borderRadius: 12,
            border: `1.5px solid ${p.rule}`,
            background: dark ? p.surface : '#fff',
          }}
        >
          {[
            ['Plan', 'Pro+ · monthly'],
            ['Renews', 'Jun 18, 2026 · $49.99'],
            ['Today', '$49.99 + tax'],
            ['Pay with', 'Apple Pay · •••• 4242'],
          ].map(([k, v], i) => (
            <div
              key={k}
              style={{
                padding: '8px 0',
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: i < 3 ? `1px dashed ${p.ink4}` : undefined,
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
        <div style={{ padding: '0 18px 14px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            Subscription auto-renews until cancelled. Cancel anytime in Settings → Apple ID. By
            continuing you agree to the App Store's Terms.
          </WireText>
        </div>
        <div style={{ padding: '0 18px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              padding: '14px 18px',
              borderRadius: 14,
              background: p.ink,
              color: p.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <WireGlyph dark={!dark} kind="check" size={18} />
            <span className="wf-hand" style={{ fontSize: 16, fontWeight: 600 }}>
              Confirm with Face ID
            </span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <WireText dark={dark} hand size={13} color={p.accent}>
              Cancel
            </WireText>
          </div>
        </div>
      </WireSheet>
    </WirePhone>
  );
}

// I36 · Camera
function Camera({ dark = true }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <div style={{ flex: 1, background: '#000', position: 'relative' }}>
        <div className={'wf-hatch-d'} style={{ position: 'absolute', inset: 0, opacity: 0.4 }} />
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#fff',
          }}
        >
          <WireGlyph dark={true} kind="x" size={22} />
          <div
            style={{
              padding: '4px 10px',
              borderRadius: 10,
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <span className="wf-hand" style={{ fontSize: 12 }}>
              Attach to chat
            </span>
          </div>
          <WireGlyph dark={true} kind="bolt" size={22} />
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            left: 0,
            right: 0,
            padding: '0 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{ width: 56, height: 56, borderRadius: 10, background: '#444' }}
            className="wf-hatch-d"
          />
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              border: '4px solid #fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: 60, height: 60, borderRadius: 30, background: '#fff' }} />
          </div>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              background: 'rgba(255,255,255,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WireGlyph dark={true} kind="refresh" size={22} />
          </div>
        </div>
      </div>
    </WirePhone>
  );
}

// I37 · Share preview (shared conversation)
function SharePreview({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar
        dark={dark}
        left="back"
        title="Shared chat"
        right={<WireGlyph dark={dark} kind="info" size={20} />}
      />
      <WireBg dark={dark}>
        <div style={{ padding: '14px 18px 6px' }}>
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              border: `1.5px solid ${p.rule}`,
              background: dark ? p.surface : '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <WireAvatar dark={dark} size={32} label="S" />
              <div>
                <WireText dark={dark} hand size={13} weight={600}>
                  Siddhartha shared
                </WireText>
                <WireText dark={dark} hand size={11} color={p.ink3}>
                  · May 18 · 12 turns
                </WireText>
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <span className="wf-script" style={{ fontSize: 22, fontWeight: 700, color: p.ink }}>
                EU AI Act §50 in 4 bullets
              </span>
            </div>
          </div>
        </div>
        <WireBubble dark={dark} role="user">
          <WireText dark={dark} hand size={14}>
            Explain Article 50 of the EU AI Act in 4 bullets.
          </WireText>
        </WireBubble>
        <WireBubble dark={dark} role="assistant">
          <WireText dark={dark} hand size={14}>
            Article 50 is the transparency provision. The four obligations are:
          </WireText>
          <div style={{ height: 6 }} />
          <WireParagraph dark={dark} lines={4} widths={['90%', '78%', '85%', '40%']} />
          <div style={{ height: 6 }} />
          <WireProvenance
            dark={dark}
            model="Apple Foundation 3B"
            tier="Tier 1"
            tps="38 t/s"
            ttft="90ms"
          />
        </WireBubble>
        <WireBubble dark={dark} role="user">
          <WireText dark={dark} hand size={14}>
            How does this apply to open-source models?
          </WireText>
        </WireBubble>
        <WireBubble dark={dark} role="assistant">
          <WireParagraph dark={dark} lines={3} />
        </WireBubble>
      </WireBg>
      <div
        style={{
          padding: '12px 16px 16px',
          borderTop: `1px dashed ${p.ink4}`,
          display: 'flex',
          gap: 8,
        }}
      >
        <div style={{ flex: 1 }}>
          <WireButton dark={dark} variant="accent" size="lg" w="100%">
            Continue in AGI →
          </WireButton>
        </div>
        <WireButton dark={dark} size="lg">
          Sign up
        </WireButton>
      </div>
    </WirePhone>
  );
}

// I38 · Widget setup
function WidgetSetup({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar dark={dark} left="back" title="Home screen widgets" />
      <WireBg dark={dark}>
        {[
          ['Quick chat', 'Tap to start a chat from home screen', 'small + medium'],
          ['Recent conversation', 'Pin one chat to glance at unread replies', 'medium + large'],
          ['Voice quick-action', 'One-tap Companion voice', 'small only'],
          ['Cap meter', "Show today's Opus % used", 'small + medium'],
        ].map(([n, sub, sizes]) => (
          <div
            key={n}
            style={{
              margin: '12px 14px',
              padding: 14,
              borderRadius: 14,
              border: `1.5px solid ${p.rule}`,
              background: dark ? p.surface : '#fff',
            }}
          >
            <div style={{ display: 'flex', gap: 12 }}>
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 14,
                  background: dark ? p.raised : '#f0ece2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <WireGlyph
                  dark={dark}
                  kind={n.includes('Voice') ? 'mic' : n.includes('Cap') ? 'alert' : 'chat'}
                  size={28}
                />
              </div>
              <div style={{ flex: 1 }}>
                <WireText dark={dark} hand size={14} weight={600}>
                  {n}
                </WireText>
                <div style={{ marginTop: 2 }}>
                  <WireText dark={dark} hand size={11} color={p.ink3}>
                    {sub}
                  </WireText>
                </div>
                <div style={{ marginTop: 6 }}>
                  <span
                    className="wf-hand"
                    style={{
                      fontSize: 10,
                      color: p.ink3,
                      padding: '2px 7px',
                      borderRadius: 5,
                      border: `1px solid ${p.ink4}`,
                    }}
                  >
                    {sizes}
                  </span>
                </div>
              </div>
            </div>
            <div
              style={{
                marginTop: 10,
                padding: '8px 12px',
                borderTop: `1px dashed ${p.ink4}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <WireText dark={dark} hand size={11} color={p.ink3}>
                Add via Home Screen → Edit → +
              </WireText>
              <WireText dark={dark} hand size={12} color={p.accent}>
                How to add →
              </WireText>
            </div>
          </div>
        ))}
      </WireBg>
    </WirePhone>
  );
}

function renderSectionI() {
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
      id="misc"
      title="10 — Misc surfaces"
      subtitle="Camera · Share preview · Widget setup (Billing removed in v1 — see §13 Waitlist)"
    >
      {wrap('i36-dark', '10.1 · Camera · dark', true, <Camera dark />)}

      {wrap('i37-light', '10.2 · Share preview · light', false, <SharePreview dark={false} />)}
      {wrap('i37-dark', '10.2 · Share preview · dark', true, <SharePreview dark />)}

      {wrap('i38-light', '10.3 · Widget setup · light', false, <WidgetSetup dark={false} />)}
      {wrap('i38-dark', '10.3 · Widget setup · dark', true, <WidgetSetup dark />)}
    </DCSection>
  );
}

Object.assign(window, {
  Billing_V1,
  Billing_V2,
  Billing_V3,
  Billing_V4,
  Billing_V5,
  Billing_V6,
  Camera,
  SharePreview,
  WidgetSetup,
  renderSectionI,
});
