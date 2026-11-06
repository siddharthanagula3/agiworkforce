'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  useConfirmAction,
} from '@agiworkforce/ui';
import { useEmailAddressVerification } from '@/lib/identity/client';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { createRequestAuthority, type RequestAuthority, type SessionAuthority } from '@/lib/identity/request-authority';
import { getCsrfToken } from '@/lib/client/csrf';
import { classifyAuthError } from '@/lib/auth/error-taxonomy';
import { useAuthCopy } from '@/features/auth/authCopy';
import { isStepUpCancelled } from '@/features/auth/step-up-fetch';
import { useStepUp } from '@features/settings/hooks/useStepUp';
import { toUserMessage } from '@/lib/user-error-message';

const ENDPOINT = '/api/settings/email';
const addressSchema = z.string().trim().email().max(254);
const addedSchema = z.object({ emailAddressId: z.string().trim().min(1).max(255), verified: z.boolean() });
const primarySchema = z.object({ emailAddress: addressSchema, previousAddressRemoved: z.boolean() });
const UNCERTAIN = 'We could not confirm the complete email change outcome. An address may have been added, removed, or made primary. Check your account email and sign-in methods before starting another change.';

type Address = { emailAddressId: string; emailAddress: string };
type Stage =
  | { name: 'address' }
  | ({ name: 'code'; sent: boolean } & Address)
  | ({ name: 'confirmed' } & Address)
  | { name: 'done'; emailAddress: string; previousAddressRemoved: boolean; refreshing: boolean; refreshFailed: boolean };
type EditorOwner = { id: number; session: SessionAuthority; request: RequestAuthority | null; pendingWrite: boolean; isCurrent: () => boolean };
type EmailIntent = {
  generation: object;
  request: RequestAuthority;
  phase: 'adding' | 'sending' | 'verifying' | 'confirming' | 'promoting' | 'refreshing';
  dispatched: boolean;
  nativeDispatched: boolean;
};

export interface EmailAddressChangeCompletion {
  readonly userId: string;
  readonly isCurrent: () => boolean;
}

interface EmailAddressChangeProps {
  active: boolean;
  accountId: string | null;
  currentEmail: string | null;
  onChanged: (emailAddress: string, completion: EmailAddressChangeCompletion) => void;
  onClose: () => void;
}

async function readFailure(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string | { message?: string };
  } | null;
  const message = typeof body?.error === 'string' ? body.error : (body?.error?.message ?? '');
  return toUserMessage(Object.assign(new Error(message), { status: response.status }), fallback);
}

