// screens-k-local.jsx — Section K · v1 local-only additions
// 17 new screens: edge-case modals, waitlist flow, performance page, on-device feature screens

// ─── K11+K12 · Waitlist flow ────────────────────────────────────

// K11 · Waitlist email entry (after user taps locked Cloud)
function WaitlistEntry({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark} style={{ opacity: 0.15 }}>
        <div style={{ flex: 1 }} />
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 30 }} />
      <WireSheet dark={dark} h={620} style={{ zIndex: 40 }}>
        <div style={{ padding: '0 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <WireGlyph dark={dark} kind="x" size={20} />
          </div>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: dark ? p.raised : '#f0ece2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WireGlyph dark={dark} kind="cloud" size={28} />
          </div>
          <div style={{ marginTop: 14 }}>
            <span className="wf-script" style={{ fontSize: 32, fontWeight: 700, color: p.ink }}>
              Cloud is coming.
            </span>
          </div>
          <div style={{ marginTop: 8, maxWidth: 320 }}>
            <WireText dark={dark} hand size={14} color={p.ink2}>
              v1 runs entirely on your device. Cloud unlocks bigger models, web search, and
              computer-use. Join the waitlist and we'll email you.
            </WireText>
          </div>

          <div style={{ marginTop: 22 }}>
            <WireText dark={dark} hand size={11} color={p.ink3}>
              EMAIL · required
            </WireText>
            <div
              style={{
                marginTop: 4,
                padding: '12px 14px',
                borderRadius: 12,
                border: `1.5px solid ${p.rule}`,
                background: dark ? p.surface : '#fff',
              }}
            >
              <WireText dark={dark} mono size={14}>
                siddhartha@example.com
              </WireText>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <WireText dark={dark} hand size={11} color={p.ink3}>
              COUNTRY · optional · helps us price fairly
            </WireText>
            <div
              style={{
                marginTop: 4,
                padding: '12px 14px',
                borderRadius: 12,
                border: `1.5px solid ${p.rule}`,
                background: dark ? p.surface : '#fff',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <WireText dark={dark} hand size={14}>
                🇮🇳 India
              </WireText>
              <div style={{ flex: 1 }} />
              <WireGlyph dark={dark} kind="chevd" size={14} />
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ padding: '14px 22px 16px' }}>
          <WireButton dark={dark} variant="accent" size="xl" w="100%">
            Join waitlist
          </WireButton>
          <div style={{ marginTop: 10, textAlign: 'center' }}>
            <WireText dark={dark} hand size={11} color={p.ink3}>
              No account created. Email is only used to notify you.
            </WireText>
          </div>
        </div>
      </WireSheet>
    </WirePhone>
  );
}

// K12 · Waitlist confirmation
function WaitlistConfirm({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark} style={{ opacity: 0.15 }}>
        <div style={{ flex: 1 }} />
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 30 }} />
      <WireSheet dark={dark} h={520} style={{ zIndex: 40 }}>
        <div style={{ padding: '0 24px 18px', textAlign: 'center' }}>
          <div
            style={{
              width: 80,
              height: 80,
              margin: '8px auto 0',
              borderRadius: 40,
              background: p.ok,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WireGlyph dark={true} kind="check" size={40} />
          </div>
          <div style={{ marginTop: 16 }}>
            <span className="wf-script" style={{ fontSize: 30, fontWeight: 700, color: p.ink }}>
              You're confirmed.
            </span>
          </div>
          <div style={{ marginTop: 8, maxWidth: 320, margin: '8px auto 0' }}>
            <WireText dark={dark} hand size={14} color={p.ink2}>
              We'll email you when cloud opens. No date promised yet — we'll let you in waves so the
              cloud doesn't melt.
            </WireText>
          </div>
          <div
            style={{
              marginTop: 18,
              padding: '10px 14px',
              borderRadius: 12,
              border: `1.2px dashed ${p.ink3}`,
              display: 'inline-block',
            }}
          >
            <WireText dark={dark} hand size={12} color={p.ink2}>
              siddhartha@example.com · 🇮🇳 · joined May 18
            </WireText>
          </div>
          <div style={{ marginTop: 22 }}>
            <WireButton dark={dark} variant="accent" size="xl">
              Continue on-device
            </WireButton>
          </div>
        </div>
      </WireSheet>
    </WirePhone>
  );
}

// K5 · Tap-cloud-model waitlist tease (lighter, returning users)
function CloudTease({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark} style={{ opacity: 0.2 }}>
        <div style={{ flex: 1 }} />
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 30 }} />
      <WireSheet dark={dark} h={380} style={{ zIndex: 40 }}>
        <div style={{ padding: '0 22px 14px' }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: dark ? p.raised : '#f0ece2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WireGlyph dark={dark} kind="cloud" size={24} />
          </div>
          <div style={{ marginTop: 12 }}>
            <span className="wf-script" style={{ fontSize: 22, fontWeight: 700, color: p.ink }}>
              You're on the waitlist.
            </span>
          </div>
          <div style={{ marginTop: 6 }}>
            <WireText dark={dark} hand size={13} color={p.ink2}>
              Joined March 18 · email <span className="wf-mono">siddhartha@…</span>
            </WireText>
          </div>
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 10,
              background: dark ? p.surface : '#fbf8f1',
              border: `1px dashed ${p.ink4}`,
            }}
          >
            <WireText dark={dark} hand size={12}>
              Tier 2 cloud models (Opus 4.7, GPT-5.4, Gemini) need cloud. We'll email when your slot
              opens.
            </WireText>
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <WireButton dark={dark} variant="accent" size="lg" w="100%">
                Got it
              </WireButton>
            </div>
            <WireButton dark={dark} size="lg">
              Manage email
            </WireButton>
          </div>
        </div>
      </WireSheet>
    </WirePhone>
  );
}

