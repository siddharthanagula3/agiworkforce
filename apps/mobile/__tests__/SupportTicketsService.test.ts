const mockGet = jest.fn();

jest.mock('@/services/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args), post: jest.fn() },
}));

jest.mock('@/src/features/settings/diagnostics', () => ({
  collectMobileDiagnostics: jest.fn(),
}));

import { listSupportTickets } from '../src/features/support/service';

const TICKET = {
  id: 't1',
  subject: 'Export never arrives',
  message: 'm',
  status: 'open',
  createdAt: '2026-09-14T10:00:00.000Z',
  updatedAt: '2026-09-16T10:00:00.000Z',
};

describe('listSupportTickets', () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks for the first window without an offset and reads the continuation', async () => {
    mockGet.mockResolvedValue({ tickets: [TICKET], nextOffset: 50 });

    const page = await listSupportTickets();

    expect(mockGet).toHaveBeenCalledWith('/api/support/tickets', undefined);
    expect(page).toEqual({ tickets: [TICKET], nextOffset: 50 });
  });

  it('asks for the window that starts at the offset it was given', async () => {
    mockGet.mockResolvedValue({ tickets: [TICKET] });

    const page = await listSupportTickets(undefined, 50);

    expect(mockGet).toHaveBeenCalledWith('/api/support/tickets?offset=50', undefined);
    expect(page.nextOffset).toBeNull();
  });

  it('ignores a continuation that does not move forward', async () => {
    mockGet.mockResolvedValue({ tickets: [TICKET], nextOffset: 50 });

    const page = await listSupportTickets(undefined, 50);

    expect(page.nextOffset).toBeNull();
  });
});
