import { NextRequest, NextResponse } from 'next/server';

import { AgentFileListResponseSchema, AgentFileSchema } from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { agentFileName, agentFileText } from '@/lib/agents/agent-file-text';
import {
  openAgentRead,
  openAgentWrite,
  readAgentId,
  type AgentRouteContext,
} from '@/lib/agents/agent-route';
import { PayloadCeilingExceededError } from '@/lib/payload-ceiling';
import { refuseUnsafeUpload } from '@/lib/security/upload-scan';
import {
  addAgentFile,
  listAgentFiles,
  requireOwnedAgent,
  requireReadableAgent,
} from '@/lib/services/custom-agent-service';

export const runtime = 'nodejs';

const FILE_FIELD = 'file';
const OCTET_STREAM = 'application/octet-stream';

async function handleList(request: NextRequest, context: AgentRouteContext) {
  const agentId = await readAgentId(context);
  const opened = await openAgentRead(request);
  if ('limited' in opened) return opened.limited;
  const { db } = opened.scope;
  await requireReadableAgent(db, agentId);
  return NextResponse.json(
    AgentFileListResponseSchema.parse({ files: await listAgentFiles(db, agentId) }),
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

async function handleUpload(request: NextRequest, context: AgentRouteContext) {
  const agentId = await readAgentId(context);
  const opened = await openAgentWrite(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  await requireOwnedAgent(db, userId, agentId);
  let form: FormData;
  try {
    form = (await request.formData()) as unknown as FormData;
  } catch (error) {
    if (error instanceof PayloadCeilingExceededError) throw error;
    throw createError.validation('Choose a file to add.');
  }
  const file = form.get(FILE_FIELD);
  if (!file || typeof file === 'string') throw createError.validation('Choose a file to add.');
  const name = agentFileName('name' in file && typeof file.name === 'string' ? file.name : '');
  const declaredMime = file.type || OCTET_STREAM;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await refuseUnsafeUpload(bytes, declaredMime, { leadsObject: true, filename: name });
  const text = await agentFileText(bytes, name, declaredMime);
  const saved = await addAgentFile(db, userId, agentId, {
    name,
    mimeType: text.mimeType,
    content: text.content,
  });
  return NextResponse.json({ file: AgentFileSchema.parse(saved) }, { status: 201 });
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleUpload);
