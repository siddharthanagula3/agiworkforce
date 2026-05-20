// wireframe-kit.jsx — sketchy primitives for AGI mobile wireframes
// All components share a low-fi, hand-drawn vibe. Two themes (light/dark).
// Exports to window so other babel scripts can use them.

const WF_LIGHT = {
  bg: '#f6f3ec', // cream paper
  surface: '#fffdf7',
  raised: '#ffffff',
  ink: '#1a1915',
  ink2: '#4a4540',
  ink3: '#8b8680',
  ink4: '#b8b3ad',
  rule: '#1a1915',
  hatch: 'rgba(26,25,21,0.10)',
  accent: '#21808d',
  accentSoft: '#cfe6e9',
  warn: '#b56700',
  warnSoft: '#fce8c4',
  danger: '#b91c1c',
  dangerSoft: '#fbdada',
  ok: '#15803d',
  okSoft: '#cdeacf',
  brand: '#da7756',
};

const WF_DARK = {
  bg: '#1a1915',
  surface: '#242220',
  raised: '#2e2b28',
  ink: '#ece6d8',
  ink2: '#c6bfb0',
  ink3: '#8b8680',
  ink4: '#5c5955',
  rule: '#ece6d8',
  hatch: 'rgba(236,230,216,0.10)',
  accent: '#3eb8c4',
  accentSoft: '#1b3d44',
  warn: '#f59e0b',
  warnSoft: '#3a2a0d',
  danger: '#ef4444',
  dangerSoft: '#3a1414',
  ok: '#22c55e',
  okSoft: '#0f3a1d',
  brand: '#e89272',
};

const wfPalette = (dark) => (dark ? WF_DARK : WF_LIGHT);

