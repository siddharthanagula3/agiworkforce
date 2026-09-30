'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { DevicePresence } from '@agiworkforce/cloud-contracts';
import {
  REMOTE_CODE_LIMITS,
  runStatusLabel,
  type DispatchTaskLifecycleStatus,
} from '@agiworkforce/types';
import { Mic } from '@agiworkforce/icons';
import { Button, Spinner, Textarea } from '@agiworkforce/ui';
import { DictationStrip } from '@features/chat/components/Composer/DictationStrip';
import { MicrophonePrivacyNotice } from '@features/chat/components/MicrophonePrivacyNotice';
import { useDictation } from '@features/chat/hooks/use-dictation';
import { useMicrophoneNoticeStore } from '@features/chat/stores/microphone-notice-store';
import { toUserMessage } from '@/lib/user-error-message';
import { readBrowserPairing, type BrowserPairing } from '../lib/browser-pairing';
import {
  connectRemoteDispatch,
  type RemoteDispatchConnection,
  type RemoteTaskStatus,
} from '../lib/remote-dispatch-client';

const DEVICES_PATH = '/api/settings/devices';
const DOWNLOAD_PATH = '/download';
const CODE_PATH = '/code';
const TASK_TITLE_LENGTH = 80;
const DICTATE_LABEL = 'Start voice input';

const HEADING = 'Your computer';
const INTRO =
  'Send a task to AGI Cloud on your own computer. It runs there as a chat that can use the folders, apps and browser you allowed on that computer, and the answer comes back here.';
const COMPUTERS_HEADING = 'Computers on your account';
const NO_COMPUTERS = 'No computer with AGI Cloud is linked to this account yet.';
const NEEDS_UPDATE = 'update AGI Cloud on it to send tasks';
const HOW_TO_CONNECT =
  'On that computer, open AGI Cloud and go to Settings, Capabilities, Remote Control. Choose Pair a phone, then Copy link for a browser, and open the link here or paste it below.';
const LINK_LABEL = 'Pairing link';
const LINK_PLACEHOLDER = 'Paste the link copied on your computer';
const LINK_INVALID = 'That is not a pairing link from AGI Cloud. Copy it again on your computer.';
const CONNECT_LABEL = 'Connect';
const CONNECTING = 'Connecting to your computer';
const AWAY = 'Your computer went offline. This page reconnects when it is back.';
const DISCONNECT_LABEL = 'Disconnect';
const TASK_LABEL = 'Task';
const TASK_PLACEHOLDER = 'Describe what AGI should do on your computer';
const SEND_LABEL = 'Send to computer';
const SEND_FAILED = 'The task did not reach your computer. Check the connection and try again.';
const CANCEL_LABEL = 'Cancel';
const SEND_AGAIN_LABEL = 'Send again';
const CONNECT_FAILED = 'This browser could not connect to your computer.';

const PRESENCE_COPY: Readonly<Record<DevicePresence, string>> = {
  online: 'online',
  sleeping: 'asleep',
  offline: 'offline',
};

const OPEN_STATUSES: ReadonlySet<DispatchTaskLifecycleStatus> = new Set([
  'accepted',
  'queued',
  'running',
  'awaiting_input',
]);

interface ListedComputer {
  id: string;
  name: string;
  presence: DevicePresence;
  acceptsTasks: boolean;
}

interface RemoteTask extends Partial<RemoteTaskStatus> {
  requestId: string;
  prompt: string;
  status: DispatchTaskLifecycleStatus;
}

type ConnectionPhase = 'idle' | 'connecting' | 'waiting' | 'away' | 'connected';

function readComputers(body: unknown): ListedComputer[] {
  const devices = body && typeof body === 'object' ? (body as { devices?: unknown }).devices : null;
  if (!Array.isArray(devices)) return [];
  return devices.flatMap((device: Record<string, unknown>) => {
    if (device['kind'] !== 'desktop' || device['shell'] !== 'electron') return [];
    const capabilities = device['capabilities'] as Record<string, unknown> | undefined;
    const presence = device['presence'];
    return [
      {
        id: String(device['id'] ?? device['deviceId'] ?? device['name'] ?? ''),
        name:
          typeof device['name'] === 'string' && device['name'].trim() ? device['name'] : HEADING,
        presence:
          presence === 'online' || presence === 'sleeping' ? presence : ('offline' as const),
        acceptsTasks: capabilities?.['remoteControl'] === true,
      },
    ];
  });
}