function OwnedEmailAddressChange({ owner, currentEmail, onChanged, onClose, blocked, notice, replace }: {
  owner: EditorOwner;
  currentEmail: string | null;
  onChanged: EmailAddressChangeProps['onChanged'];
  onClose: () => void;
  blocked: boolean;
  notice: string | null;
  replace: (notice?: string | null, blocked?: boolean) => void;
}) {
  const verification = useEmailAddressVerification();
  const copy = useAuthCopy();
  const { withStepUp, dialog: stepUpDialog } = useStepUp();
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [stage, setStage] = useState<Stage>({ name: 'address' });
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lane = useMemo(() => ({ active: false, generation: {} as object, intent: null as EmailIntent | null }), []);
  const rendered = {};
  const latestRender = useRef(rendered);
  latestRender.current = rendered;
  const current = () => lane.active && owner.isCurrent();
  const acceptsEvent = () => current() && latestRender.current === rendered;
  const owns = (intent: EmailIntent) => current() && lane.intent === intent && lane.generation === intent.generation;

  useLayoutEffect(() => {
    lane.active = true;
    lane.generation = {};
    let stop: (() => void) | undefined;
    const releaseObservation = () => { stop?.(); stop = undefined; };
    const retire = () => {
      lane.active = false;
      releaseObservation();
      lane.intent?.request.retire();
      lane.intent = null;
    };
    stop = owner.session.subscribe?.(() => {
      if (lane.active && !owner.isCurrent()) { retire(); replace(); }
    });
    if (!lane.active) releaseObservation();
    return retire;
  }, [lane, owner, replace]);

  const describe = (cause: unknown, fallback: string): string => {
    const descriptor = classifyAuthError(cause);
    if (descriptor.vendorMessage) return descriptor.vendorMessage;
    if (descriptor.kind === 'unexpected') return toUserMessage(cause, fallback);
    return copy.errorCopy(descriptor.kind).message;
  };
  const release = (intent: EmailIntent) => {
    if (!owns(intent)) return;
    intent.request.retire();
    lane.intent = null;
    owner.request = null;
    owner.pendingWrite = false;
    setBusy(false);
  };
  const run = async (intent: EmailIntent, work: () => Promise<void>, fallback: string) => {
    try {
      intent.request.assertCurrent();
      await work();
    } catch (cause) {
      if (!owns(intent)) return;
      if (intent.dispatched) replace(UNCERTAIN, true);
      else if (!isStepUpCancelled(cause)) {
        const message = describe(cause, fallback);
        setError(intent.nativeDispatched
          ? `${message} ${intent.phase === 'sending' ? 'Code delivery' : 'Address verification'} was not confirmed. You can try the code step again; no primary-address change was requested.`
          : message);
      }
    } finally {
      if (owns(intent) && intent.phase !== 'confirming') release(intent);
    }
  };
  const open = (phase: EmailIntent['phase']): EmailIntent | null => {
    if (!current() || blocked || lane.intent) return null;
    const request = createRequestAuthority(owner.session, () => owns(intent), () => {
      if (intent.phase !== 'adding' && intent.phase !== 'promoting') throw new Error('The email change is no longer ready.');
      intent.dispatched = true;
      owner.pendingWrite = true;
    });
    const intent: EmailIntent = { generation: lane.generation, request, phase, dispatched: false, nativeDispatched: false };
    lane.intent = intent;
    owner.request = request;
    setBusy(true);
    setError(null);
    return intent;
  };
  const scope = (intent: EmailIntent, emailAddress: string) => ({
    authority: intent.request,
    emailAddress,
    onDispatch: () => { intent.request.assertCurrent(); intent.nativeDispatched = true; },
  });
  const send = async (intent: EmailIntent, method: 'POST' | 'PATCH', body: { emailAddress: string } | { emailAddressId: string }) => {
    intent.request.assertCurrent();
    const serialized = JSON.stringify(body);
    const response = await withStepUp(async (headers) => {
      intent.request.assertCurrent();
      const csrfToken = await getCsrfToken();
      intent.request.assertCurrent();
      return intent.request.fetch(ENDPOINT, { method, body: serialized, headers: {
        'Content-Type': 'application/json', 'x-csrf-token': csrfToken, ...headers,
      } });
    }, method === 'PATCH' && 'emailAddressId' in body ? body.emailAddressId : null, {
      authority: intent.request,
      onStepUpRequired: () => {
        if (owns(intent)) { intent.dispatched = false; owner.pendingWrite = false; }
      },
    });
    intent.request.assertCurrent();
    if (!response.ok) {
      const message = await readFailure(response, 'The email change could not be completed.');
      intent.request.assertCurrent();
      throw new Error(message);
    }
    return response;
  };
  const makePrimary = async (intent: EmailIntent, address: Address) => {
    await verification.requireVerified(address.emailAddressId, scope(intent, address.emailAddress));
    intent.request.assertCurrent();
    const response = await send(intent, 'PATCH', { emailAddressId: address.emailAddressId });
    const body: unknown = await response.json();
    intent.request.assertCurrent();
    const result = primarySchema.parse(body);
    if (result.emailAddress.toLowerCase() !== address.emailAddress.toLowerCase()) {
      throw new Error('The email change receipt did not match the submitted address.');
    }
    intent.dispatched = false;
    owner.pendingWrite = false;
    intent.phase = 'refreshing';
    const done: Stage = { name: 'done', ...result, refreshing: true, refreshFailed: false };
    setStage(done);
    onChanged(result.emailAddress, { userId: owner.session.userId, isCurrent: intent.request.isCurrent });
    intent.request.assertCurrent();
    try {
      await verification.refresh(intent.request);
      intent.request.assertCurrent();
      setStage({ ...done, refreshing: false });
    } catch {
      if (owns(intent)) setStage({ ...done, refreshing: false, refreshFailed: true });
    }
  };
  const confirmPrimary = (intent: EmailIntent, address: Address) => {
    intent.request.assertCurrent();
    intent.phase = 'confirming';
    setValue('');
    setStage({ name: 'confirmed', ...address });
    confirm({
      title: 'Use this email address?',
      description: `Password resets and security notices will go to ${address.emailAddress}. Your previous email address may be removed from this account.`,
      confirmLabel: 'Change address',
      destructive: false,
      onCancel: () => { if (owns(intent) && intent.phase === 'confirming') release(intent); },
      onConfirm: () => {
        if (!owns(intent) || intent.phase !== 'confirming') return;
        intent.phase = 'promoting';
        return run(intent, () => makePrimary(intent, address), 'Your email address could not be changed.');
      },
    });
  };
  const sendCode = async (intent: EmailIntent, address: Address) => {
    intent.phase = 'sending';
    await verification.sendCode(address.emailAddressId, scope(intent, address.emailAddress));
    intent.request.assertCurrent();
    intent.nativeDispatched = false;
    setStage({ name: 'code', ...address, sent: true });
  };
  const submit = () => {
    if (!acceptsEvent()) return;
    const entered = value.trim();
    if (stage.name === 'done' || (stage.name !== 'confirmed' && !entered)) return;
    const submittedStage = { ...stage };
    const intent = open(submittedStage.name === 'address' ? 'adding' : submittedStage.name === 'code' ? 'verifying' : 'confirming');
    if (!intent) return;
    void run(intent, async () => {
      if (submittedStage.name === 'address') {
        const validated = addressSchema.safeParse(entered);
        if (!validated.success) throw new Error('Enter a valid email address.');
        const emailAddress = validated.data;
        const response = await send(intent, 'POST', { emailAddress });
        const body: unknown = await response.json();
        intent.request.assertCurrent();
        const added = addedSchema.parse(body);
        intent.dispatched = false;
        owner.pendingWrite = false;
        const address = { emailAddressId: added.emailAddressId, emailAddress };
        setValue('');
        if (added.verified) { confirmPrimary(intent, address); return; }
        setStage({ name: 'code', ...address, sent: false });
        await sendCode(intent, address);
      } else {
        if (submittedStage.name === 'code') {
          await verification.verifyCode(submittedStage.emailAddressId, entered, scope(intent, submittedStage.emailAddress));
          intent.request.assertCurrent();
          intent.nativeDispatched = false;
        }
        confirmPrimary(intent, submittedStage);
      }
    }, 'The email change could not be completed.');
  };
  const resend = () => {
    if (!acceptsEvent() || stage.name !== 'code') return;
    const address = { emailAddressId: stage.emailAddressId, emailAddress: stage.emailAddress };
    const intent = open('sending');
    if (intent) void run(intent, () => sendCode(intent, address), 'A new code could not be sent.');
  };
  const close = () => {
    if (!acceptsEvent()) return;
    replace(owner.pendingWrite ? UNCERTAIN : notice, owner.pendingWrite || blocked);
    onClose();
  };
  const ready = !blocked && (stage.name === 'confirmed' || value.trim().length > 0);

  return <>
    <Dialog open onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="border-border bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-foreground">Change email address</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {stage.name === 'done' ? `Your account now uses ${stage.emailAddress}.`
              : `Password resets and security notices go to the new address. Current address: ${currentEmail ?? 'none'}.`}
          </DialogDescription>
        </DialogHeader>
        {notice ? <p role="status" className="text-sm text-foreground">{notice}</p> : null}
        {blocked ? <Button type="button" variant="outline" onClick={() => { if (acceptsEvent() && !lane.intent) replace(); }}>
          I checked my account email
        </Button> : stage.name === 'done' ? <>
          {!stage.previousAddressRemoved ? <p className="text-sm text-foreground">The server reported that your previous address was kept. Check your sign-in methods before removing it.</p> : null}
          {stage.refreshing ? <p role="status" className="text-sm text-muted-foreground">Refreshing account details…</p> : null}
          {stage.refreshFailed ? <p role="status" className="text-sm text-foreground">Your email was changed, but account details could not refresh. Reload Settings to see the latest details.</p> : null}
        </> : stage.name === 'confirmed' ? <p className="text-sm text-foreground">
          {stage.emailAddress} is ready for confirmation. Change address to start using it.
        </p> : <div className="space-y-2">
          <label htmlFor="email-change-input" className="text-sm font-medium text-foreground">
            {stage.name === 'address' ? 'New email address' : `${stage.sent ? 'Code sent to' : 'Verification code for'} ${stage.emailAddress}`}
          </label>
          <Input id="email-change-input" type={stage.name === 'address' ? 'email' : 'text'}
            inputMode={stage.name === 'address' ? 'email' : 'numeric'}
            autoComplete={stage.name === 'address' ? 'email' : 'one-time-code'} value={value} disabled={busy}
            onChange={(event) => { if (acceptsEvent() && !lane.intent) setValue(event.target.value); }}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } }}
            className="border-border bg-background text-foreground" />
          {stage.name === 'code' ? <button type="button" disabled={busy} onClick={resend}
            className="text-sm text-foreground underline underline-offset-2 disabled:opacity-50">Send a new code</button> : null}
        </div>}
        {error ? <p role="alert" className="text-sm text-danger-text">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant={stage.name === 'done' ? 'default' : 'outline'} onClick={close}>
            {stage.name === 'done' ? 'Done' : busy ? 'Cancel waiting' : 'Cancel'}
          </Button>
          {stage.name !== 'done' && !blocked ? <Button type="button" disabled={busy || !ready} onClick={submit}>
            {busy ? <Spinner size="sm" className="me-2" aria-label="Working" /> : null}
            {stage.name === 'address' ? 'Send code' : 'Change address'}
          </Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {lane.intent?.phase === 'confirming' ? confirmDialog : null}
    {stepUpDialog}
  </>;
}

export function EmailAddressChange({ active, accountId, currentEmail, onChanged, onClose }: EmailAddressChangeProps) {
  const capture = useSessionSnapshot();
  const editor = useRef<EditorOwner | null>(null);
  const fallback = useRef<object | null>(null);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const nextId = useRef(0);
  const [, redraw] = useState(0);
  const admission = useRef({ active, accountId });
  admission.current = { active, accountId };
  const view = useRef({ notice: null as string | null, blocked: false, session: null as SessionAuthority | null });
  if (editor.current && (!active || !editor.current.isCurrent())) {
    const previous = editor.current;
    if (previous.pendingWrite && previous.session.isCurrent()) {
      view.current = { notice: UNCERTAIN, blocked: true, session: previous.session };
    }
    editor.current = null;
  }
  if (active && !editor.current) {
    const session = capture();
    if (session && accountId === session.userId) {
      const owner: EditorOwner = { id: ++nextId.current, session, request: null, pendingWrite: false,
        isCurrent: () => admission.current.active && admission.current.accountId === session.userId &&
          editor.current === owner && session.isCurrent() };
      editor.current = owner;
    }
  }
  const owner = editor.current;
  const replace = useMemo(() => (notice: string | null = null, blocked = false) => {
    if (!owner || editor.current !== owner) return;
    owner.request?.retire();
    owner.pendingWrite = false;
    editor.current = null;
    view.current = { notice, blocked, session: owner.session };
    redraw((revision) => revision + 1);
  }, [owner]);
  if (!active || owner) fallback.current = null;
  if (!active) return null;
  if (!owner) {
    const admissionId = {};
    fallback.current = admissionId;
    const close = () => {
      if (!mounted.current || !admission.current.active || editor.current || fallback.current !== admissionId) return;
      fallback.current = null;
      onClose();
    };
    return <Dialog open onOpenChange={(next) => { if (!next) close(); }}>
    <DialogContent><DialogHeader><DialogTitle>Change email address</DialogTitle>
      <DialogDescription>Your account must finish loading before you can change your email address.</DialogDescription>
    </DialogHeader><DialogFooter><Button onClick={close}>Close</Button></DialogFooter></DialogContent>
    </Dialog>;
  }
  return <OwnedEmailAddressChange key={owner.id} owner={owner} currentEmail={currentEmail} onChanged={onChanged}
    onClose={onClose} replace={replace} notice={view.current.session?.isCurrent() ? view.current.notice : null}
    blocked={view.current.session?.isCurrent() ? view.current.blocked : false} />;
}