// Inject shared CSS once
if (typeof document !== 'undefined' && !document.getElementById('wf-styles')) {
  const link1 = document.createElement('link');
  link1.rel = 'stylesheet';
  link1.href =
    'https://fonts.googleapis.com/css2?family=Patrick+Hand&family=Architects+Daughter&family=Caveat:wght@500;600;700&family=Kalam:wght@300;400;700&display=swap';
  document.head.appendChild(link1);

  const s = document.createElement('style');
  s.id = 'wf-styles';
  s.textContent = `
    .wf-hand { font-family: 'Patrick Hand', 'Architects Daughter', cursive; letter-spacing: 0.2px; }
    .wf-script { font-family: 'Caveat', cursive; letter-spacing: 0.3px; }
    .wf-arch { font-family: 'Architects Daughter', cursive; letter-spacing: 0.1px; }
    .wf-body { font-family: 'Patrick Hand', system-ui, sans-serif; }
    .wf-mono { font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace; }
    .wf-stamp { font-family: 'Architects Daughter', cursive; letter-spacing: 1px; text-transform: uppercase; }

    .wf-hatch-l { background-image: repeating-linear-gradient(135deg, rgba(26,25,21,0.10) 0 1.5px, transparent 1.5px 7px); }
    .wf-hatch-d { background-image: repeating-linear-gradient(135deg, rgba(236,230,216,0.10) 0 1.5px, transparent 1.5px 7px); }
    .wf-dotgrid-l { background-image: radial-gradient(rgba(26,25,21,0.20) 1px, transparent 1px); background-size: 14px 14px; }
    .wf-dotgrid-d { background-image: radial-gradient(rgba(236,230,216,0.18) 1px, transparent 1px); background-size: 14px 14px; }

    .wf-rot1 { transform: rotate(-0.35deg); }
    .wf-rot2 { transform: rotate(0.45deg); }
    .wf-rot3 { transform: rotate(-0.6deg); }

    /* placeholder X for image boxes */
    .wf-x::before, .wf-x::after {
      content: ''; position: absolute; left: 4%; right: 4%; top: 50%;
      height: 1.5px; background: currentColor; opacity: .55;
    }
    .wf-x::before { transform: rotate(8deg); transform-origin: center; }
    .wf-x::after { transform: rotate(-8deg); transform-origin: center; }

    .wf-scroll::-webkit-scrollbar { display: none; }
    .wf-scroll { scrollbar-width: none; }
  `;
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────────
// Sketchy primitives
// ─────────────────────────────────────────────────────────────

function WireBox({
  dark,
  w,
  h,
  children,
  style,
  rounded = 10,
  dashed,
  fill,
  hatch,
  rotate = 0,
  label,
  labelPos = 'tl',
  placeholder,
}) {
  const p = wfPalette(dark);
  const borderStyle = dashed ? `dashed` : `solid`;
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: rounded,
        border: `1.5px ${borderStyle} ${p.rule}`,
        background:
          fill === 'surface' ? p.surface : fill === 'raised' ? p.raised : fill || 'transparent',
        position: 'relative',
        transform: rotate ? `rotate(${rotate}deg)` : undefined,
        color: p.ink,
        boxSizing: 'border-box',
        ...style,
      }}
      className={hatch ? (dark ? 'wf-hatch-d' : 'wf-hatch-l') : ''}
    >
      {placeholder && (
        <div
          className={dark ? 'wf-hatch-d' : 'wf-hatch-l'}
          style={{ position: 'absolute', inset: 0, borderRadius: rounded - 1, opacity: 0.8 }}
        />
      )}
      {label && (
        <div
          className="wf-arch"
          style={{
            position: 'absolute',
            top: labelPos.includes('t') ? 6 : undefined,
            bottom: labelPos.includes('b') ? 6 : undefined,
            left: labelPos.includes('l') ? 8 : undefined,
            right: labelPos.includes('r') ? 8 : undefined,
            fontSize: 10,
            color: p.ink3,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

// A line of "text" — just a gray rectangle bar, varying widths to feel real
function WireLine({ dark, w = '100%', h = 7, mt = 0, mb = 0, opacity = 1, rounded = 4 }) {
  const p = wfPalette(dark);
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: rounded,
        background: p.ink2,
        opacity: opacity * 0.55,
        marginTop: mt,
        marginBottom: mb,
      }}
    />
  );
}

// Multi-line paragraph placeholder
function WireParagraph({ dark, lines = 3, lineH = 7, gap = 6, widths }) {
  const ws =
    widths ||
    Array.from({ length: lines }, (_, i) => (i === lines - 1 ? '60%' : `${85 + ((i * 13) % 12)}%`));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {ws.map((w, i) => (
        <WireLine key={i} dark={dark} w={w} h={lineH} />
      ))}
    </div>
  );
}

