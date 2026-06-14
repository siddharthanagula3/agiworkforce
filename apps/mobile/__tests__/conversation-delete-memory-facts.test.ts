import { deleteConversation } from '@/storage/conversations';
import { getDb } from '@/storage/db';

jest.mock('@/storage/db', () => ({
  getDb: jest.fn(),
}));

describe('deleteConversation local memory cleanup', () => {
  it('clears memory fact conversation references before deleting the chat', async () => {
    const runAsync = jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 0 });
    const withTransactionAsync = jest.fn().mockImplementation(async (fn: () => Promise<void>) => {
      await fn();
    });

    (getDb as jest.Mock).mockResolvedValue({
      runAsync,
      withTransactionAsync,
    });

    await deleteConversation('local-conv-1');

    expect(withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(runAsync).toHaveBeenNthCalledWith(
      1,
      'UPDATE memory_facts SET source_conversation_id = NULL WHERE source_conversation_id = ?;',
      ['local-conv-1'],
    );
    expect(runAsync).toHaveBeenNthCalledWith(2, 'DELETE FROM conversations WHERE id = ?;', [
      'local-conv-1',
    ]);
  });
});
