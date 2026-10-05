const REQUIRED_KEYS = ['id', 'title', 'path', 'category', 'tags', 'updated', 'scope'];

const OPTIONAL_KEYS = ['platforms'];

export class BuildError extends Error {}

export function parseFrontmatter(raw, file) {
  const normalized = raw.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    throw new BuildError(`${file}: missing opening --- frontmatter fence`);
  }
  const end = normalized.indexOf('\n---\n', 3);
  if (end === -1) throw new BuildError(`${file}: missing closing --- frontmatter fence`);

  const block = normalized.slice(4, end + 1);
  const body = normalized.slice(end + 5);

  /** @type {Record<string, string>} */
  const data = {};
  for (const line of block.split('\n')) {
    if (!line.trim()) continue;
    const colon = line.indexOf(':');
    if (colon === -1) throw new BuildError(`${file}: malformed frontmatter line: ${line}`);
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (!key) throw new BuildError(`${file}: empty frontmatter key`);
    if (key in data) throw new BuildError(`${file}: duplicate frontmatter key: ${key}`);
    data[key] = value;
  }

  for (const key of REQUIRED_KEYS) {
    if (!(key in data) || data[key] === '') {
      throw new BuildError(`${file}: missing required frontmatter key: ${key}`);
    }
  }
  for (const key of Object.keys(data)) {
    if (!REQUIRED_KEYS.includes(key) && !OPTIONAL_KEYS.includes(key)) {
      throw new BuildError(`${file}: unknown frontmatter key: ${key}`);
    }
  }
  if (data['scope'] !== 'public') {
    throw new BuildError(`${file}: scope must be "public" (got "${data['scope']}")`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(data['id'])) {
    throw new BuildError(`${file}: id must be kebab-case (got "${data['id']}")`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data['updated'])) {
    throw new BuildError(`${file}: updated must be YYYY-MM-DD (got "${data['updated']}")`);
  }
  return { data, body };
}