function WireText({
  children,
  dark,
  size = 14,
  weight = 400,
  mono,
  hand,
  italic,
  color,
  style,
  className,
}) {
  const p = wfPalette(dark);
  const cls = mono ? 'wf-mono' : hand ? 'wf-hand' : 'wf-body';
  return (
    <span
      className={`${cls} ${className || ''}`}
      style={{
        fontSize: size,
        fontWeight: weight,
        color: color || p.ink,
        fontStyle: italic ? 'italic' : undefined,
        lineHeight: 1.25,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// Sketchy button
function WireButton({ dark, children, variant = 'outline', size = 'md', w, h, icon, style }) {
  const p = wfPalette(dark);
  const heights = { sm: 28, md: 36, lg: 44, xl: 52 };
  const px = size === 'sm' ? 10 : size === 'lg' ? 18 : size === 'xl' ? 22 : 14;
  const bg =
    variant === 'fill'
      ? p.ink
      : variant === 'accent'
        ? p.accent
        : variant === 'danger'
          ? p.danger
          : variant === 'soft'
            ? dark
              ? p.raised
              : '#fff'
            : 'transparent';
  const color =
    variant === 'fill' ? p.bg : variant === 'accent' || variant === 'danger' ? '#fff' : p.ink;
  return (
    <div
      style={{
        height: h || heights[size],
        padding: `0 ${px}px`,
        width: w,
        borderRadius: heights[size] / 2,
        border:
          variant === 'accent' || variant === 'fill' || variant === 'danger'
            ? `1.5px solid ${bg}`
            : `1.5px solid ${p.rule}`,
        background: bg,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        ...style,
      }}
    >
      {icon}
      <span className="wf-hand" style={{ fontSize: size === 'sm' ? 12 : size === 'lg' ? 17 : 15 }}>
        {children}
      </span>
    </div>
  );
}

// Sketchy chip/pill (smaller than button)
function WireChip({ dark, children, active, fill, icon, style }) {
  const p = wfPalette(dark);
  return (
    <div
      style={{
        height: 26,
        padding: '0 9px',
        borderRadius: 13,
        border: `1.2px solid ${active ? p.ink : p.ink3}`,
        background: active ? (dark ? p.ink2 : p.ink) : fill || 'transparent',
        color: active ? p.bg : p.ink,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        ...style,
      }}
    >
      {icon}
      <span className="wf-hand" style={{ fontSize: 12 }}>
        {children}
      </span>
    </div>
  );
}

// Circle avatar placeholder
function WireAvatar({ dark, size = 32, label, fill }) {
  const p = wfPalette(dark);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        border: `1.5px solid ${p.rule}`,
        background: fill || (dark ? p.raised : '#fff'),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span className="wf-hand" style={{ fontSize: size * 0.42, color: p.ink }}>
        {label || '?'}
      </span>
    </div>
  );
}

// Square placeholder "icon" — just a small box with letter or simple glyph
function WireIcon({ dark, size = 22, glyph, fill, rounded = 5, stroke = 1.4 }) {
  const p = wfPalette(dark);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: rounded,
        border: `${stroke}px solid ${p.ink}`,
        background: fill || 'transparent',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span className="wf-arch" style={{ fontSize: size * 0.5, color: p.ink, lineHeight: 1 }}>
        {glyph || ''}
      </span>
    </div>
  );
}

// Simple stroked SVG glyph — for icons that need to look more icon-y than letter-y
function WireGlyph({ dark, size = 22, kind = 'box' }) {
  const p = wfPalette(dark);
  const s = (stroke) => ({
    stroke: p.ink,
    strokeWidth: stroke || 1.6,
    fill: 'none',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  });
  const paths = {
    menu: (
      <g {...s()}>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </g>
    ),
    plus: (
      <g {...s()}>
        <path d="M12 5v14M5 12h14" />
      </g>
    ),
    send: (
      <g {...s()}>
        <path d="M5 12l14-7-5 7 5 7z" />
      </g>
    ),
    mic: (
      <g {...s()}>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0014 0M12 18v3" />
      </g>
    ),
    chev: (
      <g {...s()}>
        <path d="M9 6l6 6-6 6" />
      </g>
    ),
    chevd: (
      <g {...s()}>
        <path d="M6 9l6 6 6-6" />
      </g>
    ),
    chevu: (
      <g {...s()}>
        <path d="M6 15l6-6 6 6" />
      </g>
    ),
    chevl: (
      <g {...s()}>
        <path d="M15 6l-6 6 6 6" />
      </g>
    ),
    x: (
      <g {...s()}>
        <path d="M6 6l12 12M18 6L6 18" />
      </g>
    ),
    check: (
      <g {...s()}>
        <path d="M5 12l5 5L20 6" />
      </g>
    ),
    search: (
      <g {...s()}>
        <circle cx="11" cy="11" r="6" />
        <path d="M16 16l4 4" />
      </g>
    ),
    settings: (
      <g {...s()}>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M4 12H2M22 12h-2M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
      </g>
    ),
    user: (
      <g {...s()}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
      </g>
    ),
    chat: (
      <g {...s()}>
        <path d="M4 5h16v11H8l-4 4z" />
      </g>
    ),
    bolt: (
      <g {...s()}>
        <path d="M13 3L5 13h5l-1 8 8-10h-5z" />
      </g>
    ),
    folder: (
      <g {...s()}>
        <path d="M3 6h6l2 2h10v11H3z" />
      </g>
    ),
    play: (
      <g {...s()}>
        <path d="M6 4l14 8-14 8z" />
      </g>
    ),
    pause: (
      <g {...s()}>
        <rect x="6" y="4" width="4" height="16" />
        <rect x="14" y="4" width="4" height="16" />
      </g>
    ),
    cam: (
      <g {...s()}>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <circle cx="12" cy="13" r="4" />
        <path d="M8 7l2-3h4l2 3" />
      </g>
    ),
    img: (
      <g {...s()}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="11" r="2" />
        <path d="M3 17l5-5 5 5 3-3 5 5" />
      </g>
    ),
    file: (
      <g {...s()}>
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M15 3v4h4" />
      </g>
    ),
    github: (
      <g {...s()}>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 21v-3M15 21v-3M9 18s0-2 3-2 3 2 3 2" />
      </g>
    ),
    plug: (
      <g {...s()}>
        <path d="M9 3v6M15 3v6M6 9h12v2a6 6 0 01-12 0z" />
        <path d="M12 17v4" />
      </g>
    ),
    skill: (
      <g {...s()}>
        <path d="M12 3l2.5 5 5.5.8-4 4 1 5.5L12 16l-5 2.3 1-5.5-4-4 5.5-.8z" />
      </g>
    ),
    folder2: (
      <g {...s()}>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
      </g>
    ),
    arrow: (
      <g {...s()}>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </g>
    ),
    bell: (
      <g {...s()}>
        <path d="M6 16V11a6 6 0 1112 0v5l2 3H4z" />
        <path d="M10 21h4" />
      </g>
    ),
    lock: (
      <g {...s()}>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 018 0v3" />
      </g>
    ),
    eye: (
      <g {...s()}>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </g>
    ),
    globe: (
      <g {...s()}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
      </g>
    ),
    sliders: (
      <g {...s()}>
        <path d="M4 7h16M4 12h16M4 17h16" />
        <circle cx="9" cy="7" r="2" fill={p.bg} />
        <circle cx="15" cy="12" r="2" fill={p.bg} />
        <circle cx="7" cy="17" r="2" fill={p.bg} />
      </g>
    ),
    pen: (
      <g {...s()}>
        <path d="M14 4l6 6-12 12H2v-6z" />
      </g>
    ),
    trash: (
      <g {...s()}>
        <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" />
      </g>
    ),
    star: (
      <g {...s()}>
        <path d="M12 3l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
      </g>
    ),
    code: (
      <g {...s()}>
        <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />
      </g>
    ),
    pencil: (
      <g {...s()}>
        <path d="M14 4l6 6-10 10H4v-6z" />
      </g>
    ),
    book: (
      <g {...s()}>
        <path d="M4 5a2 2 0 012-2h6v18H6a2 2 0 01-2-2zM20 5a2 2 0 00-2-2h-6v18h6a2 2 0 002-2z" />
      </g>
    ),
    spark: (
      <g {...s()}>
        <path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M6 18l3-3M15 9l3-3" />
      </g>
    ),
    cloud: (
      <g {...s()}>
        <path d="M7 18a4 4 0 010-8 6 6 0 0111-2 4 4 0 011 8z" />
      </g>
    ),
    cpu: (
      <g {...s()}>
        <rect x="5" y="5" width="14" height="14" rx="2" />
        <rect x="9" y="9" width="6" height="6" />
        <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
      </g>
    ),
    refresh: (
      <g {...s()}>
        <path d="M3 12a9 9 0 0115-6l3-3v6h-6" />
        <path d="M21 12a9 9 0 01-15 6l-3 3v-6h6" />
      </g>
    ),
    heart: (
      <g {...s()}>
        <path d="M12 21s-8-5-8-12a4 4 0 018-1 4 4 0 018 1c0 7-8 12-8 12z" />
      </g>
    ),
    flag: (
      <g {...s()}>
        <path d="M5 21V4l10 2-2 4 2 4H5" />
      </g>
    ),
    pin: (
      <g {...s()}>
        <path d="M12 21v-6M8 4h8l-1 5 4 4H5l4-4z" />
      </g>
    ),
    quote: (
      <g {...s()}>
        <path d="M6 17V11a3 3 0 013-3M14 17v-6a3 3 0 013-3" />
      </g>
    ),
    waveform: (
      <g {...s()}>
        <path d="M4 12h2v0M8 8v8M12 4v16M16 8v8M20 12h0" />
      </g>
    ),
    download: (
      <g {...s()}>
        <path d="M12 4v12M6 12l6 6 6-6M4 20h16" />
      </g>
    ),
    health: (
      <g {...s()}>
        <path d="M3 12h4l2-5 4 10 2-5h6" />
      </g>
    ),
    calendar: (
      <g {...s()}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </g>
    ),
    drive: (
      <g {...s()}>
        <path d="M9 3l-6 11h6m0-11h6l6 11h-6m-6-11l6 11m-6 0l-3 6h12l-3-6" />
      </g>
    ),
    info: (
      <g {...s()}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v0M12 11v6" />
      </g>
    ),
    alert: (
      <g {...s()}>
        <path d="M12 3l10 18H2z" />
        <path d="M12 10v5M12 18v0" />
      </g>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      {paths[kind] || paths.box}
    </svg>
  );
}

// "Drawn" SVG rectangle — slightly imperfect for accent moments
function WireSketchRect({ dark, w, h, rounded = 12, stroke = 1.5, dashed }) {
  const p = wfPalette(dark);
  const sw = stroke;
  const r = rounded;
  // path with intentional jitter
  const d = `M ${r + 1} 2 L ${w - r - 1} 1.5 Q ${w - 1.5} 1.5 ${w - 1.5} ${r} L ${w - 2} ${h - r - 1} Q ${w - 1.5} ${h - 1.5} ${w - r - 1} ${h - 1.5} L ${r + 1} ${h - 2} Q 1.5 ${h - 1.5} 1.5 ${h - r - 1} L 2 ${r + 1} Q 1.5 1.5 ${r + 1} 1.5 Z`;
  return (
    <svg width={w} height={h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <path
        d={d}
        stroke={p.rule}
        strokeWidth={sw}
        fill="none"
        strokeDasharray={dashed ? '4 3' : undefined}
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Phone shell (sketchy iPhone bezel)
// ─────────────────────────────────────────────────────────────

function WirePhone({
  dark,
  children,
  statusBar = true,
  homeIndicator = true,
  label,
  w = 430,
  h = 932,
}) {
  const p = wfPalette(dark);
  return (
    <div
      style={{
        width: w,
        height: h,
        position: 'relative',
        background: p.bg,
        color: p.ink,
        borderRadius: 56,
        border: `2px solid ${p.rule}`,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* dynamic island */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 124,
          height: 36,
          borderRadius: 18,
          background: p.ink,
          zIndex: 50,
        }}
      />
      {statusBar && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 60,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 32px 0',
          }}
        >
          <span className="wf-hand" style={{ fontSize: 16, fontWeight: 600 }}>
            9:41
          </span>
          <span className="wf-hand" style={{ fontSize: 12, color: p.ink3 }}>
            ••• ▴ ▮▮▮
          </span>
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          top: 60,
          bottom: homeIndicator ? 36 : 0,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
        className="wf-scroll"
      >
        {children}
      </div>
      {homeIndicator && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 144,
            height: 5,
            borderRadius: 3,
            background: p.ink,
            opacity: 0.85,
            zIndex: 50,
          }}
        />
      )}
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

// Sketchy top bar (hamburger + title + actions)
function WireTopBar({ dark, left = 'menu', title, right, sub }) {
  const p = wfPalette(dark);
  return (
    <div
      style={{
        height: 52,
        padding: '0 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderBottom: `1px dashed ${p.ink4}`,
        flexShrink: 0,
      }}
    >
      {left === 'menu' ? (
        <WireGlyph dark={dark} kind="menu" size={24} />
      ) : left === 'back' ? (
        <WireGlyph dark={dark} kind="chevl" size={24} />
      ) : left === 'x' ? (
        <WireGlyph dark={dark} kind="x" size={22} />
      ) : (
        left
      )}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <WireText dark={dark} hand size={17} weight={600}>
          {title}
        </WireText>
        {sub && (
          <WireText dark={dark} size={11} color={p.ink3} hand>
            {sub}
          </WireText>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{right}</div>
    </div>
  );
}

// Composer at the bottom — model pill, plus, mic
function WireComposer({
  dark,
  placeholder = 'Ask anything…',
  model = 'Sonnet 4.6',
  hasText,
  chips,
  withMic = true,
}) {
  const p = wfPalette(dark);
  return (
    <div
      style={{
        padding: '10px 14px 14px',
        flexShrink: 0,
        borderTop: `1px dashed ${p.ink4}`,
        background: p.bg,
      }}
    >
      {chips}
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
        <div style={{ flex: 1, paddingTop: 4 }}>
          {hasText ? (
            <WireText dark={dark} size={14}>
              {hasText}
            </WireText>
          ) : (
            <WireText dark={dark} size={14} color={p.ink3} italic>
              {placeholder}
            </WireText>
          )}
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            borderRadius: 16,
            border: `1.2px solid ${p.ink3}`,
          }}
        >
          <WireText dark={dark} hand size={12}>
            {model}
          </WireText>
          <WireGlyph dark={dark} kind="chevd" size={12} />
        </div>
        {withMic && <WireGlyph dark={dark} kind={hasText ? 'send' : 'mic'} size={22} />}
      </div>
    </div>
  );
}

// Chat bubble
function WireBubble({ dark, role = 'user', children, w = '78%' }) {
  const p = wfPalette(dark);
  if (role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 14px' }}>
        <div
          style={{
            maxWidth: w,
            padding: '10px 14px',
            borderRadius: 16,
            background: dark ? '#3b2b25' : '#f3dccd',
            border: `1.2px solid ${dark ? '#664a3f' : '#d9b59a'}`,
          }}
        >
          {children}
        </div>
      </div>
    );
  }
  return (
    <div style={{ padding: '6px 14px' }}>
      <div style={{ maxWidth: '94%' }}>{children}</div>
    </div>
  );
}

// Provenance chip (lock #8) — v2: tok/s + first-token-latency, no cost
function WireProvenance({
  dark,
  model = 'Llama 3.2 3B',
  tier = 'Tier 2',
  tps = '22 t/s',
  ttft = '180ms',
}) {
  const p = wfPalette(dark);
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 9px',
        borderRadius: 12,
        border: `1px dashed ${p.ink3}`,
        background: 'transparent',
        marginTop: 6,
      }}
    >
      <span className="wf-arch" style={{ fontSize: 10, color: p.ink2 }}>
        ↳
      </span>
      <span className="wf-hand" style={{ fontSize: 11, color: p.ink2 }}>
        {model}
      </span>
      <span style={{ width: 3, height: 3, borderRadius: 2, background: p.ink3 }} />
      <span className="wf-hand" style={{ fontSize: 11, color: p.ink3 }}>
        on-device · {tier}
      </span>
      {tps && (
        <span className="wf-hand" style={{ fontSize: 11, color: p.ink3 }}>
          · {tps}
        </span>
      )}
      {ttft && (
        <span className="wf-hand" style={{ fontSize: 11, color: p.ink3 }}>
          · ttft {ttft}
        </span>
      )}
    </div>
  );
}

