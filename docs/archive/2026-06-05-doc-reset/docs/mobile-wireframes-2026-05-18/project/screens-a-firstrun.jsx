// screens-a-firstrun.jsx — Section A · First-run + auth (4 screens, 6 variants on Onboarding hero)

// ────────────────────────────────────────────────────────────────
// A1 · Onboarding hero — 6 VARIANTS
// ────────────────────────────────────────────────────────────────

// V1 — Conventional · brand center · gradient · tagline + 2 CTAs
function Onboard_V1({ dark = true }) {
  const p = wfPalette(dark);
  const grad = dark
    ? 'linear-gradient(180deg, #1a1915 0%, #2b2b2b 100%)'
    : 'linear-gradient(180deg, #faf9f7 0%, #eee7da 100%)';
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark} style={{ background: grad, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 32px',
            textAlign: 'center',
          }}
        >
          <WireBrand dark={dark} size={84} />
          <div style={{ marginTop: 24 }}>
            <span
              className="wf-script"
              style={{ fontSize: 72, fontWeight: 700, color: p.ink, letterSpacing: -1 }}
            >
              AGI
            </span>
          </div>
          <div style={{ marginTop: 8 }}>
            <WireText dark={dark} hand size={18} color={p.ink2}>
              your AI team.
            </WireText>
          </div>
          <div style={{ marginTop: 14, maxWidth: 280 }}>
            <WireText dark={dark} hand size={13} color={p.ink3}>
              On-device by default. BYOK or paid cloud — your choice.
            </WireText>
          </div>
        </div>
        <div style={{ padding: '0 24px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <WireButton dark={dark} variant="accent" size="xl">
            Continue
          </WireButton>
          <WireButton dark={dark} size="lg">
            Sign in
          </WireButton>
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <WireText dark={dark} hand size={11} color={p.ink3}>
              By continuing you agree to Privacy · Terms
            </WireText>
          </div>
        </div>
      </WireBg>
    </WirePhone>
  );
}

// V2 — Editorial · big wordmark left-aligned · tagline below
function Onboard_V2({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark}>
        <div style={{ flex: 1, padding: '60px 28px 0', display: 'flex', flexDirection: 'column' }}>
          <span className="wf-stamp" style={{ fontSize: 11, color: p.ink3, letterSpacing: 3 }}>
            v1.0 · 2026
          </span>
          <div style={{ marginTop: 80 }}>
            <span
              className="wf-script"
              style={{
                fontSize: 140,
                fontWeight: 700,
                color: p.ink,
                lineHeight: 0.9,
                letterSpacing: -4,
              }}
            >
              AGI
            </span>
          </div>
          <div style={{ marginTop: 20, paddingLeft: 4 }}>
            <span className="wf-hand" style={{ fontSize: 20, color: p.ink2 }}>
              your AI team.
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ marginBottom: 28, maxWidth: 320 }}>
            <WireText dark={dark} hand size={13} color={p.ink3}>
              One app · every model · private by default.
            </WireText>
          </div>
        </div>
        <div style={{ padding: '0 24px 28px', display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <WireButton dark={dark} variant="fill" size="lg" w="100%">
              Continue
            </WireButton>
          </div>
          <WireButton dark={dark} size="lg">
            Sign in
          </WireButton>
        </div>
      </WireBg>
    </WirePhone>
  );
}

