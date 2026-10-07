import { Download, FileText, FolderClosed, Pencil, Trash2 } from 'lucide-react';
import { APPROVAL, ARTIFACT, CLOUD_RECEIPT, MEMORY, RESEARCH, TURN } from './content';
import { Answer, Composer, ICON_SIZE, ICON_STROKE, Prompt, Receipt, ToolRow } from './Window';

const SMALL_ICON = 14;

export function ResearchScene() {
  return (
    <>
      <div className="f1-thread">
        <Prompt>{RESEARCH.prompt}</Prompt>
        <ToolRow>{RESEARCH.activity}</ToolRow>
        <div className="f1-answer">
          <div className="f1-answer-block">
            <p className="f1-answer-h">{RESEARCH.heading}</p>
            <div className="f1-table">
              {RESEARCH.columns.map((column) => (
                <span key={column} className="f1-table-h">
                  {column}
                </span>
              ))}
              {RESEARCH.rows.map((row) =>
                row.map((cell, index) => <span key={`${row[0]}-${index}`}>{cell}</span>),
              )}
            </div>
          </div>
          <div className="f1-sources">
            <span className="f1-sources-label">{RESEARCH.sourcesLabel}</span>
            {RESEARCH.sources.map((source, index) => (
              <span key={source} className="f1-source">
                <span className="f1-source-n">{index + 1}</span>
                {source}
              </span>
            ))}
          </div>
        </div>
        <Receipt segments={TURN.receipt} />
      </div>
      <Composer placeholder={TURN.placeholder} picker={TURN.picker} />
    </>
  );
}

export function ArtifactScene() {
  return (
    <>
      <div className="f1-thread">
        <Prompt>{ARTIFACT.prompt}</Prompt>
        <div className="f1-doc">
          <div className="f1-doc-bar">
            <FileText size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
            {ARTIFACT.title}
            <span className="f1-tag">{ARTIFACT.version}</span>
            <span className="f1-doc-actions">
              <span className="f1-mini-btn">{ARTIFACT.actions[0]}</span>
              <span className="f1-mini-btn">
                <Download size={SMALL_ICON} strokeWidth={ICON_STROKE} aria-hidden="true" />
                {ARTIFACT.actions[1]}
              </span>
            </span>
          </div>
          <div className="f1-doc-body">
            <Answer sections={ARTIFACT.sections} />
          </div>
        </div>
        <Receipt segments={CLOUD_RECEIPT} />
      </div>
      <Composer placeholder={TURN.placeholder} picker={TURN.picker} />
    </>
  );
}

export function MemoryScene() {
  return (
    <div className="f1-thread">
      <p className="f1-project">
        <FolderClosed size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
        {MEMORY.project}
        <span className="f1-project-meta">{MEMORY.projectMeta}</span>
      </p>
      <div className="f1-answer-block">
        <p className="f1-answer-h">{MEMORY.heading}</p>
        <p className="f1-answer-row">{MEMORY.lede}</p>
      </div>
      <ul className="f1-facts-list">
        {MEMORY.facts.map(([fact, source]) => (
          <li key={fact} className="f1-fact-row">
            <span className="f1-fact-text">{fact}</span>
            <span className="f1-fact-source">{source}</span>
            <span className="f1-fact-actions">
              <span className="f1-mini-btn">
                <Pencil size={SMALL_ICON} strokeWidth={ICON_STROKE} aria-hidden="true" />
                {MEMORY.actions[0]}
              </span>
              <span className="f1-mini-btn">
                <Trash2 size={SMALL_ICON} strokeWidth={ICON_STROKE} aria-hidden="true" />
                {MEMORY.actions[1]}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="f1-answer-block">
        <p className="f1-answer-h">{MEMORY.sourcesHeading}</p>
        <div className="f1-toggles">
          {MEMORY.sources.map(([source, on]) => (
            <p key={source} className="f1-toggle">
              <span className="f1-switch" data-on={on ? 'true' : 'false'}>
                <i />
              </span>
              {source}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ApprovalScene() {
  return (
    <>
      <div className="f1-thread">
        <Prompt>{APPROVAL.prompt}</Prompt>
        {APPROVAL.reads.map((read) => (
          <ToolRow key={read}>{read}</ToolRow>
        ))}
        <div className="f1-code">
          <span className="f1-code-file">{APPROVAL.file}</span>
          {APPROVAL.diff.map(([kind, line]) => (
            <span key={line} className="f1-code-line" data-kind={kind}>
              <span className="f1-code-sign">{kind === 'add' ? '+' : '−'}</span>
              {line}
            </span>
          ))}
        </div>
        <div className="f1-approval">
          <p className="f1-approval-ask">{APPROVAL.ask}</p>
          <p className="f1-approval-cmd">
            <span className="f1-prompt-sign">$</span>
            {APPROVAL.command}
          </p>
          <p className="f1-approval-actions">
            {APPROVAL.buttons.map((label, index) => (
              <span
                key={label}
                className="f1-mini-btn"
                data-kind={index === 0 ? 'primary' : undefined}
              >
                {label}
              </span>
            ))}
          </p>
        </div>
        <Receipt segments={CLOUD_RECEIPT} />
      </div>
      <Composer placeholder={TURN.placeholder} picker={TURN.picker} />
    </>
  );
}