// ─── K1-K3 · File/Image guards ──────────────────────────────────

// K1 · File too large prevention modal
function FileTooLarge({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark} style={{ opacity: 0.2 }}>
        <div style={{ flex: 1 }} />
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 30 }} />
      <WireSheet dark={dark} h={460} style={{ zIndex: 40 }}>
        <div style={{ padding: '0 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
            <WireGlyph dark={dark} kind="x" size={20} />
          </div>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: dark ? p.warnSoft : '#fce8c4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WireGlyph dark={dark} kind="file" size={26} />
          </div>
          <div style={{ marginTop: 12 }}>
            <span className="wf-script" style={{ fontSize: 24, fontWeight: 700, color: p.ink }}>
              That PDF is too big for on-device.
            </span>
          </div>
          <div style={{ marginTop: 8 }}>
            <WireText dark={dark} hand size={13} color={p.ink2}>
              <span style={{ fontWeight: 600 }}>annual-report.pdf</span> · 142 MB · 412 pages
            </WireText>
          </div>
          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              borderRadius: 12,
              background: dark ? p.surface : '#fbf8f1',
              border: `1px dashed ${p.ink4}`,
            }}
          >
            <WireText dark={dark} hand size={12} color={p.ink2}>
              On-device context fits ~40 pages at a time on your A15. We can split it.
            </WireText>
          </div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <WireButton dark={dark} variant="accent" size="lg" w="100%">
              Split into 11 chunks · Q&A across
            </WireButton>
            <WireButton dark={dark} size="md" w="100%">
              Pick a specific page range
            </WireButton>
            <WireButton dark={dark} size="md" w="100%">
              Cancel
            </WireButton>
          </div>
        </div>
      </WireSheet>
    </WirePhone>
  );
}

// K2 · File unreadable error
function FileUnreadable({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark} style={{ opacity: 0.2 }}>
        <div style={{ flex: 1 }} />
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 30 }} />
      <WireSheet dark={dark} h={420} style={{ zIndex: 40 }}>
        <div style={{ padding: '0 22px' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: dark ? p.dangerSoft : '#fbdada',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WireGlyph dark={dark} kind="alert" size={26} />
          </div>
          <div style={{ marginTop: 12 }}>
            <span className="wf-script" style={{ fontSize: 24, fontWeight: 700, color: p.ink }}>
              We can't read this file.
            </span>
          </div>
          <div style={{ marginTop: 8 }}>
            <WireText dark={dark} hand size={13} color={p.ink2}>
              <span style={{ fontWeight: 600 }}>scan-2024.pdf</span> · the text layer is missing —
              looks like a scanned image
            </WireText>
          </div>
          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              borderRadius: 12,
              background: dark ? p.surface : '#fbf8f1',
              border: `1px dashed ${p.ink4}`,
            }}
          >
            <WireText dark={dark} hand size={12} color={p.ink2}>
              Try OCR — we'll run Apple Vision on each page first, then Q&A.
            </WireText>
          </div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <WireButton dark={dark} variant="accent" size="lg" w="100%">
              Run OCR on-device · ~30s
            </WireButton>
            <WireButton dark={dark} size="md" w="100%">
              Pick a different file
            </WireButton>
          </div>
        </div>
      </WireSheet>
    </WirePhone>
  );
}

// K3 · Image too large prevention
function ImageTooLarge({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark} style={{ opacity: 0.18 }}>
        <div style={{ flex: 1 }} />
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 30 }} />
      <WireSheet dark={dark} h={460} style={{ zIndex: 40 }}>
        <div style={{ padding: '0 22px' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: dark ? p.warnSoft : '#fce8c4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WireGlyph dark={dark} kind="img" size={26} />
          </div>
          <div style={{ marginTop: 12 }}>
            <span className="wf-script" style={{ fontSize: 24, fontWeight: 700, color: p.ink }}>
              This photo is huge.
            </span>
          </div>
          <div style={{ marginTop: 8 }}>
            <WireText dark={dark} hand size={13} color={p.ink2}>
              <span style={{ fontWeight: 600 }}>IMG_2384.heic</span> · 4032 × 3024 · 8.4 MB
            </WireText>
          </div>
          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              borderRadius: 12,
              background: dark ? p.surface : '#fbf8f1',
              border: `1px dashed ${p.ink4}`,
            }}
          >
            <WireText dark={dark} hand size={12} color={p.ink2}>
              On-device vision works best at 1024×1024. We'll downscale before analyzing — no
              quality loss in your library.
            </WireText>
          </div>
          <div
            style={{
              marginTop: 14,
              padding: '8px 12px',
              borderRadius: 10,
              border: `1px solid ${p.ink4}`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <WireGlyph dark={dark} kind="check" size={14} />
            <WireText dark={dark} hand size={12}>
              Downscale to 1024 · keeps original on disk
            </WireText>
            <div style={{ flex: 1 }} />
            <div
              style={{
                width: 36,
                height: 22,
                borderRadius: 11,
                background: p.accent,
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 2,
                  left: 16,
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  background: '#fff',
                }}
              />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <WireButton dark={dark} variant="accent" size="lg" w="100%">
              Analyze on-device
            </WireButton>
          </div>
        </div>
      </WireSheet>
    </WirePhone>
  );
}

