import './showcase-mockup-responsive.css';

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

function DiffPane({ rows, label }: { rows: DiffRow[]; label: string }) {
  return (
    <div className="agi-dw-pane" role="region" aria-label={label} tabIndex={0}>
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
    <figure className="agi-dw agi-showcase-responsive" aria-label="AGI reviewing a code diff">
      <div className="agi-dw-chrome" aria-hidden="true">
        <span className="agi-dw-file">TypeScript example</span>
        <span className="agi-dw-badge">Authored example</span>
      </div>
      <div className="agi-dw-body">
        <DiffPane rows={LEFT} label="Before TypeScript example" />
        <DiffPane rows={RIGHT} label="After TypeScript example" />
      </div>
      <div className="agi-dw-foot" aria-hidden="true">
        <span>Illustrative diff</span>
        <span className="agi-dw-actions">
          <span className="agi-dw-allow">Approve</span>
          <span className="agi-dw-deny">Reject</span>
        </span>
      </div>
    </figure>
  );
}

export function ApprovalWindow() {
  return (
    <figure className="agi-ap agi-showcase-responsive" aria-label="AGI asking for tool approval">
      <div className="agi-ap-chrome" aria-hidden="true">
        <span>Tool Approval</span>
        <span className="agi-ap-sandbox">CLI example</span>
      </div>
      <div className="agi-ap-body">
        <p className="agi-ap-ask">Allow this command?</p>
        <p className="agi-ap-cmd" role="region" aria-label="Command example" tabIndex={0}>
          <span className="agi-ap-prompt">$</span> git commit -m &quot;fix: stream first
          response&quot;
        </p>
        <div className="agi-ap-actions">
          <span className="agi-ap-btn agi-ap-btn--allow">Yes</span>
          <span className="agi-ap-btn agi-ap-btn--deny">No</span>
          <span className="agi-ap-btn">Allow Session</span>
        </div>
      </div>
      <div className="agi-ap-foot" aria-hidden="true">
        <span className="agi-ap-mode agi-ap-mode--active">Default</span>
        <span className="agi-ap-hint">Left/Right selects · Enter confirms</span>
      </div>
    </figure>
  );
}
