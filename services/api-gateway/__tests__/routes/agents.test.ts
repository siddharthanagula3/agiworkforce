import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../src/middleware/errorHandler';
import { agentsRouter } from '../../src/routes/agents';

const testState = vi.hoisted(() => {
  process.env['JWT_SECRET'] = process.env['JWT_SECRET'] ?? 'agents-route-test-secret';

  const desktopEq = vi.fn();
  const desktopSingle = vi.fn();
  const desktopSelect = vi.fn();
  const approvalUpdate = vi.fn();
  const approvalEq = vi.fn();
  const approvalSelect = vi.fn();
  const profileEq = vi.fn();
  const profileSingle = vi.fn();
  const profileSelect = vi.fn();
  const from = vi.fn();
  const sendCommandToDesktop = vi.fn();

  return {
    desktopEq,
    desktopSingle,
    desktopSelect,
    approvalUpdate,
    approvalEq,
    approvalSelect,
    profileEq,
    profileSingle,
    profileSelect,
    from,
    sendCommandToDesktop,
  };
});

vi.mock('../../src/lib/neonClients', () => {
  const desktopQuery = {
    eq: testState.desktopEq,
    single: testState.desktopSingle,
  };
  testState.desktopEq.mockReturnValue(desktopQuery);
  testState.desktopSelect.mockReturnValue(desktopQuery);

  const approvalUpdateQuery = {
    eq: testState.approvalEq,
    select: testState.approvalSelect,
  };
  testState.approvalEq.mockReturnValue(approvalUpdateQuery);

  const profileQuery = {
    eq: testState.profileEq,
    single: testState.profileSingle,
  };
  testState.profileEq.mockReturnValue(profileQuery);
  testState.profileSelect.mockReturnValue(profileQuery);

  // Canonical profile/device reads use the user-scoped client. The unowned
  // approval compatibility table uses the explicit system client.
  const serviceClient = {
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return { select: testState.profileSelect };
      }
      return testState.from(table);
    }),
  };

  return {
    getUserScopedClient: vi.fn(() => serviceClient),
    getSystemClient: vi.fn(() => serviceClient),
  };
});

vi.mock('../../src/websocket', () => ({
  sendCommandToDesktop: testState.sendCommandToDesktop,
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const DESKTOP_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';

function createToken(): string {
  return jwt.sign(
    {
      userId: USER_ID,
      email: 'test@example.com',
      role: 'user',
    },
    process.env['JWT_SECRET'] as string,
    {
      algorithm: 'HS256',
      issuer: 'agiworkforce-api-gateway',
      audience: 'agiworkforce',
    },
  );
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/agents', agentsRouter);
  app.use(errorHandler);
  return app;
}

function configureDbMocks(updatedRows: Array<{ id: string }> = [{ id: REQUEST_ID }]) {
  testState.profileSingle.mockResolvedValue({
    data: { account_status: 'active' },
    error: null,
  });
  testState.desktopSingle.mockResolvedValue({
    data: { id: DESKTOP_ID, user_id: USER_ID },
    error: null,
  });
  testState.approvalUpdate.mockReturnValue({
    eq: testState.approvalEq,
  });
  testState.approvalSelect.mockResolvedValue({
    data: updatedRows,
    error: null,
  });
  testState.from.mockImplementation((table: string) => {
    if (table === 'desktop_devices') {
      return { select: testState.desktopSelect };
    }
    if (table === 'agent_approval_requests') {
      return { update: testState.approvalUpdate };
    }
    throw new Error(`Unexpected table ${table}`);
  });
  testState.sendCommandToDesktop.mockReturnValue({ delivered: true, queued: false });
}

describe('agentsRouter approval actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureDbMocks();
  });

  it('selects the updated row before treating an approval as successful', async () => {
    const response = await request(createApp())
      .post('/api/agents/approve')
      .set('Authorization', `Bearer ${createToken()}`)
      .send({ desktopId: DESKTOP_ID, requestId: REQUEST_ID });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      requestId: REQUEST_ID,
      status: 'delivered',
    });
    expect(testState.approvalSelect).toHaveBeenCalledWith('id');
    expect(testState.sendCommandToDesktop).toHaveBeenCalledWith(
      USER_ID,
      DESKTOP_ID,
      REQUEST_ID,
      'agent_approved',
      { requestId: REQUEST_ID, action: 'approve' },
    );
  });

  it('selects the updated row before treating a denial as successful', async () => {
    const response = await request(createApp())
      .post('/api/agents/deny')
      .set('Authorization', `Bearer ${createToken()}`)
      .send({ desktopId: DESKTOP_ID, requestId: REQUEST_ID, reason: 'No' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      requestId: REQUEST_ID,
      status: 'delivered',
    });
    expect(testState.approvalSelect).toHaveBeenCalledWith('id');
    expect(testState.sendCommandToDesktop).toHaveBeenCalledWith(
      USER_ID,
      DESKTOP_ID,
      REQUEST_ID,
      'agent_denied',
      { requestId: REQUEST_ID, action: 'deny', reason: 'No' },
    );
  });

  it('does not send a desktop command when no pending request row was updated', async () => {
    configureDbMocks([]);

    const response = await request(createApp())
      .post('/api/agents/approve')
      .set('Authorization', `Bearer ${createToken()}`)
      .send({ desktopId: DESKTOP_ID, requestId: REQUEST_ID });

    expect(response.status).toBe(404);
    expect(testState.sendCommandToDesktop).not.toHaveBeenCalled();
  });
});
