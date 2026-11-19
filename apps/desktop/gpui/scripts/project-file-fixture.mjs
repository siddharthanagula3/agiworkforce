import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
export function createProjectFileFixture({ owner, counts, json, error, stamp }) {
  let downloadMode = 'normal';
  let reindexMode = 'normal';
  const held = new Map();
  const downloads = [];
  function setDownloadMode(mode) {
    assert(
      [
        'normal',
        'hold',
        'bad-bytes',
        'oversize',
        'stream-oversize',
        'short-body',
        'lost-body',
        'changed-source',
      ].includes(mode),
    );
    downloadMode = mode;
    if (mode === 'normal') {
      for (const [response, remaining] of held) {
        if (!response.destroyed) response.end(remaining);
      }
      held.clear();
    }
  }
  function setReindexMode(mode) {
    assert(['normal', 'lost'].includes(mode));
    reindexMode = mode;
  }
  function handle(request, response, url, project, files, base, workspace) {
    const file = files.find(
      (file) =>
        url.pathname === `${base}/${file.id}` || url.pathname === `${base}/${file.id}/reindex`,
    );
    if (!file) return false;
    if (url.pathname.endsWith('/reindex')) {
      assert.equal(request.method, 'POST');
      if (project.ownerUserId !== owner || project.isArchived) {
        error(response, 403, 'Only the active project owner can reindex this source');
        return true;
      }
      file.indexing = {
        status: 'pending',
        chunkCount: 0,
        semantic: false,
        attempts: 0,
        error: null,
        indexedAt: null,
      };
      counts.reindexWrites = (counts.reindexWrites ?? 0) + 1;
      if (reindexMode === 'lost') {
        reindexMode = 'normal';
        response.destroy();
        return true;
      }
      json(response, { indexing: file.indexing, dispatched: true }, 202);
      return true;
    }
    assert.equal(request.method, 'GET');
    counts.downloadRequests = (counts.downloadRequests ?? 0) + 1;
    const mode = downloadMode;
    downloads.push({ fileId: file.id, projectId: project.id, workspace, mode, at: stamp() });
    if (mode === 'changed-source') {
      file.text = `Z${file.text.slice(1)}`;
      file.checksumSha256 = createHash('sha256').update(file.text).digest('hex');
      downloadMode = 'normal';
    }
    let bytes = Buffer.from(file.text);
    if (mode === 'bad-bytes') {
      bytes = Buffer.from(bytes);
      bytes[0] ^= 1;
    }
    if (mode === 'oversize' || mode === 'stream-oversize')
      bytes = Buffer.concat([bytes, Buffer.from('x')]);
    if (mode === 'short-body') bytes = bytes.subarray(0, bytes.length - 1);
    if (mode === 'lost-body') {
      downloadMode = 'normal';
      response.destroy();
      return true;
    }
    const headers = { 'Content-Type': file.mimeType, 'Cache-Control': 'private, no-store' };
    if (mode !== 'stream-oversize') headers['Content-Length'] = String(bytes.length);
    response.writeHead(200, headers);
    if (mode === 'hold') {
      const first = Math.max(1, Math.floor(bytes.length / 2));
      response.write(bytes.subarray(0, first));
      held.set(response, bytes.subarray(first));
      response.once('close', () => held.delete(response));
      return true;
    }
    response.end(bytes);
    return true;
  }
  return {
    handle,
    setDownloadMode,
    setReindexMode,
    snapshot: () => globalThis.structuredClone(downloads),
    close() {
      for (const response of held.keys()) response.destroy();
      held.clear();
    },
  };
}
