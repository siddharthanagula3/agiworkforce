import {
  Bot,
  Files,
  FolderCheck,
  GitBranch,
  Menu,
  MonitorCog,
  Search,
  SquarePen,
  Wifi,
} from 'lucide-react';
import { AgiMark } from '@shared/components/agi/AgiMark';
import {
  BYOK_RECEIPT,
  CHROME_SCENE,
  CLOUD_RECEIPT,
  DESKTOP_SCENE,
  EDITOR_SCENE,
  ILLUSTRATION_LABEL,
  LOCAL_RECEIPT,
  PHONE_SCENE,
  TERMINAL_SCENE,
  TURN,
} from './content';
import {
  Answer,
  Composer,
  ICON_SIZE,
  ICON_STROKE,
  Prompt,
  Receipt,
  ToolRow,
  Window,
} from './Window';

const BRAND_MARK_SIZE = 18;
const PANEL_MARK_SIZE = 16;
const PHONE_ICON = 18;
const SKELETON_WIDTHS = ['94%', '88%', '97%', '82%', '91%'] as const;
const SELECTED_WIDTHS = ['93%', '85%', '79%'] as const;

function Lights({ title }: { title?: string }) {
  return (
    <div className="f1-win-bar" aria-hidden="true">
      <span className="f1-win-dots">
        <i />
        <i />
        <i />
      </span>
      {title ? <span className="f1-dev-title">{title}</span> : null}
      <span className="f1-win-bar-end">
        <span>{ILLUSTRATION_LABEL}</span>
      </span>
    </div>
  );
}

export function WebDevice() {
  return (
    <Window url={TURN.url} label="AGI Web" size="mini" recent="Contract summary">
      <div className="f1-thread">
        <Prompt file={TURN.file}>{TURN.prompt}</Prompt>
        <ToolRow>{TURN.activity}</ToolRow>
        <Answer sections={[TURN.answer[1]]} />
        <Receipt segments={TURN.receipt} />
      </div>
    </Window>
  );
}