// Mode toggle for chat header — [On-device] active vs [Cloud · 🔒] locked
function WireModeToggle({ dark, cloudJoined = false }) {
  const p = wfPalette(dark);
  return (
    <div
      style={{
        display: 'flex',
        padding: 3,
        borderRadius: 18,
        background: dark ? p.raised : '#ebe6d8',
        gap: 0,
      }}
    >
      <div
        style={{
          padding: '5px 12px',
          borderRadius: 15,
          background: dark ? p.bg : '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        }}
      >
        <WireGlyph dark={dark} kind="cpu" size={13} />
        <span className="wf-hand" style={{ fontSize: 12, fontWeight: 600 }}>
          On-device
        </span>
      </div>
      <div
        style={{ padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 4, opacity: 0.6 }}
      >
        <span className="wf-hand" style={{ fontSize: 12, color: p.ink3 }}>
          {cloudJoined ? 'Cloud · ⏳' : 'Cloud'}
        </span>
        <WireGlyph dark={dark} kind="lock" size={11} />
      </div>
    </div>
  );
}

// Inline tool call bar (collapsible)
function WireToolCall({ dark, label = 'web_search', status = 'done', expanded }) {
  const p = wfPalette(dark);
  return (
    <div
      style={{
        borderRadius: 10,
        border: `1.2px solid ${p.ink4}`,
        background: dark ? p.surface : '#fbf8f1',
        margin: '6px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
        <WireGlyph dark={dark} kind="bolt" size={16} />
        <WireText dark={dark} mono size={12}>
          {label}
        </WireText>
        <span className="wf-hand" style={{ fontSize: 11, color: p.ink3 }}>
          · {status}
        </span>
        <div style={{ flex: 1 }} />
        <WireGlyph dark={dark} kind={expanded ? 'chevu' : 'chevd'} size={14} />
      </div>
      {expanded && (
        <div style={{ padding: '0 10px 10px', borderTop: `1px dashed ${p.ink4}` }}>
          <div
            style={{
              marginTop: 8,
              padding: 8,
              borderRadius: 6,
              background: dark ? '#11100d' : '#f6f4ec',
            }}
          >
            <WireParagraph dark={dark} lines={3} widths={['85%', '70%', '55%']} />
          </div>
        </div>
      )}
    </div>
  );
}

// List row
function WireListRow({ dark, leading, title, sub, trailing, divider = true, h = 56 }) {
  const p = wfPalette(dark);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 18px',
        minHeight: h,
        borderBottom: divider ? `1px dashed ${p.ink4}` : undefined,
      }}
    >
      {leading && <div>{leading}</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <div>
            <WireText dark={dark} hand size={15} weight={600}>
              {title}
            </WireText>
          </div>
        )}
        {sub && (
          <div style={{ marginTop: 2 }}>
            <WireText dark={dark} hand size={12} color={p.ink3}>
              {sub}
            </WireText>
          </div>
        )}
      </div>
      {trailing && <div>{trailing}</div>}
    </div>
  );
}

