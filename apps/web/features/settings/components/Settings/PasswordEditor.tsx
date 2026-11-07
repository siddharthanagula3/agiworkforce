'use client';

import { useLayoutEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { IdentityCurrentUser } from '@/lib/identity/client';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { createRequestAuthority, type SessionAuthority } from '@/lib/identity/request-authority';
import { isStepUpCancelled } from '@/features/auth/step-up-fetch';
import { toUserMessage } from '@/lib/user-error-message';
import {
  changePasswordSchema,
  type ChangePasswordFormData,
} from '../../schemas/settings-validation';
import {
  useChangePassword,
  PasswordMutationRejectedError,
  type PasswordMutationScope,
} from '../../hooks/use-settings-queries';
import { PasswordPanel } from './TwoFactor';

const resolvePassword = zodResolver(changePasswordSchema);
const passwordResolver: Resolver<ChangePasswordFormData> = (values, context, options) =>
  resolvePassword({ ...values }, context, options);

const UNCERTAIN =
  'We could not confirm the complete password change outcome. Check your sign-in and other sessions in Settings before starting another password change.';

type PasswordPolicy = Pick<IdentityCurrentUser, 'id' | 'hasPassword'>;
type EditorOwner = {
  id: number;
  session: SessionAuthority;
  policy: PasswordPolicy;
  hasPassword: boolean;
  pendingWrite: boolean;
  isCurrent: () => boolean;
};
type PasswordIntent = {
  generation: object;
  phase: 'validating' | 'writing';
  dispatched: boolean;
  scope: PasswordMutationScope;
};
type PasswordFocus = RefObject<(() => void) | null>;

function OwnedPasswordEditor({
  owner,
  focus,
  blocked,
  notice,
  replace,
}: {
  owner: EditorOwner;
  focus: PasswordFocus;
  blocked: boolean;
  notice: string | null;
  replace: (notice?: string | null, blocked?: boolean, passwordEstablished?: boolean) => void;
}) {
  const mutation = useChangePassword();
  const resetMutation = mutation.reset;
  const form = useForm<ChangePasswordFormData>({
    resolver: passwordResolver,
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    mode: 'onBlur',
  });
  const lane = useMemo(
    () => ({
      active: false,
      generation: {} as object,
      intent: null as PasswordIntent | null,
      lastMutation: null as PasswordIntent | null,
    }),
    [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const current = () => lane.active && owner.isCurrent();
  const owns = (intent: PasswordIntent) =>
    current() && lane.intent === intent && lane.generation === intent.generation;

  useLayoutEffect(() => {
    lane.active = true;
    lane.generation = {};
    const open = () => {
      if (lane.active && owner.isCurrent())
        form.setFocus(owner.hasPassword ? 'currentPassword' : 'newPassword');
    };
    focus.current = open;
    let stop: (() => void) | undefined;
    const releaseObservation = () => {
      stop?.();
      stop = undefined;
    };
    const retire = () => {
      lane.active = false;
      owner.pendingWrite = false;
      releaseObservation();
      lane.intent?.scope.request.retire();
      lane.intent = null;
      if (lane.lastMutation) {
        lane.lastMutation = null;
        resetMutation();
      }
      if (focus.current === open) focus.current = null;
    };
    stop = owner.session.subscribe?.(() => {
      if (lane.active && !owner.isCurrent()) {
        retire();
        replace();
      }
    });
    if (!lane.active) releaseObservation();
    return retire;
  }, [focus, form, lane, owner, replace, resetMutation]);

  const release = (intent: PasswordIntent, message: string | null = null) => {
    if (!owns(intent)) return;
    intent.scope.request.retire();
    owner.pendingWrite = false;
    lane.intent = null;
    setBusy(false);
    setError(message);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!current() || blocked || lane.intent) return;
    const draft = { ...form.getValues() };
    const request = createRequestAuthority(
      owner.session,
      () => owns(intent),
      () => {
        if (intent.phase !== 'writing') throw new Error('The password change is not ready.');
        intent.dispatched = true;
        owner.pendingWrite = true;
      },
    );
    const intent: PasswordIntent = {
      generation: lane.generation,
      phase: 'validating',
      dispatched: false,
      scope: {
        request,
        onStepUpRequired: () => {
          if (owns(intent)) {
            intent.dispatched = false;
            owner.pendingWrite = false;
          }
        },
      },
    };
    lane.intent = intent;
    setBusy(true);
    setError(null);
    // The editor, session, intent and values precede RHF's asynchronous resolver.
    void form
      .handleSubmit(
        async () => {
          if (!owns(intent) || !request.isCurrent() || intent.phase !== 'validating') return;
          if (owner.hasPassword && !draft.currentPassword) {
            form.setError('currentPassword', { message: 'Enter your current password' });
            release(intent);
            return;
          }
          intent.phase = 'writing';
          lane.lastMutation = intent;
          try {
            await mutation.mutateAsync({
              scope: intent.scope,
              draft: {
                currentPassword: owner.hasPassword ? (draft.currentPassword ?? null) : null,
                newPassword: draft.newPassword,
                confirmPassword: draft.confirmPassword,
              },
            });
            if (!owns(intent) || !request.isCurrent()) return;
            owner.pendingWrite = false;
            toast.success('Password changed. Your other devices were signed out.');
            replace(null, false, true);
          } catch (cause) {
            if (!owns(intent)) return;
            if (intent.dispatched && !(cause instanceof PasswordMutationRejectedError)) {
              const detail = toUserMessage(cause, '');
              replace(
                detail.startsWith('Your password was changed, but')
                  ? `${detail} ${UNCERTAIN}`
                  : UNCERTAIN,
                true,
              );
            } else
              release(
                intent,
                isStepUpCancelled(cause)
                  ? null
                  : toUserMessage(cause, 'The password could not be changed.'),
              );
          } finally {
            if (lane.lastMutation === intent) {
              lane.lastMutation = null;
              resetMutation();
            }
          }
        },
        () => release(intent),
      )(event)
      .catch((cause: unknown) => {
        release(intent, toUserMessage(cause, 'The password details could not be validated.'));
      });
  };
  const clear = () => {
    if (!current()) return;
    const uncertain = lane.intent?.phase === 'writing' && lane.intent.dispatched;
    replace(uncertain ? UNCERTAIN : notice, Boolean(uncertain || blocked));
  };

  return (
    <>
      <PasswordPanel
        passwordForm={form}
        isChangePasswordPending={busy}
        blocked={blocked}
        hasPassword={owner.hasPassword}
        showNewPassword={showNewPassword}
        showConfirmPassword={showConfirmPassword}
        error={error}
        notice={notice}
        onPasswordSubmit={submit}
        onReset={clear}
        onAcknowledge={() => {
          if (current() && blocked && !lane.intent) replace();
        }}
        onToggleShowNewPassword={() => {
          if (current()) setShowNewPassword((shown) => !shown);
        }}
        onToggleShowConfirmPassword={() => {
          if (current()) setShowConfirmPassword((shown) => !shown);
        }}
      />
      {mutation.stepUpDialog}
    </>
  );
}

export function PasswordEditor({
  active,
  policy,
  focus,
}: {
  active: boolean;
  policy: PasswordPolicy | null;
  focus: PasswordFocus;
}) {
  const capture = useSessionSnapshot();
  const editor = useRef<EditorOwner | null>(null);
  const nextId = useRef(0);
  const [, redraw] = useState(0);
  const view = useRef({
    notice: null as string | null,
    blocked: false,
    session: null as SessionAuthority | null,
  });
  const established = useRef<{ session: SessionAuthority; policy: PasswordPolicy } | null>(null);
  const admission = useRef(active);
  admission.current = active;
  if (
    established.current &&
    (established.current.policy !== policy || !established.current.session.isCurrent())
  ) {
    established.current = null;
  }
  const effectiveHasPassword = policy?.hasPassword === true || established.current !== null;
  if (
    editor.current &&
    (!active ||
      !editor.current.session.isCurrent() ||
      editor.current.policy !== policy ||
      editor.current.hasPassword !== effectiveHasPassword)
  ) {
    const previous = editor.current;
    if (previous.pendingWrite && previous.session.isCurrent()) {
      view.current = { notice: UNCERTAIN, blocked: true, session: previous.session };
    }
    editor.current = null;
  }
  if (active && !editor.current) {
    const session = capture();
    if (session && policy && session.userId === policy.id) {
      const owner: EditorOwner = {
        id: ++nextId.current,
        session,
        policy,
        hasPassword: effectiveHasPassword,
        pendingWrite: false,
        isCurrent: () => admission.current && editor.current === owner && session.isCurrent(),
      };
      editor.current = owner;
    }
  }
  const owner = editor.current;
  const replace = useMemo(
    () =>
      (notice: string | null = null, blocked = false, passwordEstablished = false) => {
        if (editor.current !== owner || !owner) return;
        if (passwordEstablished && owner.isCurrent()) {
          established.current = { session: owner.session, policy: owner.policy };
        }
        owner.pendingWrite = false;
        editor.current = null;
        view.current = { notice, blocked, session: owner.session };
        redraw((revision) => revision + 1);
      },
    [owner],
  );
  if (!active) return null;
  if (!owner)
    return (
      <p role="status">Your account must finish loading before you can manage your password.</p>
    );
  return (
    <OwnedPasswordEditor
      key={owner.id}
      owner={owner}
      focus={focus}
      replace={replace}
      notice={view.current.session?.isCurrent() ? view.current.notice : null}
      blocked={view.current.session?.isCurrent() ? view.current.blocked : false}
    />
  );
}