function titleFor(prompt: string): string {
  const firstLine = prompt.split('\n')[0]?.trim() ?? '';
  return firstLine.slice(0, TASK_TITLE_LENGTH);
}

export function RemoteComputerPage() {
  const [computers, setComputers] = useState<ListedComputer[] | null>(null);
  const [phase, setPhase] = useState<ConnectionPhase>('idle');
  const [computerName, setComputerName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [draft, setDraft] = useState('');
  const [tasks, setTasks] = useState<RemoteTask[]>([]);
  const connection = useRef<RemoteDispatchConnection | null>(null);
  const attempt = useRef(0);
  const mounted = useRef(false);
  const autoConnected = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      connection.current?.close();
      connection.current = null;
    };
  }, []);

  useEffect(() => {
    let live = true;
    fetch(DEVICES_PATH, { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        if (live) setComputers(readComputers(body));
      })
      .catch(() => {
        if (live) setComputers([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const applyStatus = useCallback((status: RemoteTaskStatus) => {
    setTasks((current) =>
      current.map((task) => (task.requestId === status.requestId ? { ...task, ...status } : task)),
    );
  }, []);

  const disconnect = useCallback(() => {
    attempt.current += 1;
    connection.current?.close();
    connection.current = null;
  }, []);

  const connect = useCallback(
    async (pairing: BrowserPairing) => {
      disconnect();
      const current = attempt.current;
      const live = () => mounted.current && attempt.current === current;
      setError(null);
      setPhase('connecting');
      try {
        const opened = await connectRemoteDispatch(pairing, {
          onReady: (name) => {
            if (!live()) return;
            setComputerName(name);
            setPhase('connected');
          },
          onAway: () => {
            if (live()) setPhase('away');
          },
          onTaskStatus: (status) => {
            if (live()) applyStatus(status);
          },
          onClosed: (message) => {
            if (!live()) return;
            connection.current = null;
            setPhase('idle');
            setError(message);
          },
        });
        if (!live()) {
          opened.close();
          return;
        }
        connection.current = opened;
        setPhase((phase) => (phase === 'connecting' ? 'waiting' : phase));
      } catch (cause) {
        if (!live()) return;
        setPhase('idle');
        setError(toUserMessage(cause, CONNECT_FAILED));
      }
    },
    [applyStatus, disconnect],
  );

  useEffect(() => {
    if (autoConnected.current) return;
    autoConnected.current = true;
    const pairing = readBrowserPairing(window.location.hash);
    if (!pairing) return;
    window.history.replaceState(null, '', window.location.pathname);
    void connect(pairing);
  }, [connect]);

  const onConnect = () => {
    const pairing = readBrowserPairing(link);
    if (!pairing) {
      setError(LINK_INVALID);
      return;
    }
    setLink('');
    void connect(pairing);
  };

  const onDisconnect = () => {
    disconnect();
    setPhase('idle');
    setComputerName(null);
  };

  const sendTask = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || !connection.current) return;
    const requestId = await connection.current.sendTask(prompt, titleFor(prompt));
    if (!requestId) {
      setError(SEND_FAILED);
      return;
    }
    setError(null);
    setDraft('');
    setTasks((current) => [{ requestId, prompt, status: 'queued' }, ...current]);
  };

  const dictation = useDictation({
    onInsert: (text) => setDraft((current) => (current ? `${current} ${text}` : text)),
    onSend: (text) => void sendTask(draft ? `${draft} ${text}` : text),
  });
  const microphoneOwner = useId();
  const askForMicrophone = useMicrophoneNoticeStore((state) => state.askForMicrophone);
  const withdrawMicrophoneRequest = useMicrophoneNoticeStore((state) => state.withdraw);
  useEffect(
    () => () => withdrawMicrophoneRequest(microphoneOwner),
    [withdrawMicrophoneRequest, microphoneOwner],
  );

  return (
    <main
      id="main-content"
      className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10 text-foreground"
    >
      <header className="flex flex-col gap-2">
        <Link href={CODE_PATH} className="text-sm text-muted-foreground hover:text-foreground">
          AGI Code
        </Link>
        <h1 className="text-2xl font-semibold">{HEADING}</h1>
        <p className="text-sm text-muted-foreground">{INTRO}</p>
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="remote-computers-heading">
        <h2 id="remote-computers-heading" className="text-sm font-medium">
          {COMPUTERS_HEADING}
        </h2>
        {computers === null ? (
          <Spinner size="sm" aria-label={COMPUTERS_HEADING} />
        ) : computers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {NO_COMPUTERS}{' '}
            <Link href={DOWNLOAD_PATH} className="underline underline-offset-2">
              Get AGI Cloud for your computer
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {computers.map((computer) => (
              <li key={computer.id} className="text-sm">
                <span className="font-medium">{computer.name}</span>
                <span className="text-muted-foreground">
                  {` · ${PRESENCE_COPY[computer.presence]}`}
                  {computer.acceptsTasks ? '' : ` · ${NEEDS_UPDATE}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {phase === 'connected' ? (
        <section className="flex flex-col gap-3" aria-labelledby="remote-task-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="remote-task-heading" className="text-sm font-medium">
              {`Connected to ${computerName ?? HEADING.toLowerCase()}`}
            </h2>
            <Button type="button" variant="outline" size="sm" onClick={onDisconnect}>
              {DISCONNECT_LABEL}
            </Button>
          </div>
          <label htmlFor="remote-task" className="sr-only">
            {TASK_LABEL}
          </label>
          <Textarea
            id="remote-task"
            value={draft}
            maxLength={REMOTE_CODE_LIMITS.messageLength}
            placeholder={TASK_PLACEHOLDER}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
          />
          <MicrophonePrivacyNotice />
          {dictation.isActive ? (
            <DictationStrip
              status={dictation.status}
              bars={dictation.bars}
              error={dictation.error}
              reducedMotion={dictation.reducedMotion}
              onCancel={dictation.cancel}
              onStop={dictation.stop}
              onSend={dictation.send}
              onRetry={dictation.retry}
            />
          ) : (
            <div className="flex items-center gap-2">
              <Button type="button" disabled={!draft.trim()} onClick={() => void sendTask(draft)}>
                {SEND_LABEL}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={DICTATE_LABEL}
                onClick={() => askForMicrophone(microphoneOwner, dictation.start)}
              >
                <Mic className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </section>
      ) : (
        <section className="flex flex-col gap-3" aria-labelledby="remote-connect-heading">
          <h2 id="remote-connect-heading" className="text-sm font-medium">
            {CONNECT_LABEL}
          </h2>
          <p className="text-sm text-muted-foreground">{HOW_TO_CONNECT}</p>
          {phase === 'idle' ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <label htmlFor="remote-link" className="sr-only">
                {LINK_LABEL}
              </label>
              <input
                id="remote-link"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder={LINK_PLACEHOLDER}
                autoComplete="off"
                spellCheck={false}
                className="min-h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm"
              />
              <Button type="button" disabled={!link.trim()} onClick={onConnect}>
                {CONNECT_LABEL}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner size="sm" />
                <span>{phase === 'away' ? AWAY : CONNECTING}</span>
              </p>
              <Button type="button" variant="outline" size="sm" onClick={onDisconnect}>
                {DISCONNECT_LABEL}
              </Button>
            </div>
          )}
        </section>
      )}

      {error ? (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      ) : null}

      {tasks.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label="Tasks sent to your computer">
          <ul className="flex flex-col gap-3">
            {tasks.map((task) => (
              <li
                key={task.requestId}
                className="flex flex-col gap-1 rounded-lg border border-border p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 text-sm">{task.prompt}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {runStatusLabel(task.status)}
                  </span>
                </div>
                {task.message ? (
                  <p className="text-xs text-muted-foreground">{task.message}</p>
                ) : null}
                {task.result ? <p className="whitespace-pre-wrap text-sm">{task.result}</p> : null}
                {task.error ? <p className="text-sm text-danger-text">{task.error}</p> : null}
                {OPEN_STATUSES.has(task.status) && phase === 'connected' ? (
                  <div className="flex gap-2">
                    {task.unconfirmed ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void connection.current?.resendTask(task.requestId)}
                      >
                        {SEND_AGAIN_LABEL}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void connection.current?.cancelTask(task.requestId, task.taskId)
                      }
                    >
                      {CANCEL_LABEL}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
