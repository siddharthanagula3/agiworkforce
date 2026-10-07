import './work-scene-preview.css';
import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Clock3,
  Folder,
  Grid2x2Plus,
  LibraryBig,
  Loader2,
  Mic,
  Palette,
  PauseCircle,
  Play,
  Plus,
  Square,
} from 'lucide-react';
import {
  detectFileDiff,
  getToolDisplayLabel,
  TOOL_APPROVAL_ACTION_LABELS,
} from '@agiworkforce/types';
import { AGI_WORK_LABEL } from '@/features/chat/lib/agi-work';
import {
  EDIT_FILE_TOOL,
  EXECUTE_CODE_TOOL,
  LIST_FILES_TOOL,
  READ_FILE_TOOL,
  WRITE_FILE_TOOL,
} from '@/lib/e2b/execution-tools';
import { AgiMark } from '@/shared/components/agi/AgiMark';
import {
  AppComposer,
  AppSidebar,
  PREVIEW_GEOMETRY,
  PreviewRoot,
  TrafficLights,
} from './AppPreviews';

const WORK_SCENE_CLASS = 'agi-work';

function sceneClass(className?: string) {
  return [WORK_SCENE_CLASS, className].filter(Boolean).join(' ');
}

function WorkShell({
  scene,
  label,
  className,
  chats,
  composer,
  children,
}: {
  scene: string;
  label: string;
  className?: string;
  chats: readonly string[];
  composer: ReactNode;
  children: ReactNode;
}) {
  return (
    <PreviewRoot kind="web" scene={scene} label={label} className={sceneClass(className)}>
      <div className="agi-app-chrome">
        <TrafficLights />
        <span className="agi-app-url">agiworkforce.com/chat</span>
      </div>
      <div className="agi-app-shell">
        <AppSidebar chats={chats} />
        <div className="agi-app-main">
          <div className="agi-app-thread">{children}</div>
          {composer}
        </div>
      </div>
    </PreviewRoot>
  );
}

function WorkComposer() {
  return (
    <div className="agi-work-composer">
      <div className="agi-app-composer">
        <span className="agi-app-placeholder">Follow up</span>
        <div className="agi-app-composer-row">
          <Plus className="agi-app-icon agi-app-icon--lg" />
          <span className="agi-app-seg">
            <span>Chat</span>
            <span data-on="true">{AGI_WORK_LABEL}</span>
          </span>
          <span className="agi-app-style agi-app-end">
            <Palette className="agi-app-icon" />
            Style
          </span>
          <span className="agi-app-model">
            <AgiMark className="agi-app-mark agi-app-mark--sm" />
            Auto
            <ChevronDown className="agi-app-icon agi-app-icon--sm" />
          </span>
          <Mic className="agi-app-icon agi-app-icon--lg" />
          <span className="agi-app-send agi-work-stop">
            <Square className="agi-app-icon agi-work-stop-glyph" />
          </span>
        </div>
      </div>
      <div className="agi-work-bar">
        <span>
          <Folder className="agi-app-icon" />
          Project
        </span>
        <span>
          <LibraryBig className="agi-app-icon" />
          Files
        </span>
        <span>
          <Grid2x2Plus className="agi-app-icon" />
          Connectors
        </span>
      </div>
    </div>
  );
}

function ToolBar({
  badge,
  name,
  elapsed,
  status,
}: {
  badge: string;
  name: string;
  elapsed?: string;
  status?: 'running' | 'awaiting-approval';
}) {
  return (
    <div className="agi-work-tool-bar" data-status={status}>
      <span className="agi-work-tool-badge">{badge}</span>
      <span className="agi-work-tool-name">{name}</span>
      <span className="agi-work-tool-time">{elapsed}</span>
      {status === 'running' ? <span className="agi-work-tool-status">Running</span> : null}
      {status === 'awaiting-approval' ? (
        <span className="agi-work-tool-status">Waiting for your approval</span>
      ) : null}
      {status === 'running' ? <Loader2 className="agi-work-icon agi-app-quiet" /> : null}
      {status === 'awaiting-approval' ? <PauseCircle className="agi-work-icon" /> : null}
      {status === 'awaiting-approval' ? (
        <ChevronDown className="agi-work-icon agi-app-quiet" />
      ) : (
        <ChevronRight className="agi-work-icon agi-app-quiet" />
      )}
    </div>
  );
}

