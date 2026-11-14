import { Alert } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useVoiceAttachments } from '@/src/features/voice/hooks/useVoiceAttachments';
import { draftIdentityKey } from '@/src/features/chat/draftIdentity';
import { useUploadLifecycleStore } from '@/src/features/chat/upload/uploadLifecycle';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

const photo: Attachment = {
  id: 'photo-1',
  uri: 'file:///photo-1.jpg',
  mimeType: 'image/jpeg',
  fileName: 'photo-1.jpg',
};
const notes: Attachment = {
  id: 'doc-1',
  uri: 'file:///notes.pdf',
  mimeType: 'application/pdf',
  fileName: 'notes.pdf',
};

const LOCAL_CHAT_X = draftIdentityKey('chat-x', { scope: 'local' });

interface HookProps {
  active: boolean;
  scopeKey: string;
}

function setup(initialActive = true, initialScopeKey = LOCAL_CHAT_X) {
  const composer = { current: null as null | { addAttachments: jest.Mock } };
  const onRelease = jest.fn();
  const view = renderHook(
    ({ active, scopeKey }: HookProps) =>
      useVoiceAttachments({
        active,
        scopeKey,
        composerRef: composer as never,
        onRelease,
      }),
    { initialProps: { active: initialActive, scopeKey: initialScopeKey } as HookProps },
  );
  return { ...view, composer, onRelease };
}

