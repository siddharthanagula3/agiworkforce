'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DesktopRuntimeError,
  SIMULATOR_FRAME_INTERVAL_MS,
  type SimulatorAppearance,
  type SimulatorCapture,
  type SimulatorCaptureImage,
  type SimulatorDevice,
  type SimulatorSettings,
  type SimulatorStatus,
  type SimulatorStatusBar,
} from '@agiworkforce/local-runtime-contract';
import {
  bootSimulator,
  copySimulatorClipboard,
  deleteSimulatorCapture,
  onSimulatorChanged,
  pressSimulatorHome,
  readSimulatorCapture,
  readSimulatorFrame,
  readSimulatorSettings,
  readSimulatorStatus,
  revealSimulatorCapture,
  sendClipboardToSimulator,
  setSimulatorAppearance,
  setSimulatorStatusBar,
  shutdownSimulator,
  startSimulatorRecording,
  stopSimulatorRecording,
  takeSimulatorScreenshot,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { SIMULATOR_PANE_COPY as COPY } from '../simulator-pane';

const FRAME_RETRY_MS = 3000;
const CLOCK_TICK_MS = 1000;
const MS_PER_SECOND = 1000;
const IMAGE_TYPE = 'image/png';

export interface LatestCapture {
  capture: SimulatorCapture;
  image: SimulatorCaptureImage | null;
}

export interface StatusFailure {
  message: string;
  permissionDenied: boolean;
}

export type SimulatorLoad = 'loading' | 'ready' | 'failed';

export type SimulatorBusy =
  'boot' | 'shutdown' | 'home' | 'screenshot' | 'record' | 'settings' | 'clipboard' | 'capture';

export function fileFromDataUrl(dataUrl: string, name: string): File {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma < 0) throw new Error(COPY.captureReadFailed);
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new File([bytes], name, { type: IMAGE_TYPE });
}

function defaultDevice(devices: readonly SimulatorDevice[]): SimulatorDevice | null {
  return devices.find((device) => device.booted) ?? devices[0] ?? null;
}

function documentVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

export interface UseSimulatorOptions {
  framesPaused: boolean;
}

export interface SimulatorState {
  load: SimulatorLoad;
  failure: StatusFailure | null;
  status: SimulatorStatus | null;
  device: SimulatorDevice | null;
  booted: boolean;
  settings: SimulatorSettings | null;
  frame: string | null;
  frameFailure: string | null;
  busy: SimulatorBusy | null;
  notice: string | null;
  error: string | null;
  latest: LatestCapture | null;
  recordingSeconds: number | null;
  refresh: () => Promise<void>;
  selectDevice: (udid: string) => void;
  boot: () => Promise<void>;
  shutdown: () => Promise<void>;
  pressHome: () => Promise<void>;
  screenshot: () => Promise<SimulatorCaptureImage | undefined>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  setAppearance: (appearance: SimulatorAppearance) => Promise<void>;
  setStatusBar: (statusBar: SimulatorStatusBar) => Promise<void>;
  copyFromSimulator: () => Promise<void>;
  sendToSimulator: () => Promise<void>;
  readImage: (capture: SimulatorCapture) => Promise<SimulatorCaptureImage | undefined>;
  addToChat: (capture: SimulatorCapture, attach: (file: File) => void) => Promise<void>;
  copyPath: (capture: SimulatorCapture) => Promise<void>;
  reveal: (capture: SimulatorCapture) => Promise<void>;
  remove: (capture: SimulatorCapture) => Promise<void>;
  dismissLatest: () => void;
}

