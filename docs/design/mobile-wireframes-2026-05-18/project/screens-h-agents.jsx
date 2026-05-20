// screens-h-agents.jsx — Section H · Agents + Companion (3 screens, 6 variants on Companion)

// H32 · Agents list
function AgentsList({ dark = false }) {
  const p = wfPalette(dark);
  const items = [
    ['Code reviewer', 'PR-mode · Sonnet 4.6 · 4 tools', '#21808d'],
    ['Daily digest', 'Morning summarizer · Haiku · 2 tools', '#da7756'],
    ['Recipe coach', 'Calorie + macros · on-device', '#15803d'],
    ['Travel planner', 'Itineraries · Sonnet · 6 tools', '#d97706'],
    ['Sourdough assistant', 'Bake math · Llama 3.2', '#7c3aed'],
  ];
  return (
    <WirePhone dark={dark}>
      <WireTopBar
        dark={dark}
        left="menu"
        title="Agents"
        sub="5 saved · 1 running"
        right={
          <>
            <WireGlyph dark={dark} kind="search" size={20} />
            <WireGlyph dark={dark} kind="plus" size={22} />
          </>
        }
      />
      <WireBg dark={dark}>
        {items.map(([n, sub, c]) => (
          <WireListRow
            key={n}
            dark={dark}
            h={68}
            leading={
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  background: c,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="wf-script"
                  style={{ fontSize: 18, color: '#fff', fontWeight: 700 }}
                >
                  {n[0]}
                </span>
              </div>
            }
            title={n}
            sub={sub}
            trailing={
              <WireButton dark={dark} size="sm" variant="soft">
                Run
              </WireButton>
            }
          />
        ))}
      </WireBg>
      <div
        style={{
          position: 'absolute',
          bottom: 70,
          right: 18,
          width: 56,
          height: 56,
          borderRadius: 28,
          background: p.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 25,
        }}
      >
        <WireGlyph dark={true} kind="plus" size={26} />
      </div>
    </WirePhone>
  );
}