// ─── K4 · Offline banner (celebratory) ──────────────────────────
function OfflineBanner({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      {/* custom top with mode toggle */}
      <div
        style={{
          height: 56,
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
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
      <WireBg dark={dark}>
        {/* celebratory offline banner */}
        <div
          style={{
            margin: '8px 14px 0',
            padding: '10px 12px',
            borderRadius: 12,
            background: dark ? '#1a2922' : '#d9eddc',
            border: `1.5px dashed ${p.ok}`,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 20 }}>✈️</span>
          <div style={{ flex: 1 }}>
            <WireText dark={dark} hand size={13} weight={600} color={p.ok}>
              Airplane mode · works fine.
            </WireText>
            <div>
              <WireText dark={dark} hand size={11} color={p.ink2}>
                Llama 3.2 3B is loaded · no cloud needed
              </WireText>
            </div>
          </div>
          <WireGlyph dark={dark} kind="check" size={16} />
        </div>
        <WireBubble dark={dark} role="user">
          <WireText dark={dark} hand size={14}>
            Quick recipe for sourdough at 78% hydration?
          </WireText>
        </WireBubble>
        <WireBubble dark={dark} role="assistant">
          <WireText dark={dark} hand size={14}>
            At 78% — mix 500g flour, 390g water, 100g starter, 10g salt. Autolyse 30 min, then bulk
            ferment 4–5 hours at room temp with stretch-and-folds every 30 min.
          </WireText>
          <div style={{ height: 6 }} />
          <WireProvenance
            dark={dark}
            model="Llama 3.2 3B"
            tier="Tier 2"
            tps="22 t/s"
            ttft="180ms"
          />
        </WireBubble>
      </WireBg>
      <WireComposer dark={dark} model="Llama 3.2 3B" />
    </WirePhone>
  );
}

// ─── K6 · Battery-low inference warning ─────────────────────────
function BatteryLow({ dark = false }) {
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
        <div
          style={{
            margin: '8px 14px 0',
            padding: '10px 12px',
            borderRadius: 12,
            background: dark ? p.warnSoft : '#fce8c4',
            border: `1.2px dashed ${p.warn}`,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 18 }}>🔋</span>
          <div style={{ flex: 1 }}>
            <WireText dark={dark} hand size={13} weight={600} color={p.warn}>
              Battery 14% · inference slowed
            </WireText>
            <div>
              <WireText dark={dark} hand size={11} color={p.ink2}>
                Throttled to 8 t/s · plug in for full speed
              </WireText>
            </div>
          </div>
          <span className="wf-hand" style={{ fontSize: 12, color: p.warn, fontWeight: 600 }}>
            Dismiss
          </span>
        </div>
        <WireBubble dark={dark} role="user">
          <WireText dark={dark} hand size={14}>
            Summarize that meeting transcript I attached.
          </WireText>
        </WireBubble>
        <WireBubble dark={dark} role="assistant">
          <WireText dark={dark} hand size={14}>
            The team aligned on three priorities: ship v1 local-only, defer cloud to the waitlist,
            and lead with India distribution. Action items…
          </WireText>
          <div style={{ height: 4 }} />
          <span className="wf-mono" style={{ fontSize: 14, color: p.warn }}>
            ▍
          </span>
          <div style={{ height: 4 }} />
          <WireProvenance dark={dark} model="Llama 3.2 3B" tier="Tier 2" tps="8 t/s" ttft="640ms" />
        </WireBubble>
      </WireBg>
      <WireComposer dark={dark} model="Llama 3.2 3B" />
    </WirePhone>
  );
}

// ─── K7 · Storage-full model-download modal ─────────────────────
function StorageFullDownload({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark} style={{ opacity: 0.2 }}>
        <div style={{ flex: 1 }} />
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 30 }} />
      <WireSheet dark={dark} h={580} style={{ zIndex: 40 }}>
        <div style={{ padding: '0 22px' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: dark ? p.dangerSoft : '#fbdada',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WireGlyph dark={dark} kind="download" size={26} />
          </div>
          <div style={{ marginTop: 12 }}>
            <span className="wf-script" style={{ fontSize: 24, fontWeight: 700, color: p.ink }}>
              Not enough space.
            </span>
          </div>
          <div style={{ marginTop: 6 }}>
            <WireText dark={dark} hand size={13} color={p.ink2}>
              Llama 3.2 3B needs <span style={{ fontWeight: 600 }}>2.1 GB</span>. You have{' '}
              <span style={{ fontWeight: 600, color: p.danger }}>0.4 GB</span> free on this iPhone.
            </WireText>
          </div>
          {/* storage breakdown bar */}
          <div
            style={{
              marginTop: 14,
              height: 14,
              borderRadius: 7,
              background: dark ? p.surface : '#eae3d2',
              overflow: 'hidden',
              display: 'flex',
            }}
          >
            <div style={{ width: '52%', background: p.brand }} />
            <div style={{ width: '34%', background: '#3a86ff' }} />
            <div style={{ width: '11%', background: '#94a3b8' }} />
            <div style={{ width: '3%', background: p.ok }} />
          </div>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {[
              ['Photos · 67 GB', p.brand],
              ['Apps · 44 GB', '#3a86ff'],
              ['System · 14 GB', '#94a3b8'],
              ['Free · 0.4 GB', p.ok],
            ].map(([t, c]) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: c }} />
                <WireText dark={dark} hand size={11}>
                  {t}
                </WireText>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 12,
              border: `1.5px solid ${p.rule}`,
              background: dark ? p.surface : '#fff',
            }}
          >
            <WireText dark={dark} hand size={11} color={p.ink3}>
              SMALLER ALTERNATIVES
            </WireText>
            {[
              ['Qwen 2.5 0.5B', '400 MB · Tier 3 · ~14 t/s'],
              ['Phi 3.5 mini', '1.1 GB · Tier 2 · ~18 t/s'],
            ].map(([n, m], i) => (
              <div
                key={n}
                style={{
                  padding: '8px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  borderTop: i > 0 ? `1px dashed ${p.ink4}` : undefined,
                }}
              >
                <WireGlyph dark={dark} kind="cpu" size={18} />
                <div style={{ flex: 1 }}>
                  <WireText dark={dark} hand size={13} weight={600}>
                    {n}
                  </WireText>
                  <div>
                    <WireText dark={dark} hand size={11} color={p.ink3}>
                      {m}
                    </WireText>
                  </div>
                </div>
                <WireButton dark={dark} size="sm" variant="accent">
                  Get
                </WireButton>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <WireText dark={dark} hand size={12} color={p.accent}>
              Or free up space in Photos →
            </WireText>
          </div>
        </div>
      </WireSheet>
    </WirePhone>
  );
}

// ─── K8 · Thermal throttle composer chip ────────────────────────
function ThermalThrottle({ dark = false }) {
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
          <WireText dark={dark} hand size={14}>
            Refactor this React component to use Zustand.
          </WireText>
        </WireBubble>
        <WireBubble dark={dark} role="assistant">
          <WireParagraph dark={dark} lines={4} />
        </WireBubble>
        <WireBubble dark={dark} role="user">
          <WireText dark={dark} hand size={14}>
            Now do the same with Jotai.
          </WireText>
        </WireBubble>
        <WireBubble dark={dark} role="assistant">
          <WireParagraph dark={dark} lines={3} />
        </WireBubble>
      </WireBg>
      <div
        style={{ padding: '10px 14px 14px', borderTop: `1px dashed ${p.ink4}`, background: p.bg }}
      >
        {/* thermal chip above composer */}
        <div
          style={{
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            borderRadius: 10,
            background: dark ? '#3a2c14' : '#ffeac4',
            border: `1px dashed ${p.warn}`,
          }}
        >
          <span style={{ fontSize: 14 }}>🌡️</span>
          <WireText dark={dark} hand size={11} color={p.warn}>
            Phone is warm · throttled to 12 t/s · take a break or run a smaller model
          </WireText>
          <div style={{ flex: 1 }} />
          <span className="wf-hand" style={{ fontSize: 11, color: p.accent, fontWeight: 600 }}>
            Switch →
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 22,
            border: `1.5px solid ${p.rule}`,
            background: dark ? p.raised : '#fff',
            minHeight: 48,
          }}
        >
          <WireGlyph dark={dark} kind="plus" size={22} />
          <div style={{ flex: 1 }}>
            <WireText dark={dark} hand size={14} color={p.ink3} italic>
              Ask anything…
            </WireText>
          </div>
          <div
            style={{
              padding: '4px 10px',
              borderRadius: 16,
              border: `1.2px solid ${p.warn}`,
              background: dark ? p.warnSoft : '#fce8c4',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 10 }}>🌡️</span>
            <WireText dark={dark} hand size={11} color={p.warn}>
              Llama 3B · slow
            </WireText>
            <WireGlyph dark={dark} kind="chevd" size={12} />
          </div>
          <WireGlyph dark={dark} kind="mic" size={22} />
        </div>
      </div>
    </WirePhone>
  );
}

