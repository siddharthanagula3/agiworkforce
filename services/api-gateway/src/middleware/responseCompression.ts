import compression from 'compression';
import type { Request, RequestHandler, Response } from 'express';

export const COMPRESSION_THRESHOLD_BYTES = 1024;

// Streaming responses must never be compressed here. The compressor buffers
// until a flush boundary, so a `text/event-stream` turn would arrive in one
// lump at the end instead of token by token, which is indistinguishable from a
// hung request. routes/llm.ts and routes/providerStream.ts both stream.
export function isStreamingResponse(res: Response): boolean {
  const contentType = res.getHeader('Content-Type');
  const value = Array.isArray(contentType) ? contentType.join(',') : String(contentType ?? '');
  return value.includes('text/event-stream');
}

// A body that already carries an encoding was compressed by the route (or by an
// upstream this gateway proxies). Compressing it again spends CPU to make it
// bigger and leaves a Content-Encoding the client cannot unwrap in order.
export function isAlreadyEncoded(res: Response): boolean {
  const encoding = res.getHeader('Content-Encoding');
  if (encoding === undefined || encoding === null) return false;
  const value = Array.isArray(encoding) ? encoding.join(',') : String(encoding);
  return value.trim() !== '' && value.trim().toLowerCase() !== 'identity';
}

export function shouldCompress(req: Request, res: Response): boolean {
  if (isStreamingResponse(res)) return false;
  if (isAlreadyEncoded(res)) return false;
  // compression.filter consults `compressible`, which already answers false for
  // image/*, video/*, application/zip and the rest of the pre-compressed types,
  // so JPEG and WebP bodies are covered without listing them here.
  return compression.filter(req, res);
}

export function responseCompression(): RequestHandler {
  return compression({
    threshold: COMPRESSION_THRESHOLD_BYTES,
    filter: shouldCompress,
  });
}