// Section header label inside a list
function WireSectionLabel({ dark, children, action }) {
  const p = wfPalette(dark);
  return (
    <div
      style={{
        padding: '14px 18px 6px',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
      }}
    >
      <span className="wf-stamp" style={{ fontSize: 10, color: p.ink3 }}>
        {children}
      </span>
      {action && (
        <span className="wf-hand" style={{ fontSize: 12, color: p.accent }}>
          {action}
        </span>
      )}
    </div>
  );
}

// Bottom sheet (anchored bottom of phone content area)
function WireSheet({ dark, h = 480, children, handle = true, style }) {
  const p = wfPalette(dark);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: h,
        borderTopLeftRadius: 26,
        borderTopRightRadius: 26,
        background: p.bg,
        color: p.ink,
        border: `1.5px solid ${p.rule}`,
        borderBottom: 'none',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.18)',
        zIndex: 40,
        padding: '10px 0 14px',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      {handle && (
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            background: p.ink3,
            margin: '4px auto 12px',
            opacity: 0.6,
          }}
        />
      )}
      <div style={{ flex: 1, overflowY: 'auto' }} className="wf-scroll">
        {children}
      </div>
    </div>
  );
}

// Banner above composer (cap warning, etc)
function WireBanner({ dark, kind = 'warn', children, action }) {
  const p = wfPalette(dark);
  const bg =
    kind === 'warn'
      ? p.warnSoft
      : kind === 'danger'
        ? p.dangerSoft
        : kind === 'ok'
          ? p.okSoft
          : p.accentSoft;
  const fg =
    kind === 'warn' ? p.warn : kind === 'danger' ? p.danger : kind === 'ok' ? p.ok : p.accent;
  return (
    <div
      style={{
        margin: '8px 14px 0',
        padding: '8px 12px',
        borderRadius: 10,
        background: bg,
        border: `1.2px dashed ${fg}`,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <WireGlyph
        dark={dark}
        kind={kind === 'warn' ? 'alert' : kind === 'danger' ? 'lock' : 'info'}
        size={16}
      />
      <div style={{ flex: 1 }}>
        <span className="wf-hand" style={{ fontSize: 12, color: fg }}>
          {children}
        </span>
      </div>
      {action && (
        <span className="wf-hand" style={{ fontSize: 12, color: fg, fontWeight: 600 }}>
          {action} →
        </span>
      )}
    </div>
  );
}

// Logo / brand mark (placeholder neutral geometric)
function WireBrand({ dark, size = 56 }) {
  const p = wfPalette(dark);
  return (
    <svg width={size} height={size} viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="22" fill="none" stroke={p.rule} strokeWidth="1.5" />
      <path
        d="M16 38 L28 14 L40 38"
        fill="none"
        stroke={p.rule}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M21 30 L35 30" fill="none" stroke={p.rule} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Page background helper
function WireBg({ dark, children, style }) {
  const p = wfPalette(dark);
  return (
    <div
      style={{
        flex: 1,
        background: p.bg,
        color: p.ink,
        overflow: 'auto',
        position: 'relative',
        ...style,
      }}
      className="wf-scroll"
    >
      {children}
    </div>
  );
}

// Drawer overlay
function WireDrawer({ dark, w = 320, children }) {
  const p = wfPalette(dark);
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 30 }} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: w,
          background: p.bg,
          borderRight: `1.5px solid ${p.rule}`,
          zIndex: 40,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </div>
    </>
  );
}

// Tab chip row (the 6 task chips)
function WireTaskChips({ dark, active }) {
  const p = wfPalette(dark);
  const items = ['Code', 'Write', 'Research', 'Image', 'Video', 'Computer'];
  return (
    <div
      style={{ display: 'flex', gap: 8, padding: '0 14px 8px', overflowX: 'auto' }}
      className="wf-scroll"
    >
      {items.map((it, i) => (
        <div
          key={i}
          style={{
            padding: '6px 12px',
            borderRadius: 18,
            border: `1.2px solid ${i === active ? p.ink : p.ink3}`,
            background: i === active ? (dark ? p.raised : '#fff') : 'transparent',
            whiteSpace: 'nowrap',
          }}
        >
          <span className="wf-hand" style={{ fontSize: 13 }}>
            {it}
          </span>
        </div>
      ))}
    </div>
  );
}

// "State stamp" — shows state name in red ink in corner
function WireStateStamp({ dark, children, color }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 14,
        zIndex: 60,
        padding: '3px 8px',
        borderRadius: 4,
        border: `1.5px solid ${color || '#b91c1c'}`,
        transform: 'rotate(-4deg)',
        background: 'rgba(255,255,255,0.5)',
      }}
    >
      <span
        className="wf-stamp"
        style={{ fontSize: 9, color: color || '#b91c1c', letterSpacing: 1.5 }}
      >
        {children}
      </span>
    </div>
  );
}

