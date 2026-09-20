/**
 * Caller-supplied bytes enter the product through the request object and
 * nowhere else, so that is what the coverage guard enumerates. Bytes a route
 * fetches from upstream are the product's own traffic and are not in scope.
 */
const CALLER_BYTE_READ = /\b(?:request|req)\s*\.\s*(formData|arrayBuffer|blob|bytes)\s*\(\s*\)/g;

const INSPECTION_CALLS = ['refuseUnsafeUpload', 'scanUploadBytes', 'inspectUploadBytes'];

export function callerByteReads(source) {
  const found = new Set();
  for (const match of source.matchAll(CALLER_BYTE_READ)) found.add(match[1]);
  return [...found].sort();
}

export function readsCallerBytes(source) {
  return callerByteReads(source).length > 0;
}

export function inspectsUploadedBytes(source) {
  return INSPECTION_CALLS.some((call) => source.includes(call));
}

/**
 * A route that stages bytes for a second request to finish is inspected where
 * the asset becomes usable, not where the first part lands. The completing
 * file is named so the guard can read it rather than take the claim on trust.
 */
export function deferralIsHonoured(completingSource) {
  return typeof completingSource === 'string' && inspectsUploadedBytes(completingSource);
}

export function routeFiles(dir, fs, path) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      out.push(...routeFiles(full, fs, path));
    } else if (entry.name === 'route.ts' || entry.name === 'route.tsx') {
      out.push(full);
    }
  }
  return out.sort();
}
