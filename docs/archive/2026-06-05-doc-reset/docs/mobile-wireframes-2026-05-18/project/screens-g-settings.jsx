// screens-g-settings.jsx — Section G · Settings sub-screens (7 screens)

// G25 · Personalization
function Personalization({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar dark={dark} left="back" title="Personalization" />
      <WireBg dark={dark}>
        <div style={{ padding: '14px 18px 6px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            GREETING
          </WireText>
        </div>
        <div
          style={{
            margin: '0 14px',
            padding: 14,
            borderRadius: 12,
            border: `1.5px solid ${p.rule}`,
            background: dark ? p.surface : '#fff',
          }}
        >
          <div style={{ padding: '6px 0' }}>
            <WireText dark={dark} hand size={11} color={p.ink3}>
              Display name
            </WireText>
            <div style={{ marginTop: 4, padding: '6px 0', borderBottom: `1px dashed ${p.ink4}` }}>
              <WireText dark={dark} hand size={15}>
                Siddhartha
              </WireText>
            </div>
          </div>
          <WireListRow
            dark={dark}
            divider={false}
            title="Time-of-day greeting"
            sub="'Good morning' / 'late-night' variants"
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
        </div>

        <div style={{ padding: '14px 18px 6px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            APPEARANCE
          </WireText>
        </div>
        <div
          style={{
            margin: '0 14px',
            padding: 14,
            borderRadius: 12,
            border: `1.5px solid ${p.rule}`,
            background: dark ? p.surface : '#fff',
          }}
        >
          <WireText dark={dark} hand size={12} color={p.ink3}>
            Theme
          </WireText>
          <div
            style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}
          >
            {['Light', 'Dark', 'System'].map((t, i) => (
              <div
                key={t}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: `${i === 2 ? 2 : 1.2}px solid ${i === 2 ? p.accent : p.ink3}`,
                  textAlign: 'center',
                  background: i === 2 ? (dark ? p.accentSoft : '#dceaeb') : 'transparent',
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    margin: '0 auto',
                    borderRadius: 6,
                    background:
                      i === 0
                        ? '#faf9f7'
                        : i === 1
                          ? '#1a1915'
                          : 'linear-gradient(45deg, #faf9f7 50%, #1a1915 50%)',
                    border: `1px solid ${p.ink3}`,
                  }}
                />
                <div style={{ marginTop: 4 }}>
                  <WireText dark={dark} hand size={12}>
                    {t}
                  </WireText>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <WireText dark={dark} hand size={12} color={p.ink3}>
              Accent
            </WireText>
          </div>
          <div style={{ marginTop: 6, display: 'flex', gap: 10 }}>
            {[
              ['Teal', '#21808d', true],
              ['Terracotta', '#da7756'],
              ['Slate', '#475569'],
            ].map(([n, c, sel]) => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    background: c,
                    border: sel ? `2px solid ${p.ink}` : `1px solid ${p.ink3}`,
                  }}
                />
                <WireText dark={dark} hand size={11}>
                  {n}
                </WireText>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '14px 18px 6px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            LANGUAGE
          </WireText>
        </div>
        <WireListRow
          dark={dark}
          title="App language"
          sub="English (US) · system default"
          trailing={<WireGlyph dark={dark} kind="chev" size={14} />}
        />
      </WireBg>
    </WirePhone>
  );
}

// G26 · Memory · with import-from-competitor
function Memory({ dark = false }) {
  const p = wfPalette(dark);
  const facts = [
    ['Works as a frontend engineer at AGI Inc', '12 turns ago · EU AI Act §50'],
    ['Coffee · oat milk, no sugar', 'manual'],
    ['Lives in Brooklyn', '3 days ago'],
    ['Prefers Zod for validation', '5 days ago · refactor chat'],
    ['Sourdough hydration: 78%', '2 weeks ago · baking chat'],
  ];
  return (
    <WirePhone dark={dark}>
      <WireTopBar
        dark={dark}
        left="back"
        title="Memory"
        sub="12 facts · import enabled"
        right={<WireGlyph dark={dark} kind="plus" size={22} />}
      />
      <WireBg dark={dark}>
        {/* import-from-competitor (lock #15) */}
        <div style={{ padding: '14px 18px 6px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            IMPORT FROM ANOTHER AI
          </WireText>
        </div>
        {[
          ['ChatGPT', 'Export · drag .json here', false],
          ['Claude', 'Apple Sign In · API memory sync', false],
          ['Gemini', 'Google sign-in · 1 import found', true],
        ].map(([n, sub, found]) => (
          <WireListRow
            key={n}
            dark={dark}
            leading={<WireIcon dark={dark} size={32} glyph={n[0]} rounded={8} />}
            title={n}
            sub={sub}
            trailing={
              found ? (
                <WireButton dark={dark} size="sm" variant="accent">
                  Import
                </WireButton>
              ) : (
                <WireButton dark={dark} size="sm" variant="soft">
                  Connect
                </WireButton>
              )
            }
          />
        ))}

        <div style={{ padding: '14px 18px 6px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            YOUR FACTS
          </WireText>
        </div>
        {facts.map(([t, src]) => (
          <div
            key={t}
            style={{
              padding: '10px 18px',
              borderBottom: `1px dashed ${p.ink4}`,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <WireGlyph dark={dark} kind="pin" size={16} />
            <div style={{ flex: 1 }}>
              <WireText dark={dark} hand size={13}>
                {t}
              </WireText>
              <div style={{ marginTop: 2 }}>
                <WireText dark={dark} hand size={10} color={p.ink3}>
                  {src}
                </WireText>
              </div>
            </div>
            <WireGlyph dark={dark} kind="x" size={14} />
          </div>
        ))}

        <div style={{ padding: '14px 18px' }}>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: `1.5px dashed ${p.ink3}`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <WireGlyph dark={dark} kind="plus" size={16} />
            <WireText dark={dark} hand size={13} color={p.ink3} italic>
              Add a memory…
            </WireText>
          </div>
        </div>
      </WireBg>
    </WirePhone>
  );
}

// G27 · Notifications
function Notifications({ dark = false }) {
  const p = wfPalette(dark);
  const cats = [
    ['Dispatch updates', 'When a dispatched task finishes', true],
    ['Cap warnings', '80% · 100% · resets', true],
    ['Billing', 'Renewals · payment failures', true],
    ['Product updates', 'New models · new features', false],
  ];
  return (
    <WirePhone dark={dark}>
      <WireTopBar dark={dark} left="back" title="Notifications" />
      <WireBg dark={dark}>
        <div style={{ padding: '14px 18px 6px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            CATEGORIES
          </WireText>
        </div>
        {cats.map(([t, sub, on]) => (
          <WireListRow
            key={t}
            dark={dark}
            title={t}
            sub={sub}
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
            QUIET HOURS
          </WireText>
        </div>
        <div
          style={{
            margin: '0 14px 14px',
            padding: 14,
            borderRadius: 12,
            border: `1.5px solid ${p.rule}`,
            background: dark ? p.surface : '#fff',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '6px 0',
              borderBottom: `1px dashed ${p.ink4}`,
            }}
          >
            <WireText dark={dark} hand size={13}>
              From
            </WireText>
            <WireText dark={dark} hand size={13} color={p.ink2}>
              10:00 PM
            </WireText>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <WireText dark={dark} hand size={13}>
              To
            </WireText>
            <WireText dark={dark} hand size={13} color={p.ink2}>
              7:30 AM
            </WireText>
          </div>
        </div>
      </WireBg>
    </WirePhone>
  );
}

// G28 · Capabilities
function Capabilities({ dark = false }) {
  const p = wfPalette(dark);
  const items = [
    ['Anthropic', 'cloud · connected via Hobby', 'A', p.ok],
    ['OpenAI', 'BYOK · not configured', 'O', p.ink3],
    ['Google', 'BYOK · 2 keys', 'G', p.ok],
    ['xAI', 'BYOK · not configured', 'X', p.ink3],
    ['DeepSeek', 'BYOK · connected', 'D', p.ok],
    ['Perplexity', 'BYOK · connected', 'P', p.ok],
    ['Moonshot', 'not configured', 'M', p.ink3],
    ['Ollama', 'http://localhost:11434 · running', 'L', p.ok],
    ['LMStudio', 'not detected', 'S', p.ink3],
  ];
  return (
    <WirePhone dark={dark}>
      <WireTopBar
        dark={dark}
        left="back"
        title="Capabilities"
        sub="4 providers · 2 BYOK · 1 local"
      />
      <WireBg dark={dark}>
        {items.map(([n, sub, l, color]) => (
          <WireListRow
            key={n}
            dark={dark}
            leading={<WireIcon dark={dark} size={32} glyph={l} rounded={8} />}
            title={n}
            sub={sub}
            trailing={
              sub.startsWith('not') ? (
                <span className="wf-hand" style={{ fontSize: 12, color: p.accent }}>
                  Add key →
                </span>
              ) : (
                <span style={{ width: 8, height: 8, borderRadius: 4, background: color }} />
              )
            }
          />
        ))}
        <div style={{ padding: '14px 18px' }}>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: `1.5px dashed ${p.ink3}`,
              textAlign: 'center',
            }}
          >
            <WireText dark={dark} hand size={13}>
              + Add BYO endpoint (OpenAI-compatible URL)
            </WireText>
          </div>
        </div>
      </WireBg>
    </WirePhone>
  );
}

// G29 · Auto-approve
function AutoApprove({ dark = false }) {
  const p = wfPalette(dark);
  const tools = [
    ['Web search', 'Ask before searching · auto-approve safe', true],
    ['File read', 'Auto-approve reading workspace files', true],
    ['File write', 'Asks every time when off', false],
    ['Computer use', 'Cloud-only · join the waitlist', false],
    ['MCP exec', 'Asks every time when off · safest', false],
  ];
  return (
    <WirePhone dark={dark}>
      <WireTopBar dark={dark} left="back" title="Auto-approve" sub="2 of 5 enabled" />
      <WireBg dark={dark}>
        <div style={{ padding: '14px 18px' }}>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              background: dark ? p.warnSoft : '#fce8c4',
              border: `1.2px dashed ${p.warn}`,
            }}
          >
            <WireText dark={dark} hand size={12} color={p.warn}>
              You can always interrupt — even auto-approved tools show a 2s undo toast.
            </WireText>
          </div>
        </div>
        {tools.map(([t, sub, on]) => (
          <WireListRow
            key={t}
            dark={dark}
            title={t}
            sub={sub}
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
      </WireBg>
    </WirePhone>
  );
}

// G30 · Integrations (deeper than Connectors)
function Integrations({ dark = false }) {
  const p = wfPalette(dark);
  const items = [
    ['GitHub', '@siddhartha · repo, issues, pr · last sync 4m ago'],
    ['Notion', 'workspace.notion.so/siddhartha · 4 dbs · last sync 1h'],
    ['Linear', 'AGI org · cycles, projects · last sync 12m'],
    ['Google Drive', '2 drives · 1.2 GB indexed · last sync 30m'],
    ['Calendar', '4 calendars · last sync 5m'],
    ['Apple Photos', 'Limited access · 12 albums · last sync 2h'],
  ];
  return (
    <WirePhone dark={dark}>
      <WireTopBar dark={dark} left="back" title="Integrations" />
      <WireBg dark={dark}>
        {items.map(([n, sub]) => (
          <WireListRow
            key={n}
            dark={dark}
            h={70}
            leading={<WireIcon dark={dark} size={38} glyph={n[0]} rounded={10} />}
            title={n}
            sub={sub}
            trailing={<WireGlyph dark={dark} kind="chev" size={14} />}
          />
        ))}
        <div style={{ padding: '14px 18px' }}>
          <WireButton dark={dark} variant="soft" size="lg" w="100%">
            + Add integration
          </WireButton>
        </div>
      </WireBg>
    </WirePhone>
  );
}

// G31 · Storage
function Storage({ dark = false }) {
  const p = wfPalette(dark);
  const total = 12.5 + 0.084 + 2.1; // GB
  const segs = [
    ['Conversations', 0.0124, p.accent],
    ['Cache', 0.084, p.brand],
    ['On-device models', 2.1, p.warn],
  ];
  const tot = segs.reduce((a, [, v]) => a + v, 0);
  return (
    <WirePhone dark={dark}>
      <WireTopBar dark={dark} left="back" title="Storage" sub={`${tot.toFixed(2)} GB used`} />
      <WireBg dark={dark}>
        <div style={{ padding: '14px 18px 8px' }}>
          <div
            style={{
              height: 14,
              borderRadius: 7,
              background: dark ? p.surface : '#eae3d2',
              overflow: 'hidden',
              display: 'flex',
            }}
          >
            {segs.map(([n, v, c]) => (
              <div
                key={n}
                style={{
                  width: (v / tot) * 100 + '%',
                  background: c,
                  borderRight: `1px solid ${dark ? p.bg : '#fff'}`,
                }}
              />
            ))}
          </div>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {segs.map(([n, v, c]) => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: c }} />
                <WireText dark={dark} hand size={11}>
                  {n} · {v.toFixed(2)} GB
                </WireText>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: '8px 18px 6px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            BREAKDOWN
          </WireText>
        </div>
        {[
          ['Conversations', '12.4 MB · 124 chats', 'Clear'],
          ['Cache', '84 MB · web search, files', 'Clear'],
          ['On-device models', '2.1 GB · Llama 3.2 3B', 'Manage'],
          ['Drafts & attachments', '6 MB', 'Clear'],
        ].map(([t, sub, action]) => (
          <WireListRow
            key={t}
            dark={dark}
            title={t}
            sub={sub}
            trailing={
              <span className="wf-hand" style={{ fontSize: 12, color: p.accent }}>
                {action} →
              </span>
            }
          />
        ))}
        <div style={{ padding: '18px 18px 24px' }}>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: `1.5px solid ${p.danger}`,
              textAlign: 'center',
            }}
          >
            <span className="wf-hand" style={{ fontSize: 14, color: p.danger, fontWeight: 600 }}>
              Export all my data
            </span>
            <div>
              <WireText dark={dark} hand size={10} color={p.ink3}>
                DSAR per PRD §13 — emailed as .zip within 24h
              </WireText>
            </div>
          </div>
        </div>
      </WireBg>
    </WirePhone>
  );
}

// Voice settings page (locked never-train, cloud opt-in)
function VoiceSettings({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar dark={dark} left="back" title="Voice" />
      <WireBg dark={dark}>
        <div style={{ padding: '14px 18px 6px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            TRANSCRIPTION
          </WireText>
        </div>
        <div
          style={{
            margin: '0 14px',
            padding: 14,
            borderRadius: 12,
            border: `1.5px solid ${p.rule}`,
            background: dark ? p.surface : '#fff',
          }}
        >
          <div style={{ padding: '6px 0', display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <WireText dark={dark} hand size={14} weight={600}>
                On-device (default)
              </WireText>
              <div>
                <WireText dark={dark} hand size={11} color={p.ink3}>
                  iOS Speech · Apple Foundation cleanup
                </WireText>
              </div>
            </div>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                border: `2px solid ${p.accent}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ width: 12, height: 12, borderRadius: 6, background: p.accent }} />
            </div>
          </div>
          <div
            style={{
              padding: '12px 0',
              borderTop: `1px dashed ${p.ink4}`,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <div style={{ flex: 1 }}>
              <WireText dark={dark} hand size={14}>
                Cloud — Whisper API
              </WireText>
              <div>
                <WireText dark={dark} hand size={11} color={p.ink3}>
                  Higher accuracy · audio sent to OpenAI · deleted after 30 days
                </WireText>
              </div>
            </div>
            <div
              style={{
                width: 42,
                height: 24,
                borderRadius: 12,
                background: p.ink4,
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 2,
                  left: 2,
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  background: '#fff',
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 18px 6px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            PRIVACY
          </WireText>
        </div>
        <div
          style={{
            margin: '0 14px',
            padding: 14,
            borderRadius: 12,
            border: `1.5px solid ${p.rule}`,
            background: dark ? p.surface : '#fff',
          }}
        >
          <div style={{ padding: '6px 0', display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <WireText dark={dark} hand size={14}>
                Never train on my voice
              </WireText>
              <div>
                <WireText dark={dark} hand size={11} color={p.ink3}>
                  Locked on · cannot uncheck (lock #3)
                </WireText>
              </div>
            </div>
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                background: p.accent,
                border: `1.5px solid ${p.accent}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <WireGlyph dark={true} kind="check" size={12} />
            </div>
            <WireGlyph dark={dark} kind="lock" size={16} />
          </div>
        </div>

        <div style={{ padding: '14px 18px 6px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            COMPANION (VOICE-FIRST)
          </WireText>
        </div>
        <WireListRow
          dark={dark}
          title="Voice"
          sub="Aria · neutral · pitch 1.0"
          trailing={<WireGlyph dark={dark} kind="chev" size={14} />}
        />
        <WireListRow
          dark={dark}
          title="Auto-interrupt"
          sub="Stop on voice activity"
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
    </WirePhone>
  );
}

function renderSectionG() {
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
      id="settings-sub"
      title="08 — Settings sub-screens"
      subtitle="personalization · memory · notifications · capabilities · auto-approve · integrations · storage · voice"
    >
      {wrap('g25-light', '08.1 · Personalization · light', false, <Personalization dark={false} />)}
      {wrap('g25-dark', '08.1 · Personalization · dark', true, <Personalization dark />)}

      {wrap('g26-light', '08.2 · Memory + import · light', false, <Memory dark={false} />)}
      {wrap('g26-dark', '08.2 · Memory + import · dark', true, <Memory dark />)}

      {wrap('g27-light', '08.3 · Notifications · light', false, <Notifications dark={false} />)}
      {wrap('g27-dark', '08.3 · Notifications · dark', true, <Notifications dark />)}

      {wrap('g28-light', '08.4 · Capabilities · light', false, <Capabilities dark={false} />)}
      {wrap('g28-dark', '08.4 · Capabilities · dark', true, <Capabilities dark />)}

      {wrap('g29-light', '08.5 · Auto-approve · light', false, <AutoApprove dark={false} />)}
      {wrap('g29-dark', '08.5 · Auto-approve · dark', true, <AutoApprove dark />)}

      {wrap('g30-light', '08.6 · Integrations · light', false, <Integrations dark={false} />)}
      {wrap('g30-dark', '08.6 · Integrations · dark', true, <Integrations dark />)}

      {wrap('g31-light', '08.7 · Storage + DSAR · light', false, <Storage dark={false} />)}
      {wrap('g31-dark', '08.7 · Storage + DSAR · dark', true, <Storage dark />)}

      {wrap('gv-light', '08.8 · Voice settings · light', false, <VoiceSettings dark={false} />)}
      {wrap('gv-dark', '08.8 · Voice settings · dark', true, <VoiceSettings dark />)}
    </DCSection>
  );
}

Object.assign(window, {
  Personalization,
  Memory,
  Notifications,
  Capabilities,
  AutoApprove,
  Integrations,
  Storage,
  VoiceSettings,
  renderSectionG,
});