// V3 — Manifesto · tagline as hero, brand mark subtle
function Onboard_V3({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark}>
        <div style={{ flex: 1, padding: '40px 28px 0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <WireBrand dark={dark} size={36} />
            <span className="wf-script" style={{ fontSize: 28, fontWeight: 700, color: p.ink }}>
              AGI
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ maxWidth: 320 }}>
            <span
              className="wf-script"
              style={{ fontSize: 40, fontWeight: 600, color: p.ink, lineHeight: 1.05 }}
            >
              Every model.
              <br />
              One app.
              <br />
              Your data, your rules.
            </span>
          </div>
          <div style={{ marginTop: 14 }}>
            <WireText dark={dark} hand size={14} color={p.ink3}>
              Tap Continue to pick how you want to run AGI.
            </WireText>
          </div>
          <div style={{ flex: 1 }} />
        </div>
        <div style={{ padding: '0 24px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <WireButton dark={dark} variant="accent" size="xl">
            Continue
          </WireButton>
          <div style={{ textAlign: 'center' }}>
            <WireText dark={dark} hand size={13} color={p.ink2}>
              Already have an account? <span style={{ color: p.accent }}>Sign in</span>
            </WireText>
          </div>
        </div>
      </WireBg>
    </WirePhone>
  );
}

// V4 — Privacy-first · upfront promise · checklist
function Onboard_V4({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark}>
        <div style={{ flex: 1, padding: '60px 28px 0' }}>
          <WireBrand dark={dark} size={56} />
          <div style={{ marginTop: 22 }}>
            <span
              className="wf-script"
              style={{ fontSize: 38, fontWeight: 700, color: p.ink, lineHeight: 1.05 }}
            >
              AGI is private by default.
            </span>
          </div>
          <div
            style={{
              marginTop: 16,
              padding: '14px 14px',
              border: `1.2px dashed ${p.ink3}`,
              borderRadius: 12,
            }}
          >
            {[
              ['cpu', 'Runs on-device whenever it can'],
              ['lock', 'Never trains on your prompts'],
              ['cloud', 'Cloud only when you opt in'],
              ['eye', 'Provider always shown under every answer'],
            ].map(([g, t], i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: i < 3 ? `1px dashed ${p.ink4}` : undefined,
                }}
              >
                <WireGlyph dark={dark} kind={g} size={18} />
                <WireText dark={dark} hand size={13}>
                  {t}
                </WireText>
                <div style={{ flex: 1 }} />
                <WireGlyph dark={dark} kind="check" size={14} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: '0 24px 28px' }}>
          <WireButton dark={dark} variant="accent" size="xl" w="100%">
            I'm in
          </WireButton>
          <div style={{ marginTop: 10, textAlign: 'center' }}>
            <WireText dark={dark} hand size={12} color={p.ink3}>
              <span style={{ textDecoration: 'underline' }}>Read the full privacy promise</span>
            </WireText>
          </div>
        </div>
      </WireBg>
    </WirePhone>
  );
}

