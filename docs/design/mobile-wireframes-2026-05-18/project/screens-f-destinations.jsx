// screens-f-destinations.jsx — Section F · Drawer destinations (6 screens)

// F19 · Skills
function Skills({ dark = false, empty = false }) {
  const p = wfPalette(dark);
  const items = [
    ['code', 'Refactor to Zod', 'Validate forms with discriminated unions', 'last run 2h ago'],
    ['pencil', 'Editor pass', 'Make my writing punchier, drop adverbs', 'last run yesterday'],
    ['book', 'Summarize PDF', 'Bullet-list a long document', 'last run 3 days'],
    ['drive', 'Drive search', 'Search across my linked Drive', '· not run yet'],
    ['plug', 'Linear triage', "Triage today's Linear inbox", 'last run today'],
  ];
  return (
    <WirePhone dark={dark}>
      <WireTopBar
        dark={dark}
        left="menu"
        title="Skills"
        right={
          <>
            <WireGlyph dark={dark} kind="search" size={20} />
            <WireGlyph dark={dark} kind="plus" size={22} />
          </>
        }
      />
      <WireBg dark={dark}>
        {empty ? (
          <div style={{ padding: '120px 32px 0', textAlign: 'center' }}>
            <WireGlyph dark={dark} kind="skill" size={44} />
            <div style={{ marginTop: 14 }}>
              <span className="wf-script" style={{ fontSize: 24, fontWeight: 700, color: p.ink }}>
                No skills yet
              </span>
            </div>
            <div style={{ marginTop: 6 }}>
              <WireText dark={dark} hand size={13} color={p.ink3}>
                Skills are tiny tools you save and rerun. Indexed from GitHub.
              </WireText>
            </div>
            <div style={{ marginTop: 20 }}>
              <WireButton dark={dark} variant="accent" size="lg">
                Browse skill catalog
              </WireButton>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: '14px 18px 6px' }}>
              <WireText dark={dark} hand size={11} color={p.ink3}>
                INSTALLED · 5
              </WireText>
            </div>
            {items.map(([g, t, sub, ts]) => (
              <WireListRow
                key={t}
                dark={dark}
                h={66}
                leading={<WireIcon dark={dark} size={36} glyph={t[0]} rounded={10} />}
                title={t}
                sub={`${sub} · ${ts}`}
                trailing={
                  <WireButton dark={dark} size="sm" variant="soft">
                    Run
                  </WireButton>
                }
              />
            ))}
            <div style={{ padding: '14px 18px' }}>
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: `1.5px dashed ${p.ink3}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <WireGlyph dark={dark} kind="github" size={20} />
                <WireText dark={dark} hand size={13}>
                  Browse GitHub-indexed catalog →
                </WireText>
              </div>
            </div>
          </>
        )}
      </WireBg>
    </WirePhone>
  );
}

// F20 · Projects
function Projects({ dark = false, empty = false }) {
  const p = wfPalette(dark);
  const items = [
    ['AGI Automation LLC', '24 chats · pinned'],
    ['Jobs', '12 chats · 1 dispatch'],
    ['Claude prompt', '8 chats'],
    ['Lisbon trip', '3 chats'],
  ];
  return (
    <WirePhone dark={dark}>
      <WireTopBar
        dark={dark}
        left="menu"
        title="Projects"
        right={<WireGlyph dark={dark} kind="search" size={20} />}
      />
      <WireBg dark={dark}>
        {empty ? (
          <div style={{ padding: '120px 32px 0', textAlign: 'center' }}>
            <WireGlyph dark={dark} kind="folder" size={44} />
            <div style={{ marginTop: 14 }}>
              <span className="wf-script" style={{ fontSize: 24, fontWeight: 700, color: p.ink }}>
                No projects yet
              </span>
            </div>
            <div style={{ marginTop: 6 }}>
              <WireText dark={dark} hand size={13} color={p.ink3}>
                Group chats, files, and memory under a topic.
              </WireText>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: '14px 18px 6px' }}>
              <WireText dark={dark} hand size={11} color={p.ink3}>
                PINNED
              </WireText>
            </div>
            <div
              style={{
                padding: '0 18px 8px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
              }}
            >
              {items.slice(0, 2).map(([n, m]) => (
                <div
                  key={n}
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    border: `1.5px solid ${p.rule}`,
                    background: dark ? p.surface : '#fff',
                  }}
                >
                  <WireGlyph dark={dark} kind="folder2" size={22} />
                  <div style={{ marginTop: 10 }}>
                    <WireText dark={dark} hand size={14} weight={600}>
                      {n}
                    </WireText>
                  </div>
                  <div style={{ marginTop: 2 }}>
                    <WireText dark={dark} hand size={11} color={p.ink3}>
                      {m}
                    </WireText>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '14px 18px 6px' }}>
              <WireText dark={dark} hand size={11} color={p.ink3}>
                ALL
              </WireText>
            </div>
            {items.map(([n, m], i) => (
              <WireListRow
                key={i}
                dark={dark}
                leading={<WireGlyph dark={dark} kind="folder2" size={20} />}
                title={n}
                sub={m}
                trailing={<WireGlyph dark={dark} kind="chev" size={14} />}
              />
            ))}
          </>
        )}
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

// F21 · Dispatch
function Dispatch({ dark = false }) {
  const p = wfPalette(dark);
  const items = [
    [
      'Migrate Postgres schema',
      'Desktop · MacBook Pro',
      'Running',
      p.accent,
      '03:42 elapsed',
      true,
    ],
    ['Inbox triage @ 5pm', 'Web · siddhartha.app', 'Pending', p.ink3, 'starts in 1h 24m'],
    ['Lighthouse audit', 'CLI · ssh server', 'Done', p.ok, 'finished 22m ago'],
    ['Generate cover images', 'Web · figma plugin', 'Done', p.ok, 'finished 2h ago'],
    [
      'EU AI Act §50 deep research',
      'Desktop · MacBook Pro',
      'Failed · auth',
      p.danger,
      '12m ago · retry',
    ],
  ];
  return (
    <WirePhone dark={dark}>
      <WireTopBar
        dark={dark}
        left="menu"
        title="Dispatch"
        sub="2 running · 1 pending"
        right={
          <>
            <WireGlyph dark={dark} kind="search" size={20} />
            <WireGlyph dark={dark} kind="plus" size={22} />
          </>
        }
      />
      <WireBg dark={dark}>
        {items.map(([t, surface, status, color, when, pulse], i) => (
          <div
            key={i}
            style={{
              margin: '10px 14px',
              padding: '12px 14px',
              borderRadius: 12,
              border: `1.5px solid ${p.rule}`,
              background: dark ? p.surface : '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: color,
                    boxShadow: pulse ? `0 0 0 4px ${color}33` : undefined,
                  }}
                />
                <WireText dark={dark} hand size={13} weight={600}>
                  {status}
                </WireText>
              </div>
              <WireText dark={dark} hand size={11} color={p.ink3}>
                {when}
              </WireText>
            </div>
            <div style={{ marginTop: 6 }}>
              <WireText dark={dark} hand size={14}>
                {t}
              </WireText>
            </div>
            <div style={{ marginTop: 4 }}>
              <WireText dark={dark} hand size={11} color={p.ink3}>
                → {surface}
              </WireText>
            </div>
          </div>
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

// F22 · Connectors
function Connectors({ dark = false }) {
  const p = wfPalette(dark);
  const items = [
    ['github', 'GitHub', 'Connected · @siddhartha', true],
    ['file', 'Notion', 'Connected · 4 dbs', true],
    ['arrow', 'Linear', 'Connected', true],
    ['chat', 'Slack', 'Disconnected', false],
    ['drive', 'Google Drive', 'Connected · 2 drives', true],
    ['calendar', 'Calendar', 'Connected', true],
    ['health', 'HealthKit', 'iOS only · Disconnected', false, 'ios'],
    ['img', 'Apple Photos', 'Connected · Limited access', true],
    ['file', 'Files', 'Connected', true],
    ['bell', 'Plaid', 'Coming soon · v1.1', false, 'soon'],
  ];
  return (
    <WirePhone dark={dark}>
      <WireTopBar
        dark={dark}
        left="menu"
        title="Connectors"
        right={<WireGlyph dark={dark} kind="search" size={20} />}
      />
      <WireBg dark={dark}>
        <div style={{ padding: '14px 18px 6px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            CONNECTED · 6
          </WireText>
        </div>
        {items.map(([g, n, status, on, tag], i) => (
          <WireListRow
            key={n}
            dark={dark}
            leading={<WireIcon dark={dark} size={32} glyph={n[0]} rounded={8} />}
            title={n}
            sub={status}
            trailing={
              tag === 'soon' ? (
                <span
                  className="wf-hand"
                  style={{
                    fontSize: 11,
                    color: p.ink3,
                    padding: '2px 8px',
                    border: `1px dashed ${p.ink3}`,
                    borderRadius: 6,
                  }}
                >
                  Soon
                </span>
              ) : (
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
              )
            }
          />
        ))}
      </WireBg>
    </WirePhone>
  );
}

// F23 · Settings (index)
function Settings({ dark = false }) {
  const p = wfPalette(dark);
  const sections = [
    [
      'LOCAL',
      [
        ['user', 'Personalization', 'Theme · greeting · language'],
        ['pin', 'Memory', '12 facts remembered'],
        ['bell', 'Notifications', 'Local notifications only'],
      ],
    ],
    [
      'ON-DEVICE',
      [
        ['cpu', 'Models', '3 loaded · Llama 3.2 3B active'],
        ['check', 'Auto-approve', 'Tool permissions (file read, OCR)'],
        ['plug', 'Integrations', 'HealthKit, Photos, Calendar, Files'],
      ],
    ],
    [
      'SYSTEM',
      [
        ['download', 'Storage', '2.1 GB models · 84 MB cache'],
        ['mic', 'Voice', 'iOS Speech · on-device · never-train locked'],
        ['cpu', 'Performance', 'A17 Pro · Tier 1 · 22 t/s'],
        ['cloud', 'Cloud waitlist', "Joined March 18 · we'll email you"],
        ['lock', 'Privacy & DPDP', 'DPDP Act 2023 compliant · audit log'],
        ['info', 'About AGI', 'AGI Automation LLC · v1.0.0'],
      ],
    ],
  ];
  return (
    <WirePhone dark={dark}>
      <WireTopBar
        dark={dark}
        left="menu"
        title="Settings"
        right={<WireGlyph dark={dark} kind="search" size={20} />}
      />
      <WireBg dark={dark}>
        {/* profile card */}
        <div
          style={{
            margin: '14px 18px',
            padding: 14,
            borderRadius: 14,
            border: `1.5px solid ${p.rule}`,
            background: dark ? p.surface : '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <WireAvatar dark={dark} size={50} label="S" />
          <div style={{ flex: 1 }}>
            <WireText dark={dark} hand size={15} weight={600}>
              Siddhartha Bhat
            </WireText>
            <div>
              <WireText dark={dark} hand size={11} color={p.ink3}>
                siddhartha@example.com
              </WireText>
            </div>
          </div>
          <div style={{ padding: '4px 9px', borderRadius: 10, border: `1px solid ${p.accent}` }}>
            <span className="wf-hand" style={{ fontSize: 11, color: p.ok, fontWeight: 600 }}>
              LOCAL
            </span>
          </div>
        </div>
        {sections.map(([hd, rows]) => (
          <React.Fragment key={hd}>
            <div style={{ padding: '14px 18px 4px' }}>
              <WireText dark={dark} hand size={11} color={p.ink3}>
                {hd}
              </WireText>
            </div>
            {rows.map(([g, t, sub]) => (
              <WireListRow
                key={t}
                dark={dark}
                leading={<WireGlyph dark={dark} kind={g} size={20} />}
                title={t}
                sub={sub}
                trailing={<WireGlyph dark={dark} kind="chev" size={14} />}
              />
            ))}
          </React.Fragment>
        ))}
      </WireBg>
    </WirePhone>
  );
}

// F24 · Profile (v1 = local, no account)
function Account({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar dark={dark} left="back" title="Profile" />
      <WireBg dark={dark}>
        <div style={{ padding: '32px 24px 0', textAlign: 'center' }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <WireAvatar dark={dark} size={84} label="S" />
            <div
              style={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                width: 28,
                height: 28,
                borderRadius: 14,
                background: p.accent,
                border: `2px solid ${p.bg}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <WireGlyph dark={true} kind="cam" size={14} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <WireText dark={dark} hand size={18} weight={600}>
              Siddhartha
            </WireText>
          </div>
          <div style={{ marginTop: 2 }}>
            <WireText dark={dark} hand size={12} color={p.ink3}>
              Local profile · no account · since May 18, 2026
            </WireText>
          </div>
        </div>
        <div style={{ padding: '24px 18px 0' }}>
          <div
            style={{
              padding: 14,
              borderRadius: 14,
              border: `1.5px solid ${p.rule}`,
              background: dark ? p.surface : '#fff',
            }}
          >
            {[
              ['Display name', 'Siddhartha'],
              ['Time-of-day greeting', 'On'],
              ['Device', 'iPhone 15 Pro Max · A17 Pro'],
              ['Runtime tier', 'Tier 1 (Apple Foundation)'],
              ['Storage used', '2.18 GB'],
            ].map(([k, v], i) => (
              <div
                key={k}
                style={{
                  padding: '10px 0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: i < 4 ? `1px dashed ${p.ink4}` : undefined,
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
            <WireListRow
              dark={dark}
              title="Cloud waitlist"
              sub="Joined March 18 · siddhartha@…"
              trailing={<WireGlyph dark={dark} kind="chev" size={14} />}
            />
            <WireListRow
              dark={dark}
              title="Export my data"
              sub="DSAR / DPDP — emailed as .zip"
              trailing={<WireGlyph dark={dark} kind="chev" size={14} />}
            />
            <WireListRow
              dark={dark}
              title="Reset everything"
              sub="Delete local DB and start fresh"
              trailing={<WireGlyph dark={dark} kind="chev" size={14} />}
            />
          </div>
          <div
            style={{
              marginTop: 18,
              padding: '12px 14px',
              borderRadius: 12,
              border: `1px dashed ${p.ok}`,
              background: dark ? '#1a2922' : '#d9eddc',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <WireGlyph dark={dark} kind="check" size={18} />
            <WireText dark={dark} hand size={12} color={p.ok}>
              Your conversations never leave your phone.
            </WireText>
          </div>
        </div>
      </WireBg>
    </WirePhone>
  );
}

function renderSectionF() {
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
      id="dest"
      title="07 — Drawer destinations"
      subtitle="Skills · Projects · Dispatch · Connectors · Settings · Account"
    >
      {wrap('f19-light', '07.1 · Skills · populated · light', false, <Skills dark={false} />)}
      {wrap('f19-empty', '07.1 · Skills · empty · light', false, <Skills dark={false} empty />)}
      {wrap('f19-dark', '07.1 · Skills · dark', true, <Skills dark />)}

      {wrap('f20-light', '07.2 · Projects · populated · light', false, <Projects dark={false} />)}
      {wrap('f20-empty', '07.2 · Projects · empty · light', false, <Projects dark={false} empty />)}
      {wrap('f20-dark', '07.2 · Projects · dark', true, <Projects dark />)}

      {wrap('f21-light', '07.3 · Dispatch · light', false, <Dispatch dark={false} />)}
      {wrap('f21-dark', '07.3 · Dispatch · dark', true, <Dispatch dark />)}

      {wrap('f22-light', '07.4 · Connectors · light', false, <Connectors dark={false} />)}
      {wrap('f22-dark', '07.4 · Connectors · dark', true, <Connectors dark />)}

      {wrap('f23-light', '07.5 · Settings · light', false, <Settings dark={false} />)}
      {wrap('f23-dark', '07.5 · Settings · dark', true, <Settings dark />)}

      {wrap('f24-light', '07.6 · Account · light', false, <Account dark={false} />)}
      {wrap('f24-dark', '07.6 · Account · dark', true, <Account dark />)}
    </DCSection>
  );
}

Object.assign(window, {
  Skills,
  Projects,
  Dispatch,
  Connectors,
  Settings,
  Account,
  renderSectionF,
});