describe('useVoiceAttachments', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('holds what the user adds during voice and hands it to the next spoken turn', () => {
    const { result } = setup();
    expect(result.current.beginSend().attachments).toBeUndefined();

    const operation = result.current.activeTarget()?.captureAttachmentOperation('local');
    act(() => operation?.addAttachments([photo, notes]));

    expect(result.current.attachments.map((a) => a.id)).toEqual(['photo-1', 'doc-1']);
    expect(result.current.beginSend().attachments?.map((a) => a.fileName)).toEqual([
      'photo-1.jpg',
      'notes.pdf',
    ]);
  });

  it('offers nothing to send when nothing was added', () => {
    const { result } = setup();
    expect(result.current.beginSend().attachments).toBeUndefined();
  });

  it('keeps a file the turn never handed off, so a failed turn loses nothing', () => {
    const { result } = setup();
    act(() => result.current.activeTarget()?.addAttachments([photo, notes]));

    const send = result.current.beginSend();
    act(() => send.settle());

    expect(result.current.attachments.map((a) => a.id)).toEqual(['photo-1', 'doc-1']);
  });

  it('counts a file as sent when its message is handed off, not when the reply ends', () => {
    const { result } = setup();
    act(() => result.current.activeTarget()?.addAttachments([photo]));

    const send = result.current.beginSend();
    act(() => send.markSent());

    expect(result.current.attachments).toHaveLength(0);
  });

  it('lets the user remove one before speaking', () => {
    const { result } = setup();
    act(() => result.current.activeTarget()?.addAttachments([photo, notes]));

    act(() => result.current.remove('photo-1'));

    expect(result.current.attachments.map((a) => a.id)).toEqual(['doc-1']);
  });

  it('attaches the same file once and says so', () => {
    const { result } = setup();
    act(() => result.current.activeTarget()?.addAttachments([photo]));
    act(() => result.current.activeTarget()?.addAttachments([{ ...photo, id: 'photo-2' }]));

    expect(result.current.attachments).toHaveLength(1);
    expect(alertSpy).toHaveBeenCalledWith(
      'Already attached',
      expect.stringContaining('photo-1.jpg'),
    );
  });

  it('refuses a file the destination cannot take and tells the user why', () => {
    const { result } = setup();
    const huge: Attachment = { ...notes, id: 'doc-big', fileName: 'big.pdf', fileSize: 10 ** 9 };

    act(() => result.current.activeTarget()?.addAttachments([huge]));

    expect(result.current.attachments).toHaveLength(0);
    expect(alertSpy).toHaveBeenCalledWith(
      'Attachment not added',
      expect.stringContaining('big.pdf'),
    );
  });

  it('sends the attachments to the composer when voice ends, so none are lost', () => {
    const { result, rerender, onRelease } = setup();
    act(() => result.current.activeTarget()?.addAttachments([photo]));

    rerender({ active: false, scopeKey: LOCAL_CHAT_X });

    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(onRelease.mock.calls[0][0].map((a: Attachment) => a.id)).toEqual(['photo-1']);
    expect(result.current.attachments).toHaveLength(0);
  });

  it('releases nothing when nothing was added', () => {
    const { rerender, onRelease } = setup();
    rerender({ active: false, scopeKey: LOCAL_CHAT_X });
    expect(onRelease).not.toHaveBeenCalled();
  });

  it('does not hand a sent file back to the composer when the bar exits mid-reply', () => {
    const { result, rerender, onRelease } = setup();
    act(() => result.current.activeTarget()?.addAttachments([photo, notes]));
    const send = result.current.beginSend();
    act(() => send.markSent());
    act(() =>
      result.current
        .activeTarget()
        ?.addAttachments([{ ...notes, id: 'doc-2', uri: 'file:///two.pdf' }]),
    );

    rerender({ active: false, scopeKey: LOCAL_CHAT_X });
    act(() => send.settle());

    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(onRelease.mock.calls[0][0].map((a: Attachment) => a.id)).toEqual(['doc-2']);
  });

  it('holds a file whose message is still being handed off when the bar exits, then sends it once', () => {
    const { result, rerender, onRelease } = setup();
    act(() => result.current.activeTarget()?.addAttachments([photo]));
    const send = result.current.beginSend();

    rerender({ active: false, scopeKey: LOCAL_CHAT_X });
    expect(onRelease).not.toHaveBeenCalled();

    act(() => send.markSent());
    act(() => send.settle());

    expect(onRelease).not.toHaveBeenCalled();
    expect(result.current.attachments).toHaveLength(0);
  });

  it('hands a file back to the composer when its message failed after the bar exited', () => {
    const { result, rerender, onRelease } = setup();
    act(() => result.current.activeTarget()?.addAttachments([photo]));
    const send = result.current.beginSend();

    rerender({ active: false, scopeKey: LOCAL_CHAT_X });
    act(() => send.settle());

    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(onRelease.mock.calls[0][0].map((a: Attachment) => a.id)).toEqual(['photo-1']);
    expect(result.current.attachments).toHaveLength(0);
  });

  it('hands an unsent file back when the bar exits', () => {
    const { result, rerender, onRelease } = setup();
    act(() => result.current.activeTarget()?.addAttachments([photo]));

    rerender({ active: false, scopeKey: LOCAL_CHAT_X });

    expect(onRelease.mock.calls[0][0].map((a: Attachment) => a.id)).toEqual(['photo-1']);
  });

  describe('scope', () => {
    const cases: Array<[string, string]> = [
      ['the chat changes', draftIdentityKey('chat-y', { scope: 'local' })],
      ['the mode changes', draftIdentityKey('chat-x', { scope: 'cloud', ownerId: 'user-1' })],
    ];

    it.each(cases)('drops the list, and releases none of it, when %s', (_label, nextScope) => {
      const { result, rerender, onRelease } = setup();
      act(() => result.current.activeTarget()?.addAttachments([photo, notes]));

      rerender({ active: true, scopeKey: nextScope });

      expect(result.current.attachments).toHaveLength(0);
      expect(result.current.beginSend().attachments).toBeUndefined();
      expect(onRelease).not.toHaveBeenCalled();
    });

    it('drops the list when the signed-in account changes', () => {
      const cloudChat = draftIdentityKey('chat-x', { scope: 'cloud', ownerId: 'user-1' });
      const { result, rerender, onRelease } = setup(true, cloudChat);
      act(() => result.current.activeTarget()?.addAttachments([photo]));

      rerender({
        active: true,
        scopeKey: draftIdentityKey('chat-x', { scope: 'cloud', ownerId: 'user-2' }),
      });

      expect(result.current.attachments).toHaveLength(0);
      expect(onRelease).not.toHaveBeenCalled();
    });

    it('keeps the list while the scope is unchanged', () => {
      const { result, rerender } = setup();
      act(() => result.current.activeTarget()?.addAttachments([photo]));

      rerender({ active: true, scopeKey: LOCAL_CHAT_X });

      expect(result.current.attachments).toHaveLength(1);
    });

    it('drops files that were being sent for the old scope, and never releases them later', () => {
      const { result, rerender, onRelease } = setup();
      act(() => result.current.activeTarget()?.addAttachments([photo]));
      const send = result.current.beginSend();

      rerender({ active: false, scopeKey: draftIdentityKey('chat-y', { scope: 'local' }) });
      act(() => send.settle());

      expect(onRelease).not.toHaveBeenCalled();
      expect(result.current.attachments).toHaveLength(0);
    });

    it('cancels the uploads of the files it drops', () => {
      const clear = jest.spyOn(useUploadLifecycleStore.getState(), 'clear');
      const { result, rerender } = setup();
      act(() => result.current.activeTarget()?.addAttachments([photo]));

      rerender({ active: true, scopeKey: draftIdentityKey('chat-y', { scope: 'local' }) });

      expect(clear).toHaveBeenCalledWith('photo-1');
      clear.mockRestore();
    });

    it('refuses a pick that finishes after the scope changed', () => {
      const { result, rerender } = setup();
      const operation = result.current.activeTarget()?.captureAttachmentOperation('local');

      rerender({ active: true, scopeKey: draftIdentityKey('chat-y', { scope: 'local' }) });

      expect(operation?.isCurrent()).toBe(false);
      act(() => operation?.addAttachments([photo]));
      expect(result.current.attachments).toHaveLength(0);
    });
  });

  it('targets the composer when voice is off and the voice list while it is on', () => {
    const { result, rerender, composer } = setup(false);
    const composerHandle = { addAttachments: jest.fn() };
    composer.current = composerHandle;
    expect(result.current.activeTarget()).toBe(composerHandle);

    rerender({ active: true, scopeKey: LOCAL_CHAT_X });
    expect(result.current.activeTarget()).not.toBe(composerHandle);
  });

  it('drops a pick that finishes after voice ended', () => {
    const { result, rerender, onRelease } = setup();
    const operation = result.current.activeTarget()?.captureAttachmentOperation('local');
    expect(operation?.isCurrent()).toBe(true);

    rerender({ active: false, scopeKey: LOCAL_CHAT_X });

    expect(operation?.isCurrent()).toBe(false);
    act(() => operation?.addAttachments([photo]));
    expect(result.current.attachments).toHaveLength(0);
    expect(onRelease).not.toHaveBeenCalled();
  });

  it('takes no pick for a mode other than the one the chat is in', () => {
    const { result } = setup();
    expect(result.current.activeTarget()?.captureAttachmentOperation('cloud')).toBeNull();
  });
});