const RUN_SIDEBAR_CHATS = ['Survey summary report', 'Weekly plan', 'Release notes'];
const RUN_TASK = 'Summarize survey.csv as a one-page report.';
const RUN_ELAPSED = '42s';
const RUN_PLAN = [
  'Read the survey export and list its questions.',
  'Count the answers to each question.',
  'Write a one-page summary report.',
] as const;

type RunRow =
  | { kind: 'step'; planIndex: number; running?: boolean }
  | {
      kind: 'tool';
      tool: string;
      badge: string;
      summary: string;
      elapsed: string;
      running?: boolean;
    };

const RUN_ROWS: readonly RunRow[] = [
  { kind: 'tool', tool: LIST_FILES_TOOL, badge: 'F', summary: 'Listing files', elapsed: '240ms' },
  { kind: 'tool', tool: READ_FILE_TOOL, badge: 'F', summary: 'Reading file', elapsed: '1.1s' },
  { kind: 'step', planIndex: 1 },
  { kind: 'tool', tool: EXECUTE_CODE_TOOL, badge: '>', summary: 'Running code', elapsed: '3.6s' },
  { kind: 'step', planIndex: 2, running: true },
  {
    kind: 'tool',
    tool: WRITE_FILE_TOOL,
    badge: 'F',
    summary: 'Writing file',
    elapsed: '4.2s',
    running: true,
  },
];

