const CLIENT_TYPES = new Set(['Client', 'ClientBuilder']);
const CLIENT_CONSTRUCTORS = '(?:new|builder|default)';
const RAW_STRING_OPEN = /^b?r(#*)"/;
const CHAR_LITERAL = /^'(?:\\[^']*|[^\\'])'/;

function blank(text) {
  return text.replace(/[^\n]/g, ' ');
}

export function stripRustComments(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i, i + 3);
    if (rest.startsWith('//')) {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (rest.startsWith('/*')) {
      let depth = 1;
      let j = i + 2;
      while (j < source.length && depth > 0) {
        if (source.startsWith('/*', j)) {
          depth += 1;
          j += 2;
        } else if (source.startsWith('*/', j)) {
          depth -= 1;
          j += 2;
        } else {
          j += 1;
        }
      }
      out += blank(source.slice(i, j));
      i = j;
    } else if (source[i] === '"') {
      let j = i + 1;
      while (j < source.length && source[j] !== '"') j += source[j] === '\\' ? 2 : 1;
      out += source.slice(i, j + 1);
      i = j + 1;
    } else if (!/\w/.test(source[i - 1] ?? '') && RAW_STRING_OPEN.test(source.slice(i, i + 40))) {
      const hashes = RAW_STRING_OPEN.exec(source.slice(i, i + 40))[1];
      const close = `"${hashes}`;
      const open = source.indexOf('"', i) + 1;
      const end = source.indexOf(close, open);
      const stop = end === -1 ? source.length : end + close.length;
      out += source.slice(i, stop);
      i = stop;
    } else if (source[i] === "'" && CHAR_LITERAL.test(source.slice(i, i + 12))) {
      const literal = CHAR_LITERAL.exec(source.slice(i, i + 12))[0];
      out += literal;
      i += literal.length;
    } else {
      out += source[i];
      i += 1;
    }
  }
  return out;
}

function parseUseTree(text) {
  const tokens = text.match(/::|\{|\}|,|\*|[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  let position = 0;
  const entries = [];

  function parseItem(prefix) {
    if (tokens[position] === '::') position += 1;
    const token = tokens[position];
    if (token === '{') {
      position += 1;
      while (position < tokens.length && tokens[position] !== '}') {
        parseItem(prefix);
        if (tokens[position] === ',') position += 1;
      }
      position += 1;
      return;
    }
    if (token === '*') {
      position += 1;
      entries.push({ path: prefix, alias: null, glob: true });
      return;
    }
    if (token === undefined || !/^[A-Za-z_]/.test(token)) {
      position += 1;
      return;
    }
    position += 1;
    const path = token === 'self' ? prefix : [...prefix, token];
    if (tokens[position] === '::') {
      position += 1;
      parseItem(path);
      return;
    }
    let alias = null;
    if (tokens[position] === 'as') {
      alias = tokens[position + 1] ?? null;
      position += 2;
    }
    entries.push({ path, alias, glob: false });
  }

  parseItem([]);
  return entries;
}

function useEntries(source) {
  const entries = [];
  for (const match of source.matchAll(/(?<![\w])use\s+([^;]+);/g)) {
    entries.push(...parseUseTree(match[1]));
  }
  for (const match of source.matchAll(/(?<![\w])extern\s+crate\s+(\w+)\s+as\s+(\w+)\s*;/g)) {
    entries.push({ path: [match[1]], alias: match[2], glob: false });
  }
  return entries;
}

function localName(entry) {
  return entry.alias ?? entry.path[entry.path.length - 1];
}

function escaped(name) {
  return name.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&');
}

function pathPattern(segments) {
  return segments.map(escaped).join('\\s*::\\s*');
}

function reqwestBindings(source) {
  const entries = useEntries(source);
  const crates = new Set(['reqwest']);
  for (const entry of entries) {
    if (entry.path.length === 1 && entry.path[0] === 'reqwest' && entry.alias) {
      crates.add(entry.alias);
    }
  }

  const modules = new Set();
  const clients = new Set();
  const getters = new Set();
  const foreign = new Set();
  let globbed = false;

  for (const entry of entries) {
    const [root, ...rest] = entry.path;
    if (!crates.has(root)) {
      if (!entry.glob) foreign.add(localName(entry));
      continue;
    }
    const inBlocking = rest.length > 0 && rest[0] === 'blocking';
    if (entry.glob) {
      if (rest.length === 0 || (rest.length === 1 && inBlocking)) globbed = true;
      continue;
    }
    if (rest.length === 1 && inBlocking) modules.add(localName(entry));
    const target = rest[rest.length - 1];
    const direct = rest.length === 1 || (rest.length === 2 && inBlocking);
    if (direct && CLIENT_TYPES.has(target)) clients.add(localName(entry));
    if (direct && target === 'get') getters.add(localName(entry));
  }

  if (globbed) for (const name of CLIENT_TYPES) clients.add(name);
  const unshadowed = (names) => [...names].filter((name) => !foreign.has(name));
  return {
    crates: [...crates],
    modules: [...modules],
    clients: unshadowed(clients),
    getters: unshadowed(getters),
  };
}

export function constructsBareClient(source) {
  const stripped = stripRustComments(source);
  const { crates, modules, clients, getters } = reqwestBindings(stripped);

  const prefixes = [
    ...crates.map((name) => [name]),
    ...crates.map((name) => [name, 'blocking']),
    ...modules.map((name) => [name]),
  ].map(pathPattern);
  const qualified = prefixes.map((prefix) => `(?<![\\w])(?:::)?${prefix}\\s*::\\s*`);
  const qualifiedPatterns = qualified.flatMap((lead) => [
    `${lead}(?:Client|ClientBuilder)\\s*::\\s*${CLIENT_CONSTRUCTORS}\\s*\\(`,
    `${lead}get\\s*\\(`,
  ]);
  const importedPatterns = [
    ...clients.map((name) => `(?<![\\w:])${escaped(name)}\\s*::\\s*${CLIENT_CONSTRUCTORS}\\s*\\(`),
    ...getters.map((name) => `(?<![\\w:.])(?<!\\bfn\\s+)${escaped(name)}\\s*\\(`),
  ];
  return [...qualifiedPatterns, ...importedPatterns].some((pattern) =>
    new RegExp(pattern).test(stripped),
  );
}

export function checkEgressBoundary({ files, allowlist }) {
  const allowed = new Set(allowlist);
  const constructing = files
    .filter(({ source }) => constructsBareClient(source))
    .map(({ path }) => path)
    .sort();

  const errors = [];
  const unlisted = constructing.filter((file) => !allowed.has(file));
  if (unlisted.length > 0) {
    errors.push(
      'These files build a reqwest client outside the host-owned egress boundary. ' +
        'Construct through sys::security::egress_policy::PublicHttpClient instead:\n' +
        unlisted.map((file) => `  - ${file}`).join('\n'),
    );
  }

  const stale = allowlist.filter((file) => !constructing.includes(file));
  if (stale.length > 0) {
    errors.push(
      'These files no longer build a bare reqwest client; drop them from the allowlist ' +
        'so the boundary only ratchets closed:\n' +
        stale.map((file) => `  - ${file}`).join('\n'),
    );
  }

  return errors;
}
