'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Camera,
  ChevronDown,
  House,
  Maximize2,
  Minimize2,
  Minus,
  MoreHorizontal,
  Pencil,
  PictureInPicture,
  Plus,
  Smartphone,
  Square,
  Video,
  X,
} from '@agiworkforce/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Spinner,
  useConfirmAction,
} from '@agiworkforce/ui';
import {
  SIMULATOR_UNAVAILABLE_MESSAGES,
  isSimulatorAppearance,
  isSimulatorStatusBar,
  type SimulatorAppearance,
  type SimulatorCapture,
  type SimulatorCaptureImage,
  type SimulatorStatusBar,
} from '@agiworkforce/local-runtime-contract';
import { useSimulator } from '../hooks/use-simulator';
import {
  SIMULATOR_PANE_COPY as COPY,
  formatCaptureSize,
  formatCaptureTime,
  formatElapsed,
} from '../simulator-pane';
import { LocalCaptureAnnotator } from './LocalCaptureAnnotator';
import styles from '../CloudCodePage.module.css';
import own from './LocalSimulatorPane.module.css';

const GLYPH_SIZE = 15;
const ZOOM_FIT = 100;
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 25;
const DEFAULT_RATIO = 9 / 19.5;

const APPEARANCES: readonly SimulatorAppearance[] = ['light', 'dark'];
const STATUS_BARS: readonly SimulatorStatusBar[] = ['live', 'clean'];

function join(...names: Array<string | false | undefined>): string {
  return names.filter(Boolean).join(' ');
}

export interface LocalSimulatorPaneProps {
  expanded: boolean;
  onToggleExpanded: () => void;
  floating: boolean;
  onToggleFloating: () => void;
  onClose: () => void;
  /** Absent when this session cannot take pictures; then every "add to chat" control is left out. */
  onAttachImage?: (file: File) => void;
}

interface CaptureMenuProps {
  capture: SimulatorCapture;
  label: string;
  canAttach: boolean;
  disabled: boolean;
  onAdd: () => void;
  onAnnotate: () => void;
  onCopyPath: () => void;
  onReveal: () => void;
  onDelete: () => void;
  onDismiss?: () => void;
}

