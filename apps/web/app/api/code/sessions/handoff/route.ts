import 'server-only';

import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  CLOUD_CODE_HANDOFF_REFUSED_CODE,
  CloudCodeHandoffRequestSchema,
  admitCloudCodeHandoff,
  buildCloudCodeHandoffSeedPrompt,
  cloudCodeHandoffReceipt,
  describeCloudCodeHandoffRefusal,
  type CloudCodeHandoffRecord,
} from '@agiworkforce/cloud-contracts';
import { SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS } from '@agiworkforce/local-runtime-contract';
import { CLOUD_CODE_LIMITS } from '@agiworkforce/types';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { openCloudCodeSession } from '@/lib/services/cloud-code-session-open';

export const runtime = 'nodejs';

const GITHUB_REMOTE_PATTERNS = [
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/,
  /^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/,
  /^ssh:\/\/git@github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/,
];

function githubRepositoryUrl(remote: string): string | null {
  for (const pattern of GITHUB_REMOTE_PATTERNS) {
    const match = pattern.exec(remote.trim());
    if (match) return `https://github.com/${match[1]}/${match[2]}.git`;
  }
  return null;
}

function accountFingerprint(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 32);
}

function handoffRequestId(userId: string, handoff: CloudCodeHandoffRecord): string {
  const digest = createHash('sha256')
    .update(`${userId}\n${cloudCodeHandoffReceipt(handoff)}`)
    .digest('hex');
  return `handoff-${digest.slice(0, 48)}`;
}

function handoffTitle(handoff: CloudCodeHandoffRecord): string {
  const objective = handoff.objective?.split('\n')[0]?.trim();
  const title = objective && objective.length > 0 ? objective : `Handoff from ${handoff.issuedBy}`;
  return title.length > CLOUD_CODE_LIMITS.title ? title.slice(0, CLOUD_CODE_LIMITS.title) : title;
}

async function handleHandoff(request: NextRequest) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw createError.validation('Invalid JSON request body');
  }
  const parsed = CloudCodeHandoffRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw createError.validation('The handoff record is not one managed Code can read');
  }
  const { handoff, networkAccess, runtimeId, repository } = parsed.data;

  const admitted = admitCloudCodeHandoff(handoff, {
    now: new Date(),
    accountFingerprint: accountFingerprint(userId),
    supportedProtocolVersions: SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS,
  });
  if (!admitted.ok) {
    return NextResponse.json(
      {
        error: {
          message: describeCloudCodeHandoffRefusal(admitted.refusal),
          type: 'invalid_request_error',
          code: CLOUD_CODE_HANDOFF_REFUSED_CODE,
          refusal: admitted.refusal,
        },
      },
      { status: 422 },
    );
  }

  const branch = handoff.workspace.branch ?? null;
  const remote = handoff.workspace.repository;
  const repositoryUrl = !repository && remote ? githubRepositoryUrl(remote) : null;
  if (!repository && remote && !repositoryUrl) {
    throw createError.validation(
      'Managed Code clones repositories from GitHub. Push this repository to GitHub, or keep working locally.',
    );
  }

  const opened = await openCloudCodeSession(
    request,
    db,
    { userId, organizationId },
    {
      requestId: handoffRequestId(userId, handoff),
      title: handoffTitle(handoff),
      networkAccess,
      ...(runtimeId ? { runtimeId } : {}),
      ...(repository
        ? { repository: { ...repository, branch } }
        : repositoryUrl
          ? { repositoryUrl, repositoryBranch: branch }
          : {}),
    },
  );
  if (opened instanceof Response) return opened;

  const response = {
    session: opened,
    start: admitted.admission.start,
    seedPrompt: buildCloudCodeHandoffSeedPrompt(handoff, admitted.admission),
    warnings: handoff.workspace.uncommittedChanges ? ['uncommitted_changes_not_included'] : [],
  };
  return NextResponse.json(response, { status: 201 });
}

export const POST = withErrorHandler(handleHandoff);