export function DesktopDevice() {
  return (
    <figure className="f1-dev" data-illustration aria-label="AGI Desktop">
      <Lights title={DESKTOP_SCENE.title} />
      <div className="f1-desk-body" aria-hidden="true">
        <div className="f1-desk-side">
          <p className="f1-side-brand">
            <AgiMark size={BRAND_MARK_SIZE} />
            AGI
          </p>
          <p className="f1-side-item">
            <SquarePen size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
            New chat
          </p>
          <p className="f1-side-group">{DESKTOP_SCENE.foldersLabel}</p>
          {DESKTOP_SCENE.folders.map((folder) => (
            <p key={folder} className="f1-side-item" data-on="true">
              <FolderCheck size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
              {folder}
            </p>
          ))}
          <p className="f1-side-item">
            <MonitorCog size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
            {DESKTOP_SCENE.computerUse}
          </p>
        </div>
        <div className="f1-pane">
          <div className="f1-thread">
            <Prompt>{DESKTOP_SCENE.prompt}</Prompt>
            {DESKTOP_SCENE.tools.map((tool) => (
              <ToolRow key={tool}>{tool}</ToolRow>
            ))}
            <p className="f1-answer-row">{DESKTOP_SCENE.answer}</p>
            <div className="f1-approval">
              <p className="f1-approval-ask">{DESKTOP_SCENE.approvalHead}</p>
              <p className="f1-approval-cmd">{DESKTOP_SCENE.approvalBody}</p>
              <p className="f1-approval-actions">
                {DESKTOP_SCENE.buttons.map((label, index) => (
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
        </div>
      </div>
    </figure>
  );
}

export function TerminalDevice() {
  return (
    <figure className="f1-dev f1-term" data-illustration aria-label="AGI CLI">
      <Lights title={TERMINAL_SCENE.title} />
      <div className="f1-term-body" aria-hidden="true">
        {TERMINAL_SCENE.lines.map((line) => (
          <p key={line.text} className="f1-term-line" data-kind={line.kind}>
            {line.text}
          </p>
        ))}
      </div>
    </figure>
  );
}

export function PhoneDevice() {
  return (
    <figure className="f1-dev f1-phone" data-illustration aria-label="AGI Mobile">
      <div aria-hidden="true">
        <div className="f1-phone-status">
          <span>{PHONE_SCENE.time}</span>
          <Wifi size={PHONE_ICON} strokeWidth={ICON_STROKE} aria-hidden="true" />
        </div>
        <div className="f1-phone-nav">
          <Menu size={PHONE_ICON} strokeWidth={ICON_STROKE} aria-hidden="true" />
          <span>{PHONE_SCENE.name}</span>
          <SquarePen size={PHONE_ICON} strokeWidth={ICON_STROKE} aria-hidden="true" />
        </div>
        <div className="f1-phone-modes">
          {PHONE_SCENE.modes.map((mode, index) => (
            <span key={mode} data-on={index === 0 ? 'true' : 'false'}>
              {mode}
            </span>
          ))}
        </div>
        <div className="f1-thread">
          <Prompt>{PHONE_SCENE.prompt}</Prompt>
          <ToolRow>{PHONE_SCENE.tool}</ToolRow>
          <p className="f1-answer-row">{PHONE_SCENE.answer}</p>
          <Receipt segments={LOCAL_RECEIPT} />
        </div>
        <Composer placeholder={PHONE_SCENE.placeholder} attach={false} />
      </div>
    </figure>
  );
}

export function EditorDevice() {
  return (
    <figure className="f1-dev" data-illustration aria-label="AGI in VS Code">
      <Lights title={EDITOR_SCENE.title} />
      <div className="f1-editor-body" aria-hidden="true">
        <div className="f1-editor-activity">
          <Files size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
          <Search size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
          <GitBranch size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
          <Bot size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" data-on="true" />
        </div>
        <div className="f1-editor-code">
          {EDITOR_SCENE.lines.map(([n, code]) => (
            <span
              key={n}
              className="f1-code-line"
              data-kind={EDITOR_SCENE.changed.some((changed) => changed === n) ? 'add' : undefined}
            >
              <span className="f1-code-n">{n}</span>
              {code}
            </span>
          ))}
        </div>
        <div className="f1-editor-panel">
          <p className="f1-editor-head">
            <AgiMark size={PANEL_MARK_SIZE} />
            AGI
            <span className="f1-tag">{EDITOR_SCENE.mention}</span>
          </p>
          <Prompt>
            {EDITOR_SCENE.mention} {EDITOR_SCENE.prompt}
          </Prompt>
          <p className="f1-answer-row">{EDITOR_SCENE.answer}</p>
          <p className="f1-approval-actions">
            {EDITOR_SCENE.buttons.map((label, index) => (
              <span
                key={label}
                className="f1-mini-btn"
                data-kind={index === 0 ? 'primary' : undefined}
              >
                {label}
              </span>
            ))}
          </p>
          <Receipt segments={BYOK_RECEIPT} />
        </div>
      </div>
    </figure>
  );
}

export function ChromeDevice() {
  return (
    <figure className="f1-dev" data-illustration aria-label="AGI in Chrome">
      <div aria-hidden="true">
        <div className="f1-chrome-tabs">
          <span className="f1-win-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="f1-chrome-tab">{CHROME_SCENE.tab}</span>
          <span className="f1-win-bar-end">
            <span>{ILLUSTRATION_LABEL}</span>
          </span>
        </div>
        <div className="f1-chrome-address">
          <span className="f1-chrome-url">{CHROME_SCENE.url}</span>
          <AgiMark size={PANEL_MARK_SIZE} />
        </div>
        <div className="f1-chrome-body">
          <div className="f1-chrome-page">
            <p className="f1-chrome-doc-title">{CHROME_SCENE.docTitle}</p>
            {SKELETON_WIDTHS.map((width) => (
              <span key={width} className="f1-skeleton" style={{ width }} />
            ))}
            {SELECTED_WIDTHS.map((width) => (
              <span key={width} className="f1-skeleton" data-sel="true" style={{ width }} />
            ))}
          </div>
          <div className="f1-chrome-panel">
            <p className="f1-editor-head">
              <AgiMark size={PANEL_MARK_SIZE} />
              {CHROME_SCENE.panelName}
            </p>
            <p className="f1-context">
              <span>{CHROME_SCENE.context}</span>
              <span>{CHROME_SCENE.contextMeta}</span>
            </p>
            <Prompt>{CHROME_SCENE.prompt}</Prompt>
            <p className="f1-answer-row">{CHROME_SCENE.answer}</p>
            <ul className="f1-risks">
              {CHROME_SCENE.risks.map(([risk, mark]) => (
                <li key={risk}>
                  <span>{risk}</span>
                  <span className="f1-mono">{mark}</span>
                </li>
              ))}
            </ul>
            <Receipt segments={CLOUD_RECEIPT} />
            <Composer placeholder={CHROME_SCENE.placeholder} attach={false} />
          </div>
        </div>
      </div>
    </figure>
  );
}
