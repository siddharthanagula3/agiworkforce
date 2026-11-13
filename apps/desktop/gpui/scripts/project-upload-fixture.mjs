import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import {
  MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH,
  RESUMABLE_UPLOAD_PART_BYTES,
  ManagedCloudResumableUploadCreateRequestSchema,
  ManagedCloudResumableUploadPartsRequestSchema,
  ManagedCloudResumableUploadCompleteRequestSchema,
  ManagedCloudProjectKnowledgeFileSchema,
  ManagedCloudChatAttachmentSchema,
  isChatImageMimeType,
} from '@agiworkforce/cloud-contracts';

export function createProjectUploadFixture({
  projects,
  projectFiles,
  conversations,
  owner,
  personal,
  counts,
  json,
  error,
  stamp,
}) {
  const uploads = new Map();
  const held = new Set();
  let mode = 'normal';
  const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
  function setMode(value) {
    assert(
      [
        'normal',
        'hold-part',
        'lost-create',
        'lost-part',
        'lost-complete',
        'bad-complete',
        'bad-progress',
        'wrong-signed-part',
        'revoke-at-last-part',
      ].includes(value),
    );
    mode = value;
  }
  function snapshot() {
    return [...uploads.values()].map(({ id, workspace, input, parts, aborted, completed }) => ({
      id,
      workspace,
      input,
      parts: [...parts].map(([partNumber, bytes]) => ({
        partNumber,
        size: bytes.length,
        checksum: sha(bytes),
      })),
      aborted,
      completed: completed?.id ?? null,
    }));
  }
  async function handle(request, response, url, body, workspace) {
    const base = MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH;
    if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return false;
    const reply = (body, status = 200) => {
      json(response, body, status);
      return true;
    };
    const refuse = (status, message) => {
      error(response, status, message);
      return true;
    };
    if (url.pathname === base) {
      assert.equal(request.method, 'POST');
      const input = ManagedCloudResumableUploadCreateRequestSchema.parse(body);
      if (input.kind === 'knowledge-file') {
        assert.equal(input.sourceSurface, 'desktop');
        const project = projects.get(input.projectId);
        if (!project || (project.organizationId ?? personal) !== workspace)
          return refuse(404, 'Project not found in this workspace');
        if (
          project.isArchived ||
          (project.ownerUserId !== owner && project.sharedAccess !== 'write')
        )
          return refuse(403, 'This project is read-only');
        if (
          projectFiles
            .get(input.projectId)
            .some((file) => file.checksumSha256 === input.checksumSha256)
        )
          return refuse(409, 'This file already exists in the project');
      } else {
        assert.equal(request.headers['x-agi-surface'], 'desktop');
      }
      const id = randomUUID();
      const session = `fixture.upload.${randomUUID()}`;
      uploads.set(id, {
        id,
        session,
        workspace,
        input,
        parts: new Map(),
        aborted: false,
        completed: null,
      });
      const key = input.kind === 'chat-attachment' ? 'chatUploadCreates' : 'uploadCreates';
      counts[key] = (counts[key] ?? 0) + 1;
      if (mode === 'lost-create') {
        mode = 'normal';
        response.destroy();
        return true;
      }
      return reply({
        uploadId: id,
        session,
        partBytes: RESUMABLE_UPLOAD_PART_BYTES,
        partCount: Math.ceil(input.byteCount / RESUMABLE_UPLOAD_PART_BYTES),
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
    }
    const [id, segment] = url.pathname.slice(base.length + 1).split('/');
    const upload = uploads.get(id);
    const increment = (name) => {
      const key =
        upload?.input.kind === 'chat-attachment'
          ? `chat${name[0].toUpperCase()}${name.slice(1)}`
          : name;
      counts[key] = (counts[key] ?? 0) + 1;
    };
    if (!upload || upload.workspace !== workspace)
      return refuse(404, 'Upload not found in this workspace');
    const token =
      request.method === 'GET' || request.method === 'DELETE' || request.method === 'PUT'
        ? url.searchParams.get('session')
        : body.session;
    if (token !== upload.session) return refuse(404, 'Upload session does not match');
    if (segment === 'parts') {
      assert.equal(request.method, 'POST');
      const input = ManagedCloudResumableUploadPartsRequestSchema.parse(body);
      const count = Math.ceil(upload.input.byteCount / RESUMABLE_UPLOAD_PART_BYTES);
      assert(input.partNumbers.every((number) => number >= 1 && number <= count));
      return reply({
        parts: input.partNumbers.map((partNumber) => ({
          partNumber: mode === 'wrong-signed-part' ? partNumber + 1 : partNumber,
          url: `${url.origin}${base}/${id}?session=${encodeURIComponent(upload.session)}&partNumber=${partNumber}`,
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
        })),
      });
    }
    if (request.method === 'GET') {
      if (upload.aborted) return refuse(404, 'This upload was aborted');
      const parts = [...upload.parts].map(([partNumber, bytes]) => ({
        partNumber,
        size: bytes.length,
      }));
      if (mode === 'bad-progress') parts.push({ partNumber: 1, size: upload.input.byteCount + 1 });
      return reply({
        uploadId: id,
        partBytes: RESUMABLE_UPLOAD_PART_BYTES,
        parts,
        bytesStored: [...upload.parts.values()].reduce((sum, bytes) => sum + bytes.length, 0),
      });
    }
    if (request.method === 'DELETE') {
      upload.aborted = true;
      upload.parts.clear();
      increment('uploadAborts');
      return reply({ aborted: true });
    }
    if (upload.aborted) return refuse(409, 'This upload was aborted');
    if (request.method === 'PUT') {
      const part = Number(url.searchParams.get('partNumber'));
      const count = Math.ceil(upload.input.byteCount / RESUMABLE_UPLOAD_PART_BYTES);
      assert(Number.isSafeInteger(part) && part > 0 && part <= count);
      const expected = Math.min(
        RESUMABLE_UPLOAD_PART_BYTES,
        upload.input.byteCount - (part - 1) * RESUMABLE_UPLOAD_PART_BYTES,
      );
      assert.equal(body.length, expected);
      upload.parts.set(part, body);
      if (mode === 'revoke-at-last-part' && part === count) {
        const project = projects.get(upload.input.projectId);
        assert.notEqual(project.ownerUserId, owner);
        project.sharedAccess = 'read';
        mode = 'normal';
      }

      increment('uploadPartWrites');
      if (mode === 'lost-part') {
        mode = 'normal';
        response.destroy();
        return true;
      }
      if (mode === 'hold-part') {
        held.add(response);
        response.once('close', () => held.delete(response));
        return true;
      }
      return reply({ part: { partNumber: part, size: body.length } });
    }
    assert.equal(request.method, 'POST');
    ManagedCloudResumableUploadCompleteRequestSchema.parse(body);
    increment('uploadCompletionCalls');
    let project;
    if (upload.input.kind === 'knowledge-file') {
      project = projects.get(upload.input.projectId);
      if (
        !project ||
        (project.organizationId ?? personal) !== workspace ||
        project.isArchived ||
        (project.ownerUserId !== owner && project.sharedAccess !== 'write')
      )
        return refuse(403, 'Project access changed before upload completion');
    } else {
      assert.equal(request.headers['x-agi-surface'], 'desktop');
      const conversation = conversations.get(body.conversationId);
      if (
        !conversation ||
        conversation.workspace !== workspace ||
        conversation.conversation.archived
      )
        return refuse(403, 'Conversation access changed before upload completion');
      if (upload.conversationId && upload.conversationId !== body.conversationId)
        return refuse(409, 'The upload completion changed conversation');
      upload.conversationId = body.conversationId;
    }
    if (!upload.completed) {
      const count = Math.ceil(upload.input.byteCount / RESUMABLE_UPLOAD_PART_BYTES);
      assert.equal(upload.parts.size, count);
      const bytes = Buffer.concat(
        Array.from({ length: count }, (_, index) => upload.parts.get(index + 1)),
      );
      assert.equal(bytes.length, upload.input.byteCount);
      assert.equal(sha(bytes), upload.input.checksumSha256);
      if (upload.input.kind === 'knowledge-file') {
        const file = ManagedCloudProjectKnowledgeFileSchema.parse({
          id: randomUUID(),
          projectId: upload.input.projectId,
          fileName: upload.input.fileName,
          mimeType: upload.input.mimeType,
          byteCount: bytes.length,
          checksumSha256: sha(bytes),
          sourceSurface: 'desktop',
          addedByUserId: owner,
          addedAt: stamp(),
          storageUri: '/not-a-native-download-url',
          textPreviewKind: 'text',
          indexing: null,
        });
        projectFiles.get(project.id).push({ ...file, text: bytes.toString('utf8') });
        project.knowledgeFileCount = projectFiles.get(project.id).length;
        upload.completed = file;
      } else {
        const id = randomUUID();
        upload.completed = ManagedCloudChatAttachmentSchema.parse({
          id,
          name: upload.input.fileName,
          mimeType: upload.input.mimeType,
          byteCount: bytes.length,
          type: isChatImageMimeType(upload.input.mimeType) ? 'image' : 'file',
          url: `/api/files/${id}`,
        });
      }
      increment('uploadCompletedFiles');
    }
    if (mode === 'lost-complete') {
      mode = 'normal';
      response.destroy();
      return true;
    }
    if (upload.input.kind === 'chat-attachment') {
      if (mode === 'bad-complete') {
        mode = 'normal';
        return reply({
          kind: 'chat-attachment',
          attachment: { ...upload.completed, byteCount: upload.completed.byteCount + 1 },
        });
      }
      return reply({ kind: 'chat-attachment', attachment: upload.completed });
    }
    if (mode === 'bad-complete') {
      mode = 'normal';
      return reply({
        kind: 'knowledge-file',
        file: { ...upload.completed, checksumSha256: 'f'.repeat(64) },
      });
    }
    return reply({ kind: 'knowledge-file', file: upload.completed });
  }
  return {
    handle,
    snapshot,
    attachments: () =>
      [...uploads.values()]
        .filter((upload) => upload.input.kind === 'chat-attachment' && upload.completed)
        .map((upload) => ({ workspace: upload.workspace, attachment: upload.completed })),
    setMode,
    close() {
      for (const response of held) response.destroy();
      held.clear();
    },
  };
}