// H33 · Agent detail
function AgentDetail({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar
        dark={dark}
        left="back"
        title="Code reviewer"
        right={<WireGlyph dark={dark} kind="settings" size={20} />}
      />
      <WireBg dark={dark}>
        <div style={{ padding: '20px 24px 0', textAlign: 'center' }}>
          <div
            style={{
              width: 72,
              height: 72,
              margin: '0 auto',
              borderRadius: 36,
              background: p.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="wf-script" style={{ fontSize: 36, color: '#fff', fontWeight: 700 }}>
              C
            </span>
          </div>
          <div style={{ marginTop: 12 }}>
            <WireText dark={dark} hand size={18} weight={600}>
              Code reviewer
            </WireText>
          </div>
          <div style={{ marginTop: 4 }}>
            <WireText dark={dark} hand size={12} color={p.ink3}>
              PR-mode · Sonnet 4.6 · 4 tools
            </WireText>
          </div>
        </div>

        <div style={{ padding: '18px 18px 6px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            SYSTEM PROMPT
          </WireText>
        </div>
        <div
          style={{
            margin: '0 14px',
            padding: 12,
            borderRadius: 10,
            background: dark ? p.surface : '#f6f4ec',
            border: `1.5px solid ${p.rule}`,
          }}
        >
          <WireText dark={dark} mono size={11}>
            You are a senior engineer reviewing a pull request. Focus on correctness, edge cases,
            and readability. Prefer the smallest reasonable diff. Cite line numbers.
          </WireText>
        </div>

        <div style={{ padding: '14px 18px 6px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            TOOLS · 4 ENABLED
          </WireText>
        </div>
        {[
          ['github', 'GitHub · read repo, list files', true],
          ['code', 'Run tests', true],
          ['file', 'File search (regex + grep)', true],
          ['globe', 'Web search · docs only', true],
          ['cpu', 'Computer use', false],
        ].map(([g, n, on]) => (
          <WireListRow
            key={n}
            dark={dark}
            leading={<WireGlyph dark={dark} kind={g} size={20} />}
            title={n}
            trailing={
              <div
                style={{
                  width: 42,
                  height: 24,
                  borderRadius: 12,
                  background: on ? p.accent : p.ink4,
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: on ? 20 : 2,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    background: '#fff',
                  }}
                />
              </div>
            }
          />
        ))}

        <div style={{ padding: '14px 18px 6px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            DEFAULTS
          </WireText>
        </div>
        <WireListRow
          dark={dark}
          title="Model"
          sub="Claude Sonnet 4.6 · reasoning medium"
          trailing={<WireGlyph dark={dark} kind="chev" size={14} />}
        />
        <WireListRow
          dark={dark}
          title="Auto-run on PR open"
          sub="Listens for new PRs in 3 repos"
          trailing={
            <div
              style={{
                width: 42,
                height: 24,
                borderRadius: 12,
                background: p.accent,
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 2,
                  left: 20,
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  background: '#fff',
                }}
              />
            </div>
          }
        />
      </WireBg>
      <div style={{ padding: '12px 18px 16px', display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <WireButton dark={dark} variant="accent" size="xl" w="100%">
            Run now
          </WireButton>
        </div>
        <WireButton dark={dark} size="lg">
          Edit
        </WireButton>
      </div>
    </WirePhone>
  );
}

// H34 · Companion — 6 VARIANTS

function _CompShell({ dark, children, bg }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <div
        style={{
          flex: 1,
          color: p.ink,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          background: bg || p.bg,
        }}
      >
        <div
          style={{
            padding: '20px 24px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <WireGlyph dark={dark} kind="x" size={22} />
          <WireText dark={dark} hand size={12} color={p.ink3}>
            COMPANION · ON-DEVICE
          </WireText>
          <WireGlyph dark={dark} kind="settings" size={20} />
        </div>
        {children}
      </div>
    </WirePhone>
  );
}

// V1 — Classic orb, status, dual buttons
function Companion_V1({ dark = true }) {
  const p = wfPalette(dark);
  return (
    <_CompShell dark={dark}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
        }}
      >
        <div style={{ position: 'relative', width: 220, height: 220 }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: p.brand,
              opacity: 0.1,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 28,
              borderRadius: '50%',
              background: p.brand,
              opacity: 0.22,
            }}
          />
          <div
            style={{ position: 'absolute', inset: 64, borderRadius: '50%', background: p.brand }}
          />
        </div>
        <WireText dark={dark} hand size={20} weight={600}>
          Listening…
        </WireText>
        <div style={{ height: 50 }} />
      </div>
      <div
        style={{
          padding: '0 28px 36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            border: `1.5px solid ${p.ink3}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <WireGlyph dark={dark} kind="pause" size={20} />
        </div>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            border: `1.5px solid ${p.ink3}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <WireGlyph dark={dark} kind="chat" size={22} />
        </div>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            background: p.danger,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <WireGlyph dark={true} kind="x" size={22} />
        </div>
      </div>
    </_CompShell>
  );
}

// V2 — Full-screen gradient · text reveals as it talks
function Companion_V2({ dark = true }) {
  const p = wfPalette(dark);
  const grad = dark
    ? 'radial-gradient(circle at 50% 40%, #3a2622 0%, #1a1915 70%)'
    : 'radial-gradient(circle at 50% 40%, #f3dccd 0%, #faf9f7 70%)';
  return (
    <_CompShell dark={dark} bg={grad}>
      <div style={{ flex: 1, padding: '40px 30px 0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginTop: 60, marginBottom: 30 }}>
          <WireText dark={dark} hand size={13} color={p.ink3}>
            YOU SAID
          </WireText>
          <div style={{ marginTop: 6 }}>
            <WireText dark={dark} hand size={16} italic>
              How long does sourdough need at 78% hydration?
            </WireText>
          </div>
        </div>
        <div>
          <WireText dark={dark} hand size={13} color={p.ink3}>
            AGI
          </WireText>
          <div style={{ marginTop: 6, maxWidth: 320 }}>
            <span
              className="wf-script"
              style={{ fontSize: 26, fontWeight: 600, color: p.ink, lineHeight: 1.2 }}
            >
              At 78% hydration, you're looking at about 4 to 5 hours bulk ferment at room
              temperature.<span style={{ color: p.ink3 }}>▍</span>
            </span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ marginBottom: 24 }}>
          <WireProvenance
            dark={dark}
            model="Llama 3.2 3B"
            cloud={false}
            tier="Tier 2"
            cost={null}
          />
        </div>
      </div>
      <div style={{ padding: '0 28px 36px', display: 'flex', justifyContent: 'center', gap: 36 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            border: `1.5px solid ${p.ink3}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <WireGlyph dark={dark} kind="mic" size={22} />
        </div>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            background: p.danger,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <WireGlyph dark={true} kind="x" size={22} />
        </div>
      </div>
    </_CompShell>
  );
}

// V3 — Bars-only visualization, no orb
function Companion_V3({ dark = true }) {
  const p = wfPalette(dark);
  return (
    <_CompShell dark={dark}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 32,
        }}
      >
        <svg width="320" height="180" viewBox="0 0 320 180">
          {Array.from({ length: 40 }).map((_, i) => {
            const h = 8 + Math.abs(Math.sin(i * 1.1 + 0.3)) * 140 * Math.abs(Math.sin(i * 0.4));
            return (
              <rect
                key={i}
                x={i * 8}
                y={(180 - h) / 2}
                width="4"
                height={h}
                rx="2"
                fill={p.brand}
                opacity={0.8}
              />
            );
          })}
        </svg>
        <WireText dark={dark} hand size={22} weight={600}>
          Speaking…
        </WireText>
        <WireText dark={dark} hand size={12} color={p.ink3}>
          Tap anywhere to interrupt
        </WireText>
      </div>
      <div style={{ padding: '0 28px 36px', display: 'flex', justifyContent: 'space-between' }}>
        <WireGlyph dark={dark} kind="mic" size={26} />
        <WireText dark={dark} hand size={11} color={p.ink3}>
          00:42 · Llama 3.2 · on-device
        </WireText>
        <WireGlyph dark={dark} kind="x" size={26} />
      </div>
    </_CompShell>
  );
}

// V4 — Multi-agent · two voices on call
function Companion_V4({ dark = true }) {
  const p = wfPalette(dark);
  return (
    <_CompShell dark={dark}>
      <div style={{ flex: 1, padding: '12px 24px 0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
          {[
            { name: 'Researcher', model: 'Opus', c: '#21808d', on: true },
            { name: 'Critic', model: 'Sonnet', c: '#da7756', on: false },
          ].map((a, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                padding: 14,
                borderRadius: 16,
                border: `1.5px solid ${a.on ? a.c : p.ink3}`,
                background: a.on ? (dark ? '#1f2a2a' : '#dceaeb') : 'transparent',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  background: a.c,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span className="wf-hand" style={{ fontSize: 16, color: '#fff', fontWeight: 700 }}>
                  {a.name[0]}
                </span>
              </div>
              <div style={{ marginTop: 8 }}>
                <WireText dark={dark} hand size={13} weight={600}>
                  {a.name}
                </WireText>
              </div>
              <div>
                <WireText dark={dark} hand size={10} color={p.ink3}>
                  {a.model} · {a.on ? 'speaking' : 'listening'}
                </WireText>
              </div>
              <div style={{ marginTop: 8, height: 32 }}>
                <svg width="100%" height="32" viewBox="0 0 100 32">
                  {Array.from({ length: 14 }).map((_, j) => (
                    <rect
                      key={j}
                      x={j * 7}
                      y={16 - (a.on ? 5 + Math.abs(Math.sin(j)) * 12 : 2)}
                      width="3"
                      height={a.on ? 10 + Math.abs(Math.sin(j)) * 24 : 4}
                      fill={a.c}
                      opacity={a.on ? 1 : 0.4}
                    />
                  ))}
                </svg>
              </div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            marginBottom: 20,
            padding: 14,
            borderRadius: 14,
            border: `1px dashed ${p.ink3}`,
          }}
        >
          <WireText dark={dark} hand size={11} color={p.ink3}>
            TRANSCRIPT
          </WireText>
          <div style={{ marginTop: 6 }}>
            <WireText dark={dark} hand size={13}>
              <span style={{ color: '#21808d', fontWeight: 600 }}>Researcher:</span> Article 50 has
              four transparency obligations…
            </WireText>
          </div>
          <div style={{ marginTop: 6 }}>
            <WireText dark={dark} hand size={13}>
              <span style={{ color: '#da7756', fontWeight: 600 }}>Critic:</span> Push back — point 2
              is debatable for open-source models.
            </WireText>
          </div>
        </div>
      </div>
      <div style={{ padding: '0 28px 36px', display: 'flex', justifyContent: 'space-around' }}>
        <WireGlyph dark={dark} kind="plus" size={24} />
        <div style={{ width: 56, height: 56, borderRadius: 28, background: p.brand }} />
        <WireGlyph dark={dark} kind="x" size={24} />
      </div>
    </_CompShell>
  );
}

// V5 — Card stack · facts cited inline
function Companion_V5({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <_CompShell dark={dark}>
      <div style={{ flex: 1, padding: '12px 20px 0' }}>
        <div style={{ marginTop: 14 }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            YOU SAID
          </WireText>
          <div style={{ marginTop: 4 }}>
            <WireText dark={dark} hand size={16}>
              What was that bread hydration we landed on?
            </WireText>
          </div>
        </div>
        <div
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: 18,
            background: dark ? p.surface : '#fff',
            border: `1.5px solid ${p.rule}`,
          }}
        >
          <WireText dark={dark} hand size={12} color={p.ink3}>
            FROM MEMORY · 12 days ago
          </WireText>
          <div style={{ marginTop: 6 }}>
            <WireText dark={dark} hand size={18} weight={600}>
              78% hydration
            </WireText>
          </div>
          <div style={{ marginTop: 6 }}>
            <WireText dark={dark} hand size={13} color={p.ink2}>
              We settled on it after testing 72% and 82%. The 78% loaf had the best open crumb.
            </WireText>
          </div>
        </div>
        <div
          style={{
            marginTop: 12,
            padding: 14,
            borderRadius: 18,
            background: dark ? '#1f2a2a' : '#dceaeb',
            border: `1.5px solid ${p.accent}`,
          }}
        >
          <WireText dark={dark} hand size={12} color={p.accent}>
            NEXT STEPS
          </WireText>
          <div style={{ marginTop: 6 }}>
            <WireText dark={dark} hand size={14}>
              Want me to start a timer for the 4-hour bulk ferment?
            </WireText>
          </div>
        </div>
        <div style={{ flex: 1 }} />
      </div>
      <div style={{ padding: '20px 24px 36px', display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <WireButton dark={dark} variant="accent" size="lg" w="100%">
            Yes, start timer
          </WireButton>
        </div>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            background: p.brand,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <WireGlyph dark={true} kind="mic" size={22} />
        </div>
      </div>
    </_CompShell>
  );
}

// V6 — Lock-screen / control center style · always-on
function Companion_V6({ dark = true }) {
  const p = wfPalette(dark);
  return (
    <_CompShell dark={dark}>
      <div style={{ flex: 1, padding: '24px 22px 0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="wf-script" style={{ fontSize: 36, fontWeight: 700, color: p.ink }}>
            11:47
          </span>
          <span className="wf-hand" style={{ fontSize: 12, color: p.ink3 }}>
            WED · MAY 18
          </span>
        </div>
        <div
          style={{
            marginTop: 20,
            padding: 14,
            borderRadius: 18,
            background: dark ? p.surface : '#fff',
            border: `1.5px solid ${p.rule}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: p.brand }} />
            <div style={{ flex: 1 }}>
              <WireText dark={dark} hand size={11} color={p.ink3}>
                AGI · COMPANION
              </WireText>
              <WireText dark={dark} hand size={14} weight={600}>
                Listening…
              </WireText>
            </div>
            <WireGlyph dark={dark} kind="waveform" size={20} />
          </div>
          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 10,
              background: dark ? p.raised : '#f0ece2',
            }}
          >
            <WireText dark={dark} hand size={13} italic>
              "What was that bread hydration we landed on?"
            </WireText>
          </div>
        </div>
        <div
          style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}
        >
          {[
            ['mic', 'Mic'],
            ['skill', 'Recipe'],
            ['calendar', 'Timer'],
            ['plus', 'More'],
          ].map(([g, n]) => (
            <div
              key={n}
              style={{
                aspectRatio: 1,
                borderRadius: 14,
                background: dark ? p.surface : '#fff',
                border: `1.5px solid ${p.rule}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <WireGlyph dark={dark} kind={g} size={22} />
              <WireText dark={dark} hand size={11}>
                {n}
              </WireText>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '0 32px 36px' }}>
        <div
          style={{
            padding: '12px 18px',
            borderRadius: 30,
            background: dark ? p.surface : '#fff',
            border: `1.5px solid ${p.rule}`,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <WireGlyph dark={dark} kind="mic" size={18} />
          <WireText dark={dark} hand size={13} color={p.ink3} italic>
            Say something…
          </WireText>
          <div style={{ flex: 1 }} />
          <div style={{ width: 32, height: 32, borderRadius: 16, background: p.brand }} />
        </div>
      </div>
    </_CompShell>
  );
}

function renderSectionH() {
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
      id="agents"
      title="09 — Agents & Companion"
      subtitle="agents list · agent detail · Companion (6 variants)"
    >
      {wrap('h32-light', '09.1 · Agents list · light', false, <AgentsList dark={false} />)}
      {wrap('h32-dark', '09.1 · Agents list · dark', true, <AgentsList dark />)}

      {wrap('h33-light', '09.2 · Agent detail · light', false, <AgentDetail dark={false} />)}
      {wrap('h33-dark', '09.2 · Agent detail · dark', true, <AgentDetail dark />)}

      {wrap('h34-v1-dark', '09.3 · Companion · V1 classic orb · dark', true, <Companion_V1 dark />)}
      {wrap('h34-v2-dark', '09.3 · Companion · V2 text-reveal · dark', true, <Companion_V2 dark />)}
      {wrap('h34-v3-dark', '09.3 · Companion · V3 bars-only · dark', true, <Companion_V3 dark />)}
      {wrap('h34-v4-dark', '09.3 · Companion · V4 multi-agent · dark', true, <Companion_V4 dark />)}
      {wrap(
        'h34-v5-light',
        '09.3 · Companion · V5 card-stack · light',
        false,
        <Companion_V5 dark={false} />,
      )}
      {wrap('h34-v6-dark', '09.3 · Companion · V6 lock-screen · dark', true, <Companion_V6 dark />)}

      {wrap(
        'h34-v1-light',
        '09.3 · Companion · V1 classic orb · light',
        false,
        <Companion_V1 dark={false} />,
      )}
      {wrap(
        'h34-v2-light',
        '09.3 · Companion · V2 text-reveal · light',
        false,
        <Companion_V2 dark={false} />,
      )}
    </DCSection>
  );
}

Object.assign(window, {
  AgentsList,
  AgentDetail,
  Companion_V1,
  Companion_V2,
  Companion_V3,
  Companion_V4,
  Companion_V5,
  Companion_V6,
  renderSectionH,
});
