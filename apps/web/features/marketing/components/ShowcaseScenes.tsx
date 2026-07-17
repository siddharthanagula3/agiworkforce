/**
 * ShowcaseScenes · Linear-grade product windows for section visuals.
 *
 * Each scene is a code-rendered recreation of a REAL AGI flow, styled by
 * the agi-dw-* / agi-ap-* classes in globals.css. No bitmaps, no invented
 * features: the diff window mirrors `agi review` / VS Code diff review;
 * the approval panel mirrors the CLI's tool-approval overlay and its
 * Suggest / Auto-edit / Full-auto autonomy modes (per product screenshots
 * 2026-06-11). Strings stay faithful to the product.
 */

/* ── Code-review diff window ────────────────────────────────────────── */

type DiffRow = {
  n: number;
  kind?: 'del' | 'add';
  parts: { t: string; hl?: boolean }[];
};

const LEFT: DiffRow[] = [
  { n: 6, parts: [{ t: 'export const send = async () => {' }] },
  { n: 7, kind: 'del', parts: [{ t: '  const res = ' }, { t: 'await fetchAll()', hl: true }] },
  { n: 8, kind: 'del', parts: [{ t: '  ' }, { t: 'render(res)', hl: true }] },
  { n: 9, parts: [{ t: '  return res.status' }] },
  { n: 10, parts: [{ t: '}' }] },
];

const RIGHT: DiffRow[] = [
  { n: 6, parts: [{ t: 'export const send = async () => {' }] },
  { n: 7, kind: 'add', parts: [{ t: '  const res = ' }, { t: 'await fetchFirst()', hl: true }] },
  { n: 8, kind: 'add', parts: [{ t: '  ' }, { t: 'render(res, { stream: true })', hl: true }] },
  { n: 9, parts: [{ t: '  return res.status' }] },
  { n: 10, parts: [{ t: '}' }] },
];

function DiffPane({ rows }: { rows: DiffRow[] }) {
  return (
    <div className="agi-dw-pane">
      {rows.map((row) => (
        <p key={row.n} className={`agi-dw-line${row.kind ? ` agi-dw-line--${row.kind}` : ''}`}>
          <span className="agi-dw-num">{String(row.n).padStart(2, '0')}</span>
          {row.parts.map((part, i) => (
            <span key={i} className={part.hl ? 'agi-dw-hl' : undefined}>
              {part.t}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

export function DiffWindow() {
  return (
    <figure className="agi-dw" aria-label="AGI reviewing a code diff">
      <div className="agi-dw-chrome" aria-hidden="true">
        <span className="agi-dw-file">src/chat/send.ts</span>
        <span className="agi-dw-badge">agi review</span>
      </div>
      <div className="agi-dw-body" aria-hidden="true">
        <DiffPane rows={LEFT} />
        <DiffPane rows={RIGHT} />
      </div>
      <div className="agi-dw-foot" aria-hidden="true">
        <span>2 files · +14 −9</span>
        <span className="agi-dw-actions">
          <span className="agi-dw-allow">Approve</span>
          <span className="agi-dw-deny">Request changes</span>
        </span>
      </div>
    </figure>
  );
}

/* ── Tool-approval panel ────────────────────────────────────────────── */

export function ApprovalWindow() {
  return (
    <figure className="agi-ap" aria-label="AGI asking for tool approval">
      <div className="agi-ap-chrome" aria-hidden="true">
        <span>Tool approval</span>
        <span className="agi-ap-sandbox">sandbox: seatbelt</span>
      </div>
      <div className="agi-ap-body" aria-hidden="true">
        <p className="agi-ap-ask">AGI wants to run a shell command:</p>
        <p className="agi-ap-cmd">
          <span className="agi-ap-prompt">$</span> git commit -m &ldquo;fix: stream first
          response&rdquo;
        </p>
        <div className="agi-ap-actions">
          <span className="agi-ap-btn agi-ap-btn--allow">Allow once</span>
          <span className="agi-ap-btn">Always allow</span>
          <span className="agi-ap-btn agi-ap-btn--deny">Deny</span>
        </div>
      </div>
      <div className="agi-ap-foot" aria-hidden="true">
        <span className="agi-ap-mode agi-ap-mode--active">Suggest</span>
        <span className="agi-ap-mode">Auto-edit</span>
        <span className="agi-ap-mode">Full-auto</span>
        <span className="agi-ap-hint">Shift+Tab cycles autonomy</span>
      </div>
    </figure>
  );
}