// V5 — Carousel · 3 dots, 3 swipe screens (first frame shown)
function Onboard_V5({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark}>
        <div
          style={{
            padding: '20px 22px 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <WireText dark={dark} hand size={13} color={p.ink3}>
            1 of 3
          </WireText>
          <WireText dark={dark} hand size={13} color={p.ink3}>
            Skip
          </WireText>
        </div>
        <div
          style={{
            flex: 1,
            padding: '20px 24px 0',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
        >
          {/* hero illustration placeholder */}
          <div
            style={{
              width: '100%',
              aspectRatio: '1.05',
              borderRadius: 18,
              border: `1.5px dashed ${p.ink3}`,
              position: 'relative',
              marginBottom: 22,
            }}
            className={dark ? 'wf-hatch-d' : 'wf-hatch-l'}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <WireBrand dark={dark} size={84} />
            </div>
          </div>
          <span
            className="wf-script"
            style={{ fontSize: 36, fontWeight: 700, color: p.ink, lineHeight: 1.1 }}
          >
            Bring every model into one chat.
          </span>
          <div style={{ marginTop: 12 }}>
            <WireText dark={dark} hand size={14} color={p.ink2}>
              Claude, GPT, Gemini, Llama on-device — switched with one tap.
            </WireText>
          </div>
        </div>
        <div style={{ padding: '20px 24px 28px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ width: 18, height: 6, borderRadius: 3, background: p.ink }} />
            <span style={{ width: 6, height: 6, borderRadius: 3, background: p.ink3 }} />
            <span style={{ width: 6, height: 6, borderRadius: 3, background: p.ink3 }} />
          </div>
          <div style={{ flex: 1 }} />
          <WireButton dark={dark} variant="accent" size="lg">
            Next →
          </WireButton>
        </div>
      </WireBg>
    </WirePhone>
  );
}

// V6 — Bold dark · provider logos band · "no defaults" vibe
function Onboard_V6({ dark = true }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark}>
        <div style={{ flex: 1, padding: '70px 28px 0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: 6 }}>
            <WireText dark={dark} hand size={13} color={p.ink3}>
              AGI
            </WireText>
          </div>
          <span
            className="wf-script"
            style={{ fontSize: 56, fontWeight: 700, color: p.ink, lineHeight: 0.95 }}
          >
            Pick your
            <br />
            AI team.
          </span>
          <div
            style={{
              marginTop: 28,
              padding: '14px 14px',
              border: `1px dashed ${p.ink3}`,
              borderRadius: 14,
            }}
          >
            <div style={{ marginBottom: 10 }}>
              <WireText dark={dark} hand size={11} color={p.ink3}>
                SUPPORTED
              </WireText>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                'Claude',
                'GPT-5',
                'Gemini',
                'Grok',
                'DeepSeek',
                'Llama',
                'Qwen',
                'Perplexity',
                'Mistral',
                'Moonshot',
              ].map((n) => (
                <div
                  key={n}
                  style={{ padding: '5px 10px', borderRadius: 14, border: `1px solid ${p.ink3}` }}
                >
                  <span className="wf-hand" style={{ fontSize: 11 }}>
                    {n}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <WireText dark={dark} hand size={11} color={p.ink3}>
                + any OpenAI-compatible endpoint via BYOK
              </WireText>
            </div>
          </div>
        </div>
        <div style={{ padding: '0 24px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <WireButton dark={dark} variant="accent" size="xl">
            Get started
          </WireButton>
          <WireButton dark={dark} size="md">
            I have an account
          </WireButton>
        </div>
      </WireBg>
    </WirePhone>
  );
}

// ────────────────────────────────────────────────────────────────
// A2 · Local welcome — v1 = local-only, cloud is waitlist
// ────────────────────────────────────────────────────────────────
function ModePick({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar dark={dark} left="back" title="" />
      <WireBg dark={dark}>
        <div style={{ padding: '12px 24px 0' }}>
          <span
            className="wf-script"
            style={{ fontSize: 38, fontWeight: 700, color: p.ink, lineHeight: 1.05 }}
          >
            Runs entirely on your phone.
          </span>
          <div style={{ marginTop: 10 }}>
            <WireText dark={dark} hand size={14} color={p.ink2}>
              v1 is local-only. Free forever. No account needed.
            </WireText>
          </div>
        </div>
        {/* Trust signals */}
        <div
          style={{
            margin: '20px 14px 0',
            padding: 14,
            borderRadius: 14,
            background: dark ? p.surface : '#fff',
            border: `1.5px solid ${p.rule}`,
          }}
        >
          {[
            ['cpu', 'On-device only', 'Apple Foundation Models, ExecuTorch, llama.rn'],
            [
              'lock',
              'Your conversations never leave your phone',
              'No telemetry, no training on your data',
            ],
            ['user', 'No account required', 'Open the app, start chatting'],
            ['cloud', 'Works in airplane mode', 'Offline by design'],
            ['check', 'DPDP Act 2023 compliant', "India's data protection — audit log built in"],
            ['heart', 'AGI Automation LLC · Delaware, USA', 'Apple-verified developer'],
          ].map(([g, t, sub], i) => (
            <div
              key={t}
              style={{
                padding: '8px 0',
                borderBottom: i < 5 ? `1px dashed ${p.ink4}` : undefined,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}
            >
              <WireGlyph dark={dark} kind={g} size={18} />
              <div style={{ flex: 1 }}>
                <WireText dark={dark} hand size={13} weight={600}>
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
        {/* Cloud tease */}
        <div
          style={{
            margin: '14px 14px 0',
            padding: '12px 14px',
            borderRadius: 12,
            border: `1.2px dashed ${p.ink3}`,
            background: dark ? p.surface : '#fbf8f1',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <WireGlyph dark={dark} kind="cloud" size={20} />
          <div style={{ flex: 1 }}>
            <WireText dark={dark} hand size={13} weight={600}>
              Want cloud models later?
            </WireText>
            <div>
              <WireText dark={dark} hand size={11} color={p.ink3}>
                Opus 4.7, GPT-5.4, Gemini · join the waitlist in Settings.
              </WireText>
            </div>
          </div>
          <WireGlyph dark={dark} kind="chev" size={14} />
        </div>
      </WireBg>
      <div style={{ padding: '14px 24px 18px' }}>
        <WireButton dark={dark} variant="accent" size="xl" w="100%">
          Get started · local
        </WireButton>
        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            You can join the cloud waitlist anytime · no email required to start.
          </WireText>
        </div>
      </div>
    </WirePhone>
  );
}

// ────────────────────────────────────────────────────────────────
// A3 · Login
// ────────────────────────────────────────────────────────────────
function Login({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark} homeIndicator>
      <WireTopBar dark={dark} left="back" title="" />
      <WireBg dark={dark}>
        <div style={{ padding: '8px 24px 0' }}>
          <WireBrand dark={dark} size={40} />
          <div style={{ marginTop: 14 }}>
            <span className="wf-script" style={{ fontSize: 30, fontWeight: 700, color: p.ink }}>
              Sign in
            </span>
          </div>
          <div style={{ marginTop: 4 }}>
            <WireText dark={dark} hand size={13} color={p.ink3}>
              Welcome back.
            </WireText>
          </div>

          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                padding: '12px 14px',
                border: `1.5px solid ${p.rule}`,
                borderRadius: 12,
                background: p.ink,
                color: p.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <WireGlyph dark={!dark} kind="user" size={18} />
              <span className="wf-hand" style={{ fontSize: 15 }}>
                {' '}
                Continue with Apple
              </span>
            </div>
            <div
              style={{
                padding: '12px 14px',
                border: `1.5px solid ${p.rule}`,
                borderRadius: 12,
                background: dark ? p.surface : '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <WireIcon dark={dark} size={18} glyph="G" />
              <span className="wf-hand" style={{ fontSize: 15 }}>
                Continue with Google
              </span>
            </div>
          </div>

          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: p.ink4 }} />
            <WireText dark={dark} hand size={11} color={p.ink3}>
              or with email
            </WireText>
            <div style={{ flex: 1, height: 1, background: p.ink4 }} />
          </div>

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                padding: '12px 14px',
                border: `1.5px solid ${p.rule}`,
                borderRadius: 12,
                background: dark ? p.surface : '#fff',
              }}
            >
              <span className="wf-hand" style={{ fontSize: 11, color: p.ink3 }}>
                Email
              </span>
              <div style={{ marginTop: 2 }}>
                <WireText dark={dark} mono size={14}>
                  siddhartha@example.com
                </WireText>
              </div>
            </div>
            <div
              style={{
                padding: '12px 14px',
                border: `1.5px solid ${p.rule}`,
                borderRadius: 12,
                background: dark ? p.surface : '#fff',
              }}
            >
              <span className="wf-hand" style={{ fontSize: 11, color: p.ink3 }}>
                Password
              </span>
              <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                <WireText dark={dark} mono size={14}>
                  •••••••••••
                </WireText>
                <div style={{ flex: 1 }} />
                <WireGlyph dark={dark} kind="eye" size={16} />
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <WireText dark={dark} hand size={12} color={p.accent}>
              Forgot password?
            </WireText>
          </div>
        </div>
      </WireBg>
      <div style={{ padding: '12px 24px 16px' }}>
        <WireButton dark={dark} variant="accent" size="xl" w="100%">
          Sign in
        </WireButton>
        <div style={{ marginTop: 10, textAlign: 'center' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            By continuing, you agree to <span style={{ color: p.accent }}>Privacy</span> ·{' '}
            <span style={{ color: p.accent }}>Terms</span>
          </WireText>
        </div>
      </div>
    </WirePhone>
  );
}

// ────────────────────────────────────────────────────────────────
// A4 · Reset password
// ────────────────────────────────────────────────────────────────
function Reset({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar dark={dark} left="back" title="Reset password" />
      <WireBg dark={dark}>
        <div style={{ padding: '20px 24px 0' }}>
          <span className="wf-script" style={{ fontSize: 28, fontWeight: 700, color: p.ink }}>
            Forgot password?
          </span>
          <div style={{ marginTop: 8, maxWidth: 320 }}>
            <WireText dark={dark} hand size={14} color={p.ink2}>
              Enter your email and we'll send a link to reset.
            </WireText>
          </div>
          <div
            style={{
              marginTop: 22,
              padding: '12px 14px',
              border: `1.5px solid ${p.rule}`,
              borderRadius: 12,
              background: dark ? p.surface : '#fff',
            }}
          >
            <span className="wf-hand" style={{ fontSize: 11, color: p.ink3 }}>
              Email
            </span>
            <div style={{ marginTop: 2 }}>
              <WireText dark={dark} mono size={14}>
                siddhartha@example.com
              </WireText>
            </div>
          </div>
        </div>
      </WireBg>
      <div style={{ padding: '12px 24px 16px' }}>
        <WireButton dark={dark} variant="accent" size="xl" w="100%">
          Send reset link
        </WireButton>
        <div style={{ marginTop: 10, textAlign: 'center' }}>
          <WireText dark={dark} hand size={12} color={p.ink3}>
            Remembered it? <span style={{ color: p.accent }}>Back to sign in</span>
          </WireText>
        </div>
      </div>
    </WirePhone>
  );
}

function renderSectionA() {
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
      id="firstrun"
      title="02 — First run"
      subtitle="onboarding hero (6 variants) · local welcome (no login in v1 — see §13 Waitlist)"
    >
      {wrap('a1-v1-dark', '02.1 · Onboarding · V1 conventional · dark', true, <Onboard_V1 dark />)}
      {wrap(
        'a1-v1-light',
        '02.1 · Onboarding · V1 conventional · light',
        false,
        <Onboard_V1 dark={false} />,
      )}
      {wrap(
        'a1-v2-light',
        '02.1 · Onboarding · V2 editorial · light',
        false,
        <Onboard_V2 dark={false} />,
      )}
      {wrap('a1-v2-dark', '02.1 · Onboarding · V2 editorial · dark', true, <Onboard_V2 dark />)}
      {wrap(
        'a1-v3-light',
        '02.1 · Onboarding · V3 manifesto · light',
        false,
        <Onboard_V3 dark={false} />,
      )}
      {wrap(
        'a1-v4-light',
        '02.1 · Onboarding · V4 privacy-promise · light',
        false,
        <Onboard_V4 dark={false} />,
      )}
      {wrap(
        'a1-v4-dark',
        '02.1 · Onboarding · V4 privacy-promise · dark',
        true,
        <Onboard_V4 dark />,
      )}
      {wrap(
        'a1-v5-light',
        '02.1 · Onboarding · V5 carousel · light',
        false,
        <Onboard_V5 dark={false} />,
      )}
      {wrap('a1-v6-dark', '02.1 · Onboarding · V6 provider-band · dark', true, <Onboard_V6 dark />)}
      {wrap(
        'a1-v6-light',
        '02.1 · Onboarding · V6 provider-band · light',
        false,
        <Onboard_V6 dark={false} />,
      )}

      {wrap(
        'a2-light',
        '02.2 · Local welcome + trust signals · light',
        false,
        <ModePick dark={false} />,
      )}
      {wrap('a2-dark', '02.2 · Local welcome + trust signals · dark', true, <ModePick dark />)}
    </DCSection>
  );
}

Object.assign(window, {
  Onboard_V1,
  Onboard_V2,
  Onboard_V3,
  Onboard_V4,
  Onboard_V5,
  Onboard_V6,
  ModePick,
  renderSectionA,
});