// "Card label" floating outside artboard
function WireScreenLabel({ dark, num, name, state }) {
  return (
    <div style={{ padding: '6px 0 0', display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span className="wf-stamp" style={{ fontSize: 10, color: dark ? '#a59f93' : '#5c5955' }}>
        {num}
      </span>
      <span
        className="wf-hand"
        style={{ fontSize: 13, color: dark ? '#e8e4db' : '#1a1915', fontWeight: 600 }}
      >
        {name}
      </span>
      {state && (
        <span className="wf-hand" style={{ fontSize: 11, color: dark ? '#8b8680' : '#8b8680' }}>
          · {state}
        </span>
      )}
    </div>
  );
}

Object.assign(window, {
  WF_LIGHT,
  WF_DARK,
  wfPalette,
  WireBox,
  WireLine,
  WireParagraph,
  WireText,
  WireButton,
  WireChip,
  WireAvatar,
  WireIcon,
  WireGlyph,
  WireSketchRect,
  WirePhone,
  WireTopBar,
  WireComposer,
  WireBubble,
  WireProvenance,
  WireModeToggle,
  WireToolCall,
  WireListRow,
  WireSectionLabel,
  WireSheet,
  WireBanner,
  WireBrand,
  WireBg,
  WireDrawer,
  WireTaskChips,
  WireStateStamp,
  WireScreenLabel,
});