export function AgentRunScenePreview({ className }: { className?: string }) {
  return (
    <WorkShell
      scene="work-run"
      label="Authored example of an AGI Work run in AGI Web"
      className={className}
      chats={RUN_SIDEBAR_CHATS}
      composer={<WorkComposer />}
    >
      <p className="agi-app-user">{RUN_TASK}</p>
      <div className="agi-app-reply">
        <div className="agi-work-run" data-status="running">
          <div className="agi-work-run-head">
            <span className="agi-work-run-summary">Working for {RUN_ELAPSED}</span>
            <ChevronDown className="agi-app-icon" />
          </div>
          <span className="agi-work-run-plan">{RUN_PLAN[0]}</span>
          <div className="agi-work-run-rows">
            {RUN_ROWS.map((row) =>
              row.kind === 'step' ? (
                <div
                  key={`step-${row.planIndex}`}
                  className="agi-work-step"
                  data-status={row.running ? 'running' : 'completed'}
                >
                  <span className="agi-work-step-mark">
                    {row.running ? (
                      <Loader2 className="agi-work-icon" />
                    ) : (
                      <Clock3 className="agi-work-icon" />
                    )}
                  </span>
                  <span className="agi-work-step-text">
                    {row.planIndex + 1}. {RUN_PLAN[row.planIndex]}
                  </span>
                </div>
              ) : (
                <div key={row.tool} className="agi-work-tool" data-tool={row.tool}>
                  <div className="agi-work-tool-card">
                    <ToolBar
                      badge={row.badge}
                      name={row.summary}
                      elapsed={row.elapsed}
                      status={row.running ? 'running' : undefined}
                    />
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </WorkShell>
  );
}

const DIFF_SIDEBAR_CHATS = ['Stream the first response', 'Weekly plan', 'Release notes'];
const DIFF_TASK = 'Stream the first response instead of waiting for all of them.';
const DIFF_REQUEST = {
  path: 'src/send.ts',
  old_text: ['  const res = await fetchAll();', '  render(res);', '  return res.status;'].join(
    '\n',
  ),
  new_text: [
    '  const first = await fetchFirst();',
    '  render(first, { stream: true });',
    '  return first.status;',
  ].join('\n'),
};
const DIFF_ACTION = `Review ${getToolDisplayLabel(EDIT_FILE_TOOL).displayName} action`;
const DIFF_DECISIONS = [
  TOOL_APPROVAL_ACTION_LABELS.allow,
  TOOL_APPROVAL_ACTION_LABELS.allowForChat,
  TOOL_APPROVAL_ACTION_LABELS.deny,
];
const DIFF_SIGNS = { add: '+', remove: '-', context: ' ', meta: ' ' } as const;

export function DiffScenePreview({ className }: { className?: string }) {
  const diff = detectFileDiff(DIFF_REQUEST);
  if (!diff) throw new Error('The edit illustration must derive a diff');
  return (
    <WorkShell
      scene="work-diff"
      label="Authored example of a file edit waiting for approval in a chat"
      className={className}
      chats={DIFF_SIDEBAR_CHATS}
      composer={<AppComposer />}
    >
      <p className="agi-app-user">{DIFF_TASK}</p>
      <div className="agi-app-reply">
        <div className="agi-work-run" data-status="awaiting-approval">
          <div className="agi-work-run-head">
            <PauseCircle className="agi-app-icon" />
            <span className="agi-work-run-summary">Needs approval · {DIFF_ACTION}</span>
            <ChevronDown className="agi-app-icon" />
          </div>
          <div className="agi-work-run-rows">
            <div className="agi-work-tool" data-tool={EDIT_FILE_TOOL}>
              <div className="agi-work-tool-card" data-gated="true">
                <ToolBar badge="F" name={DIFF_ACTION} status="awaiting-approval" />
                <div className="agi-work-tool-body">
                  <div className="agi-work-banner">
                    <AlertCircle className="agi-work-icon" />
                    <span className="agi-work-banner-text">
                      This tool requires approval before execution.
                    </span>
                    <span className="agi-work-decisions">
                      {DIFF_DECISIONS.map((decision, index) => (
                        <span
                          key={decision}
                          className="agi-work-btn"
                          data-ink={index === 0 || undefined}
                        >
                          {index === 0 ? <Play className="agi-work-btn-glyph" /> : null}
                          {decision}
                        </span>
                      ))}
                    </span>
                  </div>
                  <div>
                    <span className="agi-work-label">Request</span>
                    <div className="agi-work-diff">
                      <div className="agi-work-diff-head">
                        <span className="agi-work-diff-path">{diff.filePath ?? 'diff'}</span>
                        <span className="agi-work-diff-added">+{diff.additions}</span>
                        <span className="agi-work-diff-removed">-{diff.deletions}</span>
                      </div>
                      <div className="agi-work-diff-lines">
                        {diff.lines.map((line, index) => (
                          <span key={index} className="agi-work-diff-line" data-diff={line.type}>
                            <i>{DIFF_SIGNS[line.type]}</i>
                            <span>{line.content || ' '}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </WorkShell>
  );
}

export interface SceneImage {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export function ImageScenePreview({
  title,
  badge,
  image,
  className,
}: {
  title: string;
  badge?: string;
  image: SceneImage;
  className?: string;
}) {
  const { frame, width } = PREVIEW_GEOMETRY.web;
  const style = { '--dev-w': frame, '--app-w': width } as CSSProperties;
  return (
    <figure
      className={['agi-dev', 'agi-dev--image', 'agi-app', 'agi-app--image', sceneClass(className)]
        .filter(Boolean)
        .join(' ')}
      style={style}
      data-device="image"
      data-scene="work-image"
      data-geometry={`${image.width}x${image.height}`}
    >
      <div className="agi-app-window agi-work-imagewindow">
        <div className="agi-app-titlebar agi-work-titlebar" aria-hidden="true">
          <TrafficLights />
          <span className="agi-app-titletext">{title}</span>
          {badge ? <span className="agi-app-pill agi-work-titlebadge">{badge}</span> : null}
        </div>
        <Image
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          sizes="(min-width: 960px) 50vw, 100vw"
          className="agi-work-image"
        />
      </div>
    </figure>
  );
}