// ─── K9 · Model loading first-run sheet ─────────────────────────
function ModelLoadingFirstRun({ dark = false, progress = 0.42 }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireBg dark={dark} style={{ opacity: 0.15 }}>
        <div style={{ flex: 1 }} />
      </WireBg>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 30 }} />
      <WireSheet dark={dark} h={560} handle={false} style={{ zIndex: 40 }}>
        <div style={{ padding: '0 24px 18px', textAlign: 'center' }}>
          <div
            style={{
              width: 72,
              height: 72,
              margin: '8px auto 0',
              borderRadius: 36,
              background: dark ? p.accentSoft : '#dceaeb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WireGlyph dark={dark} kind="download" size={34} />
          </div>
          <div style={{ marginTop: 14 }}>
            <span className="wf-script" style={{ fontSize: 24, fontWeight: 700, color: p.ink }}>
              Setting up your AI team…
            </span>
          </div>
          <div style={{ marginTop: 8, maxWidth: 320, margin: '8px auto 0' }}>
            <WireText dark={dark} hand size={13} color={p.ink2}>
              Downloading Llama 3.2 3B (Tier 2 for your A15). Happens once — never again.
            </WireText>
          </div>

          {/* progress */}
          <div
            style={{
              marginTop: 22,
              padding: '14px 14px',
              borderRadius: 14,
              background: dark ? p.surface : '#fff',
              border: `1.5px solid ${p.rule}`,
              textAlign: 'left',
            }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
            >
              <WireText dark={dark} hand size={12} color={p.ink3}>
                Llama 3.2 3B · Q4_K_M
              </WireText>
              <WireText dark={dark} hand size={12} color={p.ink2}>
                880 MB / 2.1 GB
              </WireText>
            </div>
            <div
              style={{
                marginTop: 8,
                height: 10,
                borderRadius: 5,
                background: dark ? p.bg : '#eae3d2',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: progress * 100 + '%',
                  height: '100%',
                  background: p.accent,
                  borderRadius: 5,
                }}
              />
            </div>
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
              <span className="wf-hand" style={{ fontSize: 11, color: p.ink3 }}>
                ~3 min left · over Wi-Fi
              </span>
              <span className="wf-hand" style={{ fontSize: 11, color: p.ok }}>
                ● connected
              </span>
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              padding: '10px 12px',
              borderRadius: 10,
              background: dark ? p.surface : '#fbf8f1',
              border: `1px dashed ${p.ink4}`,
              textAlign: 'left',
            }}
          >
            <WireText dark={dark} hand size={11} color={p.ink3}>
              WHILE YOU WAIT
            </WireText>
            <div style={{ marginTop: 4 }}>
              <WireText dark={dark} hand size={12}>
                You can already use voice, on-device vision, and Apple Foundation Models for short
                chats.
              </WireText>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <WireText dark={dark} hand size={12} color={p.accent}>
              Pause download · use lighter model →
            </WireText>
          </div>
        </div>
      </WireSheet>
    </WirePhone>
  );
}