export function useSimulator({ framesPaused }: UseSimulatorOptions): SimulatorState {
  const [status, setStatus] = useState<SimulatorStatus | null>(null);
  const [load, setLoad] = useState<SimulatorLoad>('loading');
  const [failure, setFailure] = useState<StatusFailure | null>(null);
  const [selectedUdid, setSelectedUdid] = useState<string | null>(null);
  const [settings, setSettings] = useState<SimulatorSettings | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [frameFailure, setFrameFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState<SimulatorBusy | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<LatestCapture | null>(null);
  const [visible, setVisible] = useState(documentVisible);
  const [now, setNow] = useState(() => Date.now());
  const alive = useRef(true);
  const epoch = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const apply = useCallback((next: SimulatorStatus) => {
    if (!alive.current) return;
    epoch.current += 1;
    setStatus(next);
  }, []);

  const refresh = useCallback(async () => {
    const started = epoch.current;
    setLoad('loading');
    setFailure(null);
    try {
      const next = await readSimulatorStatus();
      if (!alive.current) return;
      if (epoch.current === started) setStatus(next);
      setLoad('ready');
    } catch (cause: unknown) {
      if (!alive.current) return;
      setFailure({
        message: toUserMessage(cause, COPY.statusFailed),
        permissionDenied:
          cause instanceof DesktopRuntimeError && cause.code === 'permission-denied',
      });
      setLoad('failed');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(
    () =>
      onSimulatorChanged((next) => {
        if (!alive.current) return;
        epoch.current += 1;
        setStatus(next);
        setLoad('ready');
        setFailure(null);
      }),
    [],
  );

  useEffect(() => {
    const update = () => setVisible(documentVisible());
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  const device = useMemo(() => {
    const devices = status?.devices ?? [];
    return devices.find((entry) => entry.udid === selectedUdid) ?? defaultDevice(devices);
  }, [status, selectedUdid]);
  const udid = device?.udid ?? null;
  const booted = status?.available === true && device?.booted === true;

  useEffect(() => {
    setFrame(null);
    setFrameFailure(null);
  }, [udid, booted]);

  useEffect(() => {
    setSettings(null);
    if (!udid || !booted) return;
    let cancelled = false;
    readSimulatorSettings(udid).then(
      (next) => {
        if (!cancelled) setSettings(next);
      },
      (cause: unknown) => {
        if (!cancelled) setError(toUserMessage(cause, COPY.settingsFailed));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [udid, booted]);

  useEffect(() => {
    if (!udid || !booted || framesPaused || !visible) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const started = Date.now();
      let delay: number;
      try {
        const next = await readSimulatorFrame(udid);
        if (cancelled) return;
        setFrame(next.dataUrl);
        setFrameFailure(null);
        delay = Math.max(0, SIMULATOR_FRAME_INTERVAL_MS - (Date.now() - started));
      } catch (cause: unknown) {
        if (cancelled) return;
        setFrameFailure(toUserMessage(cause, COPY.frameFailed));
        delay = FRAME_RETRY_MS;
      }
      timer = setTimeout(() => void tick(), delay);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [udid, booted, framesPaused, visible]);

  const recording = status?.recording ?? null;
  const recordingStartedAt = recording?.startedAtMs ?? null;

  useEffect(() => {
    if (recordingStartedAt === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [recordingStartedAt]);

  const recordingSeconds =
    recordingStartedAt === null
      ? null
      : Math.max(0, Math.floor((now - recordingStartedAt) / MS_PER_SECOND));

  const act = useCallback(
    async <T>(
      kind: SimulatorBusy,
      failureText: string,
      work: () => Promise<T>,
    ): Promise<T | undefined> => {
      setBusy(kind);
      setError(null);
      setNotice(null);
      try {
        return await work();
      } catch (cause: unknown) {
        if (alive.current) setError(toUserMessage(cause, failureText));
        return undefined;
      } finally {
        if (alive.current) setBusy(null);
      }
    },
    [],
  );

  const say = useCallback((text: string) => {
    if (alive.current) setNotice(text);
  }, []);

  const selectDevice = useCallback((next: string) => setSelectedUdid(next), []);

  const boot = useCallback(async () => {
    if (!device) return;
    setSelectedUdid(device.udid);
    await act('boot', COPY.bootFailed, async () => apply(await bootSimulator(device.udid)));
  }, [device, act, apply]);

  const shutdown = useCallback(async () => {
    if (!udid) return;
    await act('shutdown', COPY.shutDownFailed, async () => {
      apply(await shutdownSimulator(udid));
      say(COPY.shutDownDone);
    });
  }, [udid, act, apply, say]);

  const pressHome = useCallback(async () => {
    if (!udid) return;
    await act('home', COPY.homeFailed, async () => {
      await pressSimulatorHome(udid);
    });
  }, [udid, act]);

  const screenshot = useCallback(async () => {
    if (!udid) return undefined;
    return act('screenshot', COPY.screenshotFailed, async () => {
      const capture = await takeSimulatorScreenshot(udid);
      if (alive.current) setLatest({ capture, image: null });
      const image = await readSimulatorCapture(capture.id);
      if (alive.current) setLatest({ capture, image });
      say(COPY.screenshotDone);
      return image;
    });
  }, [udid, act, say]);

  const startRecording = useCallback(async () => {
    if (!udid) return;
    await act('record', COPY.recordFailed, async () => apply(await startSimulatorRecording(udid)));
  }, [udid, act, apply]);

  const stopRecording = useCallback(async () => {
    const known = new Set(status?.captures.map((capture) => capture.id));
    await act('record', COPY.stopFailed, async () => {
      const next = await stopSimulatorRecording();
      apply(next);
      const saved = next.captures.find((capture) => !known.has(capture.id));
      if (saved && alive.current) setLatest({ capture: saved, image: null });
      say(COPY.recordingSaved);
    });
  }, [status, act, apply, say]);

  const changeSetting = useCallback(
    async (failureText: string, write: (target: string) => Promise<SimulatorSettings>) => {
      if (!udid) return;
      await act('settings', failureText, async () => {
        const written = await write(udid);
        if (alive.current) setSettings(written);
        try {
          const confirmed = await readSimulatorSettings(udid);
          if (alive.current) setSettings(confirmed);
        } catch {
          return;
        }
      });
    },
    [udid, act],
  );

  const setAppearance = useCallback(
    (appearance: SimulatorAppearance) =>
      changeSetting(COPY.appearanceFailed, (target) => setSimulatorAppearance(target, appearance)),
    [changeSetting],
  );

  const setStatusBar = useCallback(
    (statusBar: SimulatorStatusBar) =>
      changeSetting(COPY.statusBarFailed, (target) => setSimulatorStatusBar(target, statusBar)),
    [changeSetting],
  );

  const copyFromSimulator = useCallback(async () => {
    if (!udid) return;
    await act('clipboard', COPY.copyFailed, async () => {
      const { characters } = await copySimulatorClipboard(udid);
      say(characters === 0 ? COPY.clipboardEmptyFromSimulator : COPY.clipboardCopied(characters));
    });
  }, [udid, act, say]);

  const sendToSimulator = useCallback(async () => {
    if (!udid) return;
    await act('clipboard', COPY.sendFailed, async () => {
      const { characters } = await sendClipboardToSimulator(udid);
      say(characters === 0 ? COPY.clipboardEmptyToSimulator : COPY.clipboardSent(characters));
    });
  }, [udid, act, say]);

  const readImage = useCallback(
    async (capture: SimulatorCapture) => {
      if (latest?.capture.id === capture.id && latest.image) return latest.image;
      return act('capture', COPY.captureReadFailed, () => readSimulatorCapture(capture.id));
    },
    [latest, act],
  );

  const addToChat = useCallback(
    async (capture: SimulatorCapture, attach: (file: File) => void) => {
      const cached = latest?.capture.id === capture.id ? latest.image : null;
      await act('capture', COPY.captureReadFailed, async () => {
        const image = cached ?? (await readSimulatorCapture(capture.id));
        attach(fileFromDataUrl(image.dataUrl, image.name));
        say(COPY.addedToChat);
      });
    },
    [latest, act, say],
  );

  const copyPath = useCallback(
    async (capture: SimulatorCapture) => {
      await act('capture', COPY.pathCopyFailed, async () => {
        await navigator.clipboard.writeText(capture.path);
        say(COPY.pathCopied);
      });
    },
    [act, say],
  );

  const reveal = useCallback(
    async (capture: SimulatorCapture) => {
      await act('capture', COPY.revealFailed, async () => {
        if (!(await revealSimulatorCapture(capture.id))) throw new Error(COPY.revealFailed);
      });
    },
    [act],
  );

  const remove = useCallback(
    async (capture: SimulatorCapture) => {
      await act('capture', COPY.deleteFailed, async () => {
        apply(await deleteSimulatorCapture(capture.id));
        if (alive.current) {
          setLatest((current) => (current?.capture.id === capture.id ? null : current));
        }
        say(COPY.deleteDone);
      });
    },
    [act, apply, say],
  );

  const dismissLatest = useCallback(() => setLatest(null), []);

  return {
    load,
    failure,
    status,
    device,
    booted,
    settings,
    frame,
    frameFailure,
    busy,
    notice,
    error,
    latest,
    recordingSeconds,
    refresh,
    selectDevice,
    boot,
    shutdown,
    pressHome,
    screenshot,
    startRecording,
    stopRecording,
    setAppearance,
    setStatusBar,
    copyFromSimulator,
    sendToSimulator,
    readImage,
    addToChat,
    copyPath,
    reveal,
    remove,
    dismissLatest,
  };
}