function CaptureMenu({
  capture,
  label,
  canAttach,
  disabled,
  onAdd,
  onAnnotate,
  onCopyPath,
  onReveal,
  onDelete,
  onDismiss,
}: CaptureMenuProps) {
  const picture = canAttach && capture.kind === 'screenshot';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={join(styles['headerButton'], own['iconButton'])}
          aria-label={COPY.captureActions(label)}
          title={COPY.captureActions(label)}
          disabled={disabled}
        >
          <MoreHorizontal size={GLYPH_SIZE} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {picture && (
          <DropdownMenuItem className={own['menuItem']} onSelect={onAdd}>
            {COPY.addToChat}
          </DropdownMenuItem>
        )}
        {picture && (
          <DropdownMenuItem className={own['menuItem']} onSelect={onAnnotate}>
            {COPY.annotate}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className={own['menuItem']} onSelect={onCopyPath}>
          {COPY.copyPath}
        </DropdownMenuItem>
        <DropdownMenuItem className={own['menuItem']} onSelect={onReveal}>
          {COPY.showInFinder}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className={own['menuItem']} onSelect={onDelete}>
          {COPY.deleteCapture}
        </DropdownMenuItem>
        {onDismiss && (
          <DropdownMenuItem className={own['menuItem']} onSelect={onDismiss}>
            {COPY.close}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LocalSimulatorPane({
  expanded,
  onToggleExpanded,
  floating,
  onToggleFloating,
  onClose,
  onAttachImage,
}: LocalSimulatorPaneProps) {
  const [annotating, setAnnotating] = useState<SimulatorCaptureImage | null>(null);
  const [zoom, setZoom] = useState(ZOOM_FIT);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [phoneOnlyRequested, setPhoneOnlyRequested] = useState(false);
  const { confirm, dialog } = useConfirmAction();
  const sim = useSimulator({ framesPaused: annotating !== null });

  useEffect(() => {
    if (!floating) setPhoneOnlyRequested(false);
  }, [floating]);

  const phoneOnly = floating && phoneOnlyRequested;
  const { device, status, settings, busy } = sim;
  const ready = sim.load === 'ready' && status?.available === true;
  const showPicker = ready && (status?.devices.length ?? 0) > 0 && !phoneOnly;
  const showPhone = ready && sim.booted;
  const showMenus = showPhone && !phoneOnly;
  const canAttach = onAttachImage !== undefined;
  const recording = status?.recording ?? null;
  const working = busy !== null;

  const zoomBy = (delta: number) =>
    setZoom((current) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current + delta)));

  const annotateCapture = async (capture: SimulatorCapture) => {
    const image = await sim.readImage(capture);
    if (image) setAnnotating(image);
  };

  const annotateNew = async () => {
    const image = await sim.screenshot();
    if (image) setAnnotating(image);
  };

  const addCapture = (capture: SimulatorCapture) => {
    if (onAttachImage) void sim.addToChat(capture, onAttachImage);
  };

  const confirmDelete = (capture: SimulatorCapture) =>
    confirm({
      title: COPY.deleteTitle,
      description: COPY.deleteDescription,
      confirmLabel: COPY.deleteCapture,
      destructive: true,
      onConfirm: () => sim.remove(capture),
    });

  const confirmShutDown = () =>
    confirm({
      title: COPY.shutDownTitle,
      description: COPY.shutDownDescription,
      confirmLabel: COPY.shutDown,
      destructive: true,
      onConfirm: () => sim.shutdown(),
    });

  const captureMenu = (capture: SimulatorCapture, label: string, onDismiss?: () => void) => (
    <CaptureMenu
      capture={capture}
      label={label}
      canAttach={canAttach}
      disabled={working}
      onAdd={() => addCapture(capture)}
      onAnnotate={() => void annotateCapture(capture)}
      onCopyPath={() => void sim.copyPath(capture)}
      onReveal={() => void sim.reveal(capture)}
      onDelete={() => confirmDelete(capture)}
      {...(onDismiss ? { onDismiss } : {})}
    />
  );

  const captureLabel = (capture: SimulatorCapture) =>
    `${COPY.captureKinds[capture.kind].toLowerCase()} at ${formatCaptureTime(capture.createdAtMs)}`;

  const paneControls: ReactNode = (
    <div className={styles['changesActions']}>
      {floating && (
        <button
          type="button"
          className={join(
            styles['headerButton'],
            own['iconButton'],
            phoneOnly && styles['headerButtonActive'],
          )}
          aria-label={COPY.phoneOnly}
          title={COPY.phoneOnly}
          aria-pressed={phoneOnly}
          onClick={() => setPhoneOnlyRequested((current) => !current)}
        >
          <Smartphone size={GLYPH_SIZE} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        className={join(
          styles['headerButton'],
          own['iconButton'],
          floating && styles['headerButtonActive'],
        )}
        aria-label={COPY.floatPane}
        title={COPY.floatPane}
        aria-pressed={floating}
        onClick={onToggleFloating}
      >
        <PictureInPicture size={GLYPH_SIZE} aria-hidden="true" />
      </button>
      {!floating && (
        <button
          type="button"
          className={join(
            styles['headerButton'],
            own['iconButton'],
            expanded && styles['headerButtonActive'],
          )}
          aria-label={COPY.expandPane}
          title={COPY.expandPane}
          aria-pressed={expanded}
          onClick={onToggleExpanded}
        >
          {expanded ? (
            <Minimize2 size={GLYPH_SIZE} aria-hidden="true" />
          ) : (
            <Maximize2 size={GLYPH_SIZE} aria-hidden="true" />
          )}
        </button>
      )}
      <button
        type="button"
        className={join(styles['headerButton'], own['iconButton'])}
        aria-label={COPY.closePane}
        title={COPY.closePane}
        onClick={onClose}
      >
        <X size={GLYPH_SIZE} aria-hidden="true" />
      </button>
    </div>
  );

  const header = (
    <div className={own['header']}>
      <div className={own['headerGroup']}>
        {(!showPicker || annotating) && (
          <span className={own['title']}>
            <Smartphone size={GLYPH_SIZE} aria-hidden="true" />
            {COPY.pane}
          </span>
        )}
        {showMenus && !annotating && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={own['menuButton']}>
                  {COPY.editMenu}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  className={own['menuItem']}
                  disabled={working}
                  onSelect={() => void sim.copyFromSimulator()}
                >
                  {COPY.copyFromSimulator}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={own['menuItem']}
                  disabled={working}
                  onSelect={() => void sim.sendToSimulator()}
                >
                  {COPY.sendToSimulator}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={own['menuButton']}>
                  {COPY.deviceMenu}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {settings?.appearance && (
                  <>
                    <DropdownMenuLabel>{COPY.appearance}</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={settings.appearance}
                      onValueChange={(value) => {
                        if (isSimulatorAppearance(value)) void sim.setAppearance(value);
                      }}
                    >
                      {APPEARANCES.map((entry) => (
                        <DropdownMenuRadioItem
                          key={entry}
                          value={entry}
                          className={own['menuItem']}
                          disabled={working}
                        >
                          {COPY.appearanceOptions[entry]}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator />
                  </>
                )}
                {settings && (
                  <>
                    <DropdownMenuLabel>{COPY.statusBar}</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={settings.statusBar}
                      onValueChange={(value) => {
                        if (isSimulatorStatusBar(value)) void sim.setStatusBar(value);
                      }}
                    >
                      {STATUS_BARS.map((entry) => (
                        <DropdownMenuRadioItem
                          key={entry}
                          value={entry}
                          className={own['menuItem']}
                          disabled={working}
                        >
                          <span className={own['menuItemBody']}>
                            {COPY.statusBarOptions[entry]}
                            <span className={own['menuItemHint']}>
                              {COPY.statusBarHints[entry]}
                            </span>
                          </span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  className={own['menuItem']}
                  disabled={working}
                  onSelect={confirmShutDown}
                >
                  {COPY.shutDown}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={own['menuButton']}>
                  {COPY.viewMenu}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  className={own['menuItem']}
                  disabled={zoom >= ZOOM_MAX}
                  title={zoom >= ZOOM_MAX ? COPY.zoomAtMaximum : undefined}
                  onSelect={() => zoomBy(ZOOM_STEP)}
                >
                  {COPY.zoomIn}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={own['menuItem']}
                  disabled={zoom <= ZOOM_MIN}
                  title={zoom <= ZOOM_MIN ? COPY.zoomAtMinimum : undefined}
                  onSelect={() => zoomBy(-ZOOM_STEP)}
                >
                  {COPY.zoomOut}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={own['menuItem']}
                  disabled={zoom === ZOOM_FIT}
                  title={zoom === ZOOM_FIT ? COPY.zoomAtFit : undefined}
                  onSelect={() => setZoom(ZOOM_FIT)}
                >
                  {COPY.zoomFit}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        {showPicker && !annotating && device && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={own['menuButton']}
                title={`${COPY.chooseDevice}: ${device.name}`}
              >
                <span className={own['pickerLabel']}>{device.name}</span>
                <ChevronDown size={GLYPH_SIZE} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup value={device.udid} onValueChange={sim.selectDevice}>
                {status?.devices.map((entry) => (
                  <DropdownMenuRadioItem
                    key={entry.udid}
                    value={entry.udid}
                    className={own['menuItem']}
                  >
                    <span className={own['deviceRow']}>
                      <span className={own['menuItemBody']}>
                        {entry.name}
                        <span className={own['menuItemHint']}>{entry.runtime}</span>
                      </span>
                      {entry.booted && <span className={own['deviceRunning']}>{COPY.running}</span>}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className={own['headerGroup']}>
        {showPhone && !annotating && (
          <>
            <button
              type="button"
              className={join(styles['headerButton'], own['iconButton'])}
              aria-label={COPY.zoomOut}
              title={zoom <= ZOOM_MIN ? COPY.zoomAtMinimum : COPY.zoomOut}
              disabled={zoom <= ZOOM_MIN}
              onClick={() => zoomBy(-ZOOM_STEP)}
            >
              <Minus size={GLYPH_SIZE} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={join(styles['headerButton'], own['iconButton'])}
              aria-label={COPY.zoomIn}
              title={zoom >= ZOOM_MAX ? COPY.zoomAtMaximum : COPY.zoomIn}
              disabled={zoom >= ZOOM_MAX}
              onClick={() => zoomBy(ZOOM_STEP)}
            >
              <Plus size={GLYPH_SIZE} aria-hidden="true" />
            </button>
          </>
        )}
        {paneControls}
      </div>
    </div>
  );

  const phoneStyle = {
    '--phone-ratio': ratio,
    '--zoom': zoom / ZOOM_FIT,
  } as CSSProperties;

  let body: ReactNode;
  if (sim.load === 'loading') {
    body = (
      <div className={own['state']}>
        <Spinner aria-hidden="true" />
        <p role="status">{COPY.loading}</p>
      </div>
    );
  } else if (sim.load === 'failed') {
    body = (
      <div className={own['state']}>
        <p>{sim.failure?.permissionDenied ? COPY.permissionNeeded : sim.failure?.message}</p>
        <button
          type="button"
          className={styles['secondaryButton']}
          onClick={() => void sim.refresh()}
        >
          {COPY.tryAgain}
        </button>
      </div>
    );
  } else if (status && !status.available) {
    body = (
      <div className={own['state']}>
        <p>{SIMULATOR_UNAVAILABLE_MESSAGES[status.unavailableReason ?? 'failed']}</p>
        <button
          type="button"
          className={styles['secondaryButton']}
          onClick={() => void sim.refresh()}
        >
          {COPY.tryAgain}
        </button>
      </div>
    );
  } else if (!device) {
    body = (
      <div className={own['state']}>
        <p>{COPY.noDevices}</p>
      </div>
    );
  } else if (!sim.booted) {
    const booting = busy === 'boot';
    body = (
      <div className={own['state']}>
        <p>
          <span className={own['stateName']}>{device.name}</span>
          <br />
          {COPY.notRunning(device.name)}
        </p>
        {booting ? (
          <>
            <Spinner aria-hidden="true" />
            <p role="status">{COPY.starting}</p>
          </>
        ) : null}
        <button
          type="button"
          className={styles['secondaryButton']}
          disabled={booting}
          onClick={() => void sim.boot()}
        >
          {COPY.startSimulator}
        </button>
        <p className={own['stateNote']}>{COPY.memoryNote}</p>
      </div>
    );
  } else {
    body = (
      <>
        <div className={own['stage']}>
          <div className={own['phone']} style={phoneStyle}>
            {sim.frame ? (
              <img
                className={own['screen']}
                src={sim.frame}
                alt={COPY.screenAlt}
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if (naturalWidth > 0 && naturalHeight > 0) {
                    setRatio(naturalWidth / naturalHeight);
                  }
                }}
              />
            ) : (
              <div className={own['screenWaiting']}>
                <Spinner size="sm" aria-hidden="true" />
                {COPY.screenWaiting}
              </div>
            )}
          </div>
        </div>
        {sim.frameFailure !== null && (
          <p className={own['frameNotice']}>{COPY.screenStale(sim.frameFailure)}</p>
        )}
      </>
    );
  }

  const feedback = (
    <>
      {sim.error !== null && (
        <p className={join(own['feedback'], own['feedbackError'])} role="alert">
          {sim.error}
        </p>
      )}
      {sim.notice !== null && (
        <p className={own['feedback']} role="status">
          {sim.notice}
        </p>
      )}
    </>
  );

  const toolbar = showPhone && !phoneOnly && (
    <div className={own['toolbar']} role="group" aria-label={COPY.tools}>
      <button
        type="button"
        className={own['toolButton']}
        disabled={working}
        title={COPY.homeHint}
        onClick={() => void sim.pressHome()}
      >
        <House size={GLYPH_SIZE} aria-hidden="true" />
        {COPY.home}
      </button>
      <button
        type="button"
        className={own['toolButton']}
        disabled={working}
        onClick={() => void sim.screenshot()}
      >
        <Camera size={GLYPH_SIZE} aria-hidden="true" />
        {COPY.screenshot}
      </button>
      {recording ? (
        <>
          <span className={own['recording']}>
            <span className={own['recordingDot']} aria-hidden="true" />
            <span className={own['recordingTime']} role="timer" aria-label={COPY.recordingTime}>
              {formatElapsed(sim.recordingSeconds ?? 0)}
            </span>
          </span>
          <button
            type="button"
            className={own['toolButton']}
            disabled={working}
            aria-label={COPY.stopRecordingLabel}
            onClick={() => void sim.stopRecording()}
          >
            <Square size={GLYPH_SIZE} aria-hidden="true" />
            {COPY.stopRecording}
          </button>
        </>
      ) : (
        <button
          type="button"
          className={own['toolButton']}
          disabled={working}
          onClick={() => void sim.startRecording()}
        >
          <Video size={GLYPH_SIZE} aria-hidden="true" />
          {COPY.record}
        </button>
      )}
      {canAttach && (
        <button
          type="button"
          className={own['toolButton']}
          disabled={working}
          onClick={() => void annotateNew()}
        >
          <Pencil size={GLYPH_SIZE} aria-hidden="true" />
          {COPY.annotate}
        </button>
      )}
    </div>
  );

  const savedCaptures = status?.captures ?? [];
  const captures = showPhone && !phoneOnly && (sim.latest || savedCaptures.length > 0) && (
    <div className={own['captures']}>
      {sim.latest && (
        <section className={own['latest']} aria-label={COPY.latestCapture}>
          {sim.latest.capture.kind === 'screenshot' && sim.latest.image && (
            <img
              className={own['thumbnail']}
              src={sim.latest.image.dataUrl}
              alt={COPY.thumbnailAlt}
            />
          )}
          <span className={own['captureMeta']}>
            <span className={own['captureKind']}>{COPY.captureKinds[sim.latest.capture.kind]}</span>
            <span>{formatCaptureTime(sim.latest.capture.createdAtMs)}</span>
          </span>
          {captureMenu(sim.latest.capture, captureLabel(sim.latest.capture), sim.dismissLatest)}
        </section>
      )}
      {savedCaptures.length > 0 && (
        <details className={own['saved']}>
          <summary className={own['summary']}>{COPY.savedCaptures(savedCaptures.length)}</summary>
          <ul className={own['savedList']}>
            {savedCaptures.map((capture) => (
              <li key={capture.id} className={own['savedRow']}>
                <span className={own['captureMeta']}>
                  <span className={own['captureKind']}>{COPY.captureKinds[capture.kind]}</span>
                  <span>{formatCaptureTime(capture.createdAtMs)}</span>
                  <span>{formatCaptureSize(capture.bytes)}</span>
                </span>
                {captureMenu(capture, captureLabel(capture))}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );

  const phoneBar = phoneOnly && (
    <div className={own['phoneBar']}>
      <button
        type="button"
        className={own['toolButton']}
        onClick={() => setPhoneOnlyRequested(false)}
      >
        {COPY.showControls}
      </button>
      <button type="button" className={own['toolButton']} onClick={onToggleFloating}>
        {COPY.dock}
      </button>
      <button type="button" className={own['toolButton']} onClick={onClose}>
        {COPY.close}
      </button>
    </div>
  );

  return (
    <aside
      className={join(
        styles['changes'],
        own['pane'],
        expanded && own['expanded'],
        floating && own['floating'],
      )}
      data-testid="local-simulator-pane"
      aria-label={COPY.pane}
    >
      {!phoneOnly && header}
      {annotating ? (
        <LocalCaptureAnnotator
          image={annotating.dataUrl}
          name={annotating.name}
          onAdd={(file) => {
            onAttachImage?.(file);
            setAnnotating(null);
          }}
          onClose={() => setAnnotating(null)}
        />
      ) : (
        <>
          <div className={own['body']}>{body}</div>
          {feedback}
          {toolbar}
          {captures}
          {phoneBar}
        </>
      )}
      {dialog}
    </aside>
  );
}