// ─── K10 · Context-getting-long nudge ───────────────────────────
function ContextNudge({ dark = false }) {
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
          <WireText dark={dark} hand size={13}>
            Now compare that pattern to TanStack Query.
          </WireText>
        </WireBubble>
        <WireBubble dark={dark} role="assistant">
          <WireParagraph dark={dark} lines={3} />
        </WireBubble>
        {/* nudge card inline */}
        <div
          style={{
            margin: '12px 14px',
            padding: '12px 14px',
            borderRadius: 14,
            background: dark ? p.surface : '#fbf8f1',
            border: `1.5px dashed ${p.warn}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <WireGlyph dark={dark} kind="info" size={18} />
            <WireText dark={dark} hand size={13} weight={600}>
              This chat is getting long (28 turns · 11k tok)
            </WireText>
          </div>
          <div style={{ marginTop: 6 }}>
            <WireText dark={dark} hand size={12} color={p.ink2}>
              On-device models slow down past ~8k tok. Want to fork a fresh chat? Memory carries
              over.
            </WireText>
          </div>
          {/* context meter */}
          <div
            style={{
              marginTop: 10,
              height: 6,
              borderRadius: 3,
              background: dark ? p.bg : '#eae3d2',
              overflow: 'hidden',
            }}
          >
            <div style={{ width: '78%', height: '100%', background: p.warn }} />
          </div>
          <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
            <WireText dark={dark} hand size={10} color={p.ink3}>
              11k / 14k tok used
            </WireText>
            <WireText dark={dark} hand size={10} color={p.warn}>
              78%
            </WireText>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <WireButton dark={dark} variant="accent" size="md">
              Fork new chat
            </WireButton>
            <WireButton dark={dark} size="md">
              Keep going
            </WireButton>
          </div>
        </div>
        <WireBubble dark={dark} role="user">
          <WireText dark={dark} hand size={13}>
            One more — show me with React Query v5.
          </WireText>
        </WireBubble>
      </WireBg>
      <WireComposer dark={dark} model="Llama 3.2 3B" />
    </WirePhone>
  );
}

// ─── K13 · Performance / device-tier page (replaces Usage breakdown) ──
function Performance({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar dark={dark} left="back" title="Performance" sub="device · models · runtime" />
      <WireBg dark={dark}>
        {/* device card */}
        <div
          style={{
            margin: '14px 14px',
            padding: 16,
            borderRadius: 16,
            border: `1.5px solid ${p.rule}`,
            background: dark ? p.surface : '#fff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <WireGlyph dark={dark} kind="cpu" size={28} />
            <div style={{ flex: 1 }}>
              <WireText dark={dark} hand size={14} weight={600}>
                iPhone 15 Pro Max · A17 Pro
              </WireText>
              <div>
                <WireText dark={dark} hand size={11} color={p.ink3}>
                  8 GB RAM · 16-core Neural Engine
                </WireText>
              </div>
            </div>
            <div style={{ padding: '4px 10px', borderRadius: 8, background: p.accent }}>
              <span className="wf-hand" style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>
                TIER 1
              </span>
            </div>
          </div>
          <div
            style={{
              marginTop: 12,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
            }}
          >
            {[
              ['Apple FM', '✓'],
              ['ExecuTorch', '✓'],
              ['llama.rn', '✓'],
            ].map(([n, v]) => (
              <div
                key={n}
                style={{
                  padding: '8px 6px',
                  borderRadius: 8,
                  background: dark ? p.bg : '#f5f0e3',
                  textAlign: 'center',
                }}
              >
                <WireText dark={dark} hand size={11} color={p.ink3}>
                  {n}
                </WireText>
                <div>
                  <span className="wf-hand" style={{ fontSize: 14, color: p.ok, fontWeight: 600 }}>
                    {v}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* loaded models */}
        <div style={{ padding: '4px 18px 6px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            LOADED · 3
          </WireText>
        </div>
        {[
          {
            n: 'Apple Foundation 3B',
            tier: 'Tier 1',
            tps: '38 t/s',
            ttft: '90ms',
            sz: '700 MB · system',
            active: true,
          },
          {
            n: 'Llama 3.2 3B · Q4',
            tier: 'Tier 2',
            tps: '22 t/s',
            ttft: '180ms',
            sz: '2.1 GB',
            active: true,
          },
          {
            n: 'Qwen 2.5 0.5B',
            tier: 'Tier 3',
            tps: '14 t/s',
            ttft: '60ms',
            sz: '400 MB · fallback',
          },
        ].map((m) => (
          <div
            key={m.n}
            style={{
              margin: '6px 14px',
              padding: '12px 14px',
              borderRadius: 12,
              border: `1.5px solid ${p.rule}`,
              background: dark ? p.surface : '#fff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <WireText dark={dark} hand size={13} weight={600}>
                {m.n}
              </WireText>
              {m.active && (
                <span
                  style={{ width: 8, height: 8, borderRadius: 4, background: p.ok, marginTop: 6 }}
                />
              )}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 12 }}>
              <div>
                <WireText dark={dark} hand size={10} color={p.ink3}>
                  {m.tier}
                </WireText>
              </div>
              <div>
                <WireText dark={dark} mono size={11}>
                  {m.tps}
                </WireText>
              </div>
              <div>
                <WireText dark={dark} mono size={11}>
                  ttft {m.ttft}
                </WireText>
              </div>
              <div style={{ flex: 1, textAlign: 'right' }}>
                <WireText dark={dark} hand size={11} color={p.ink3}>
                  {m.sz}
                </WireText>
              </div>
            </div>
          </div>
        ))}

        {/* live runtime */}
        <div style={{ padding: '14px 18px 6px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            LIVE
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
          {[
            ['Current tokens / second', '22 t/s', null],
            ['Last first-token latency', '180 ms', p.ok],
            ['Device thermal', 'Nominal', p.ok],
            ['Battery', '76%', p.ok],
            ['DPDP Act 2023', 'Compliant · audit log', p.ok],
          ].map(([k, v, c], i) => (
            <div
              key={k}
              style={{
                padding: '8px 0',
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: i < 4 ? `1px dashed ${p.ink4}` : undefined,
              }}
            >
              <WireText dark={dark} hand size={13}>
                {k}
              </WireText>
              <WireText dark={dark} hand size={13} color={c || p.ink2}>
                {v}
              </WireText>
            </div>
          ))}
        </div>
        <div style={{ padding: '14px 18px 24px' }}>
          <WireButton dark={dark} variant="soft" size="lg" w="100%">
            Run a 30s benchmark →
          </WireButton>
        </div>
      </WireBg>
    </WirePhone>
  );
}

// ─── K14 · Image-with-question full-screen flow ─────────────────
function ImageQuestion({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar
        dark={dark}
        left="x"
        title=""
        right={
          <>
            <WireGlyph dark={dark} kind="refresh" size={20} />
            <WireGlyph dark={dark} kind="x" size={20} />
          </>
        }
      />
      <WireBg dark={dark}>
        {/* image hero */}
        <div
          style={{
            margin: '8px 14px',
            borderRadius: 14,
            overflow: 'hidden',
            border: `1.5px solid ${p.rule}`,
            aspectRatio: 1.05,
            position: 'relative',
            background: dark ? p.raised : '#d4d0c4',
          }}
        >
          <div
            className={dark ? 'wf-hatch-d' : 'wf-hatch-l'}
            style={{ position: 'absolute', inset: 0 }}
          />
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              padding: '4px 10px',
              borderRadius: 10,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <span className="wf-hand" style={{ fontSize: 11, color: '#fff' }}>
              IMG_2384 · 1024 × 1024
            </span>
          </div>
        </div>
        {/* suggested questions */}
        <div style={{ padding: '0 18px 6px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            ASK ABOUT THIS
          </WireText>
        </div>
        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            "What's in this picture?",
            'Read the text on the sign',
            'Identify the bird species',
            'Suggest a caption for Instagram',
          ].map((q, i) => (
            <div
              key={q}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: `1px dashed ${p.ink4}`,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <WireGlyph dark={dark} kind={['eye', 'search', 'heart', 'pen'][i]} size={14} />
              <WireText dark={dark} hand size={13}>
                {q}
              </WireText>
            </div>
          ))}
        </div>
        {/* answer */}
        <div style={{ padding: '14px 18px 0' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            ANSWER
          </WireText>
        </div>
        <div style={{ padding: '6px 14px' }}>
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: dark ? p.surface : '#fff',
              border: `1.5px solid ${p.rule}`,
            }}
          >
            <WireText dark={dark} hand size={13}>
              A great blue heron standing in marsh grass at golden hour. The bird's silhouette is
              sharp; soft blur in the background suggests wide-aperture phone-camera.
            </WireText>
            <div style={{ height: 6 }} />
            <WireProvenance
              dark={dark}
              model="Llama 3.2 Vision 11B"
              tier="Tier 2"
              tps="11 t/s"
              ttft="320ms"
            />
          </div>
        </div>
      </WireBg>
      <WireComposer
        dark={dark}
        placeholder="Ask another question about this image…"
        model="Llama 3.2 Vision"
      />
    </WirePhone>
  );
}

// ─── K15 · Document Q&A drop-zone ───────────────────────────────
function DocumentDrop({ dark = false, dragging = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar dark={dark} left="back" title="Document Q&A" />
      <WireBg dark={dark}>
        <div style={{ padding: '20px 18px' }}>
          {/* drop-zone */}
          <div
            style={{
              padding: 22,
              borderRadius: 18,
              border: `2px ${dragging ? 'solid' : 'dashed'} ${dragging ? p.accent : p.ink3}`,
              background: dragging ? (dark ? p.accentSoft : '#dceaeb') : 'transparent',
              textAlign: 'center',
              minHeight: 200,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <WireGlyph dark={dark} kind="file" size={42} />
            <div>
              <span className="wf-script" style={{ fontSize: 22, fontWeight: 700, color: p.ink }}>
                {dragging ? 'Drop to analyze' : 'Drop a PDF or doc here'}
              </span>
            </div>
            <WireText dark={dark} hand size={12} color={p.ink3}>
              PDF · DOCX · TXT · MD · CSV · max 60 MB on-device
            </WireText>
            <div style={{ marginTop: 6 }}>
              <WireButton dark={dark} variant="accent" size="md">
                Browse Files
              </WireButton>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <WireText dark={dark} hand size={11} color={p.ink3}>
              RECENT
            </WireText>
          </div>
          {[
            ['meeting-2026-05-12.pdf', '14 pages · last opened today'],
            ['EU-AI-Act-§50.pdf', '32 pages · 3 days ago'],
            ['lease-2024.pdf', '8 pages · last week'],
          ].map(([n, m]) => (
            <WireListRow
              key={n}
              dark={dark}
              leading={<WireGlyph dark={dark} kind="file" size={22} />}
              title={n}
              sub={m}
              trailing={<WireGlyph dark={dark} kind="chev" size={14} />}
            />
          ))}
        </div>
      </WireBg>
    </WirePhone>
  );
}

// ─── K16 · OCR scan flow ────────────────────────────────────────
function OCRScan({ dark = true }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <div
        style={{
          flex: 1,
          background: '#000',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className={'wf-hatch-d'} style={{ position: 'absolute', inset: 0, opacity: 0.4 }} />
        {/* top bar */}
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
            zIndex: 10,
          }}
        >
          <WireGlyph dark={true} kind="x" size={22} />
          <div
            style={{
              padding: '4px 12px',
              borderRadius: 14,
              background: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <span className="wf-hand" style={{ fontSize: 12, color: '#fff' }}>
              OCR · Apple Vision
            </span>
          </div>
          <WireGlyph dark={true} kind="bolt" size={22} />
        </div>
        {/* OCR frame */}
        <div
          style={{
            position: 'absolute',
            top: 140,
            left: 30,
            right: 30,
            bottom: 220,
            border: `2px solid ${p.accent}`,
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          {/* corner brackets */}
          {[
            ['tl', 'top:-2px;left:-2px'],
            ['tr', 'top:-2px;right:-2px'],
            ['bl', 'bottom:-2px;left:-2px'],
            ['br', 'bottom:-2px;right:-2px'],
          ].map(([k, pos]) => {
            const styles = Object.fromEntries(
              pos.split(';').map((s) => {
                const [a, b] = s.split(':');
                return [a, b];
              }),
            );
            return (
              <div
                key={k}
                style={{
                  position: 'absolute',
                  width: 22,
                  height: 22,
                  ...styles,
                  borderTop: k.startsWith('t') ? `4px solid ${p.accent}` : undefined,
                  borderBottom: k.startsWith('b') ? `4px solid ${p.accent}` : undefined,
                  borderLeft: k.endsWith('l') ? `4px solid ${p.accent}` : undefined,
                  borderRight: k.endsWith('r') ? `4px solid ${p.accent}` : undefined,
                }}
              />
            );
          })}
          {/* recognized text overlays */}
          <div style={{ position: 'absolute', top: 40, left: 14, right: 14 }}>
            <div
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                background: 'rgba(33,128,141,0.85)',
                display: 'inline-block',
              }}
            >
              <span className="wf-hand" style={{ fontSize: 13, color: '#fff' }}>
                HOT TUB INSTRUCTIONS
              </span>
            </div>
          </div>
          <div style={{ position: 'absolute', top: 80, left: 14, right: 14 }}>
            <div
              style={{
                padding: '3px 6px',
                borderRadius: 5,
                background: 'rgba(33,128,141,0.65)',
                display: 'inline-block',
              }}
            >
              <span className="wf-hand" style={{ fontSize: 11, color: '#fff' }}>
                PLEASE READ before entering hot tub.
              </span>
            </div>
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 100,
            left: 0,
            right: 0,
            textAlign: 'center',
            color: '#fff',
          }}
        >
          <span className="wf-hand" style={{ fontSize: 12 }}>
            Hold steady · 4 lines recognized
          </span>
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: 0,
            right: 0,
            padding: '0 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              padding: '8px 14px',
              borderRadius: 22,
              background: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <span className="wf-hand" style={{ fontSize: 12, color: '#fff' }}>
              Translate after
            </span>
          </div>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              border: '4px solid #fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: 56, height: 56, borderRadius: 28, background: '#fff' }} />
          </div>
          <div
            style={{
              padding: '8px 14px',
              borderRadius: 22,
              background: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <span className="wf-hand" style={{ fontSize: 12, color: '#fff' }}>
              Ask Q&A
            </span>
          </div>
        </div>
      </div>
    </WirePhone>
  );
}

// ─── K17 · On-device translate ──────────────────────────────────
function Translate({ dark = false }) {
  const p = wfPalette(dark);
  return (
    <WirePhone dark={dark}>
      <WireTopBar
        dark={dark}
        left="back"
        title="Translate"
        sub="on-device · Apple Translate"
        right={<WireGlyph dark={dark} kind="settings" size={20} />}
      />
      <WireBg dark={dark}>
        {/* language picker */}
        <div style={{ padding: '14px 14px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 12,
              border: `1.5px solid ${p.rule}`,
              background: dark ? p.surface : '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <WireText dark={dark} hand size={11} color={p.ink3}>
              FROM
            </WireText>
            <div style={{ flex: 1 }}>
              <WireText dark={dark} hand size={14} weight={600}>
                Hindi
              </WireText>
            </div>
            <WireGlyph dark={dark} kind="chevd" size={14} />
          </div>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              background: dark ? p.raised : '#f0ece2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WireGlyph dark={dark} kind="refresh" size={16} />
          </div>
          <div
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 12,
              border: `1.5px solid ${p.rule}`,
              background: dark ? p.surface : '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <WireText dark={dark} hand size={11} color={p.ink3}>
              TO
            </WireText>
            <div style={{ flex: 1 }}>
              <WireText dark={dark} hand size={14} weight={600}>
                English
              </WireText>
            </div>
            <WireGlyph dark={dark} kind="chevd" size={14} />
          </div>
        </div>

        {/* source */}
        <div
          style={{
            margin: '8px 14px',
            padding: 16,
            borderRadius: 14,
            background: dark ? p.surface : '#fff',
            border: `1.5px solid ${p.rule}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <WireText dark={dark} hand size={11} color={p.ink3}>
              HINDI
            </WireText>
            <WireGlyph dark={dark} kind="mic" size={16} />
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={{ fontFamily: 'system-ui', fontSize: 22, color: p.ink, lineHeight: 1.3 }}>
              नमस्ते, क्या आप मुझे निकटतम रेलवे स्टेशन तक का रास्ता बता सकते हैं?
            </span>
          </div>
        </div>

        {/* result */}
        <div
          style={{
            margin: '8px 14px',
            padding: 16,
            borderRadius: 14,
            background: dark ? p.accentSoft : '#dceaeb',
            border: `1.5px solid ${p.accent}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <WireText dark={dark} hand size={11} color={p.accent}>
              ENGLISH
            </WireText>
            <div style={{ display: 'flex', gap: 8 }}>
              <WireGlyph dark={dark} kind="waveform" size={16} />
              <WireGlyph dark={dark} kind="file" size={16} />
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <span className="wf-script" style={{ fontSize: 22, fontWeight: 600, color: p.ink }}>
              Hello, could you tell me the way to the nearest railway station?
            </span>
          </div>
          <div style={{ marginTop: 10 }}>
            <WireProvenance
              dark={dark}
              model="Apple Translate"
              tier="Tier 1"
              tps={null}
              ttft="<20ms"
            />
          </div>
        </div>

        {/* recents */}
        <div style={{ padding: '14px 18px 6px' }}>
          <WireText dark={dark} hand size={11} color={p.ink3}>
            RECENT PAIRS
          </WireText>
        </div>
        {['Hindi → English', 'Tamil → English', 'Spanish → English'].map((p2) => (
          <WireListRow
            key={p2}
            dark={dark}
            title={p2}
            trailing={<WireGlyph dark={dark} kind="chev" size={14} />}
          />
        ))}
      </WireBg>
    </WirePhone>
  );
}

function renderSectionK() {
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
      id="local-v1"
      title="13 — Local v1 additions"
      subtitle="waitlist · file/image guards · thermal/battery · model loading · context nudge · performance · on-device features"
    >
      {/* Waitlist + cloud tease */}
      {wrap(
        'k11-light',
        '13.1 · Waitlist email entry · light',
        false,
        <WaitlistEntry dark={false} />,
      )}
      {wrap('k11-dark', '13.1 · Waitlist email entry · dark', true, <WaitlistEntry dark />)}
      {wrap(
        'k12-light',
        '13.2 · Waitlist confirmation · light',
        false,
        <WaitlistConfirm dark={false} />,
      )}
      {wrap('k12-dark', '13.2 · Waitlist confirmation · dark', true, <WaitlistConfirm dark />)}
      {wrap(
        'k5-light',
        '13.3 · Cloud-locked tap · joined waitlist · light',
        false,
        <CloudTease dark={false} />,
      )}
      {wrap(
        'k5-dark',
        '13.3 · Cloud-locked tap · joined waitlist · dark',
        true,
        <CloudTease dark />,
      )}

      {/* File / Image guards */}
      {wrap('k1-light', '13.4 · File too large · light', false, <FileTooLarge dark={false} />)}
      {wrap('k1-dark', '13.4 · File too large · dark', true, <FileTooLarge dark />)}
      {wrap(
        'k2-light',
        '13.5 · File unreadable (scanned PDF) · light',
        false,
        <FileUnreadable dark={false} />,
      )}
      {wrap('k3-light', '13.6 · Image too large · light', false, <ImageTooLarge dark={false} />)}

      {/* Connectivity + device states */}
      {wrap(
        'k4-light',
        '13.7 · Offline banner · celebratory · light',
        false,
        <OfflineBanner dark={false} />,
      )}
      {wrap('k4-dark', '13.7 · Offline banner · celebratory · dark', true, <OfflineBanner dark />)}
      {wrap(
        'k6-light',
        '13.8 · Battery-low inference warning · light',
        false,
        <BatteryLow dark={false} />,
      )}
      {wrap(
        'k7-light',
        '13.9 · Storage full · model download · light',
        false,
        <StorageFullDownload dark={false} />,
      )}
      {wrap(
        'k7-dark',
        '13.9 · Storage full · model download · dark',
        true,
        <StorageFullDownload dark />,
      )}
      {wrap(
        'k8-light',
        '13.10 · Thermal throttle composer chip · light',
        false,
        <ThermalThrottle dark={false} />,
      )}
      {wrap('k8-dark', '13.10 · Thermal throttle · dark', true, <ThermalThrottle dark />)}
      {wrap(
        'k9-light',
        '13.11 · Model loading first-run · light',
        false,
        <ModelLoadingFirstRun dark={false} />,
      )}
      {wrap(
        'k9-dark',
        '13.11 · Model loading first-run · dark',
        true,
        <ModelLoadingFirstRun dark />,
      )}
      {wrap(
        'k10-light',
        '13.12 · Context-getting-long nudge · light',
        false,
        <ContextNudge dark={false} />,
      )}
      {wrap('k10-dark', '13.12 · Context-getting-long nudge · dark', true, <ContextNudge dark />)}

      {/* Performance page (replaces Usage breakdown) */}
      {wrap(
        'k13-light',
        '13.13 · Performance / device tier · light',
        false,
        <Performance dark={false} />,
      )}
      {wrap('k13-dark', '13.13 · Performance / device tier · dark', true, <Performance dark />)}

      {/* On-device feature surfaces */}
      {wrap(
        'k14-light',
        '13.14 · Image + question full-screen · light',
        false,
        <ImageQuestion dark={false} />,
      )}
      {wrap('k14-dark', '13.14 · Image + question · dark', true, <ImageQuestion dark />)}
      {wrap(
        'k15-idle',
        '13.15 · Document Q&A drop-zone · idle · light',
        false,
        <DocumentDrop dark={false} />,
      )}
      {wrap(
        'k15-drag',
        '13.15 · Document Q&A · drag-over · light',
        false,
        <DocumentDrop dark={false} dragging />,
      )}
      {wrap('k16-dark', '13.16 · OCR scan · dark', true, <OCRScan dark />)}
      {wrap('k17-light', '13.17 · On-device translate · light', false, <Translate dark={false} />)}
      {wrap('k17-dark', '13.17 · On-device translate · dark', true, <Translate dark />)}
    </DCSection>
  );
}

Object.assign(window, {
  WaitlistEntry,
  WaitlistConfirm,
  CloudTease,
  FileTooLarge,
  FileUnreadable,
  ImageTooLarge,
  OfflineBanner,
  BatteryLow,
  StorageFullDownload,
  ThermalThrottle,
  ModelLoadingFirstRun,
  ContextNudge,
  Performance,
  ImageQuestion,
  DocumentDrop,
  OCRScan,
  Translate,
  renderSectionK,
});
