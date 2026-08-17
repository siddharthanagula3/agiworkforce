const QUALIFIED = /reqwest::(?:Client|ClientBuilder)::(?:new|builder)\s*\(/;
const REQWEST_TYPES = ['Client', 'ClientBuilder'];

export function stripRustComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function importedNames(source, crateName) {
  const names = new Set();
  const pattern = new RegExp(`use\\s+${crateName}::(\\{[^}]*\\}|[A-Za-z0-9_]+)`, 'g');
  let match;
  while ((match = pattern.exec(source)) !== null) {
    for (const raw of match[1].replace(/[{}]/g, '').split(',')) {
      const name = raw
        .trim()
        .split(/\s+as\s+/)[0]
        ?.trim();
      if (name) names.add(name);
    }
  }
  return names;
}

// An unqualified `Client::new()` is only reqwest's when reqwest is the crate
// that brought the name into scope; reqwest_middleware exports a ClientBuilder
// of its own, and a file importing both must qualify anyway.
function unqualifiedReqwestTypes(source) {
  const fromReqwest = importedNames(source, 'reqwest');
  const shadowed = new Set(
    [...importedNames(source, '[A-Za-z0-9_]+')].filter((name) => !fromReqwest.has(name)),
  );
  const allImports = source.match(/use\s+([A-Za-z0-9_]+)::/g) ?? [];
  const otherCrates = allImports
    .map((line) => line.replace(/use\s+/, '').replace(/::$/, ''))
    .filter((crate) => crate !== 'reqwest');
  for (const crate of otherCrates) {
    for (const name of importedNames(source, crate)) shadowed.add(name);
  }
  return REQWEST_TYPES.filter((name) => fromReqwest.has(name) && !shadowed.has(name));
}

export function constructsBareClient(source) {
  const stripped = stripRustComments(source);
  if (QUALIFIED.test(stripped)) return true;
  return unqualifiedReqwestTypes(stripped).some((name) =>
    new RegExp(`(?<!::)\\b${name}::(?:new|builder)\\s*\\(`).test(stripped),
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
