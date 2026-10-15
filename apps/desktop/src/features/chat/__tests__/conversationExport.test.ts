import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  writeTextFile: vi.fn(),
  invoke: vi.fn(),
  getCloudMessages: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  mode: 'local' as 'local' | 'cloud',
  dbId: 12 as number | undefined,
  conversation: { id: 'chat-1', title: 'Q4: plan / review', incognito: false } as Record<
    string,
    unknown
  >,
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeTextFile: mocks.writeTextFile }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));
vi.mock('../../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke: mocks.invoke,
}));
vi.mock('../../../services/cloudChat', async (importOriginal) => ({
  ...(await importOriginal<CloudchatModule>()),
  getCloudMessages: mocks.getCloudMessages,
}));
vi.mock('../../../stores/appModeStore', async (importOriginal) => ({
  ...(await importOriginal<AppmodestoreModule>()),
  selectPrivacyMode: (state: { mode: string }) => (state.mode === 'local' ? 'local' : 'managed'),
  useAppModeStore: { getState: () => ({ mode: mocks.mode }), subscribe: () => () => {} },
}));
vi.mock('../../../stores/chat/chatStore', async (importOriginal) => ({
  ...(await importOriginal<ChatstoreModule>()),
  resolveDesktopChatOwnerId: () => 'local-desktop-user',
  useChatStore: { getState: () => ({ conversations: [mocks.conversation] }) },
  uuidToDbId: () => mocks.dbId,
}));

import {
  conversationExportFormats,
  conversationMarkdown,
  exportConversation,
  exportFileStem,
} from '../conversationExport';

type TauriMockModule = typeof import('../../../lib/tauri-mock');
type CloudchatModule = typeof import('../../../services/cloudChat');
type AppmodestoreModule = typeof import('../../../stores/appModeStore');
type ChatstoreModule = typeof import('../../../stores/chat/chatStore');

describe('conversation export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mode = 'local';
    mocks.dbId = 12;
    mocks.conversation = { id: 'chat-1', title: 'Q4: plan / review', incognito: false };
  });

  it('names the file from the title without path separators', () => {
    expect(exportFileStem('Q4: plan / review')).toBe('Q4 plan review');
    expect(exportFileStem('   ')).toBe('Conversation');
  });

  it('offers PDF only for stored Local chats', () => {
    expect(conversationExportFormats('local', false)).toEqual(['markdown', 'pdf']);
    expect(conversationExportFormats('local', true)).toEqual(['markdown']);
    expect(conversationExportFormats('managed', false)).toEqual(['markdown']);
  });

  it('writes the native Markdown export of a Local chat where the user chose', async () => {
    mocks.save.mockResolvedValue('/Users/me/Q4.md');
    mocks.invoke.mockResolvedValue('# Q4\n\n## User\n\nhi\n\n---\n\n');

    await expect(exportConversation('chat-1', 'markdown')).resolves.toBe(true);

    expect(mocks.save).toHaveBeenCalledWith({
      defaultPath: 'Q4 plan review.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    expect(mocks.invoke).toHaveBeenCalledWith('conversation_export', {
      conversationId: '12',
      format: 'markdown',
      userId: 'local-desktop-user',
    });
    expect(mocks.writeTextFile).toHaveBeenCalledWith(
      '/Users/me/Q4.md',
      expect.stringMatching(/^# Q4/),
    );
  });

  it('asks the native runtime to render a PDF at the chosen path', async () => {
    mocks.save.mockResolvedValue('/Users/me/Q4.pdf');

    await exportConversation('chat-1', 'pdf');

    expect(mocks.invoke).toHaveBeenCalledWith('conversation_export_pdf', {
      conversationId: '12',
      outputPath: '/Users/me/Q4.pdf',
      userId: 'local-desktop-user',
    });
    expect(mocks.writeTextFile).not.toHaveBeenCalled();
  });

  it('writes nothing when the save dialog is cancelled', async () => {
    mocks.save.mockResolvedValue(null);

    await expect(exportConversation('chat-1', 'markdown')).resolves.toBe(false);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('exports a Managed Cloud chat from the account, never from SQLite', async () => {
    mocks.mode = 'cloud';
    mocks.dbId = undefined;
    mocks.save.mockResolvedValue('/Users/me/cloud.md');
    mocks.getCloudMessages.mockResolvedValue([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ]);

    await exportConversation('chat-1', 'markdown');

    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.writeTextFile).toHaveBeenCalledWith(
      '/Users/me/cloud.md',
      conversationMarkdown('Q4: plan / review', [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
      ]),
    );
  });

  it('refuses a temporary chat and says why', async () => {
    mocks.conversation = { id: 'chat-1', title: 'Temporary chat', incognito: true };

    await expect(exportConversation('chat-1', 'markdown')).resolves.toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith('Could not export this chat', {
      description: expect.stringMatching(/not saved/),
    });
  });
});
