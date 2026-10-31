/**
 * Store listings are prose a human maintains against a binary that keeps
 * moving, and the iOS reviewer notes record a real correction on 2026-08-27
 * where the two had drifted. These are the claims a machine can hold to the
 * build rather than to somebody's memory.
 */

const IOS_COUNTED_FIELDS = {
  name: 'app_name',
  subtitle: 'subtitle',
  promotional_text: 'promotional_text',
  keywords: 'keywords',
  description: 'description',
  whats_new: 'whats_new',
};

const ANDROID_COUNTED_FIELDS = {
  app_name: 'app_name',
  short_description: 'short_description',
  full_description: 'full_description',
};

function countFailures(listing, label, fields) {
  const failures = [];
  const limits = listing._meta?.char_limits ?? {};
  const counts = listing._meta?.char_counts ?? {};
  for (const [countKey, field] of Object.entries(fields)) {
    const value = listing[field];
    if (typeof value !== 'string') {
      failures.push(`${label}: ${field} is missing from the listing`);
      continue;
    }
    if (counts[countKey] !== value.length) {
      failures.push(
        `${label}: ${field} is ${value.length} characters but _meta.char_counts.${countKey} records ${counts[countKey]}`,
      );
    }
    const limit = limits[countKey];
    if (typeof limit === 'number' && value.length > limit) {
      failures.push(`${label}: ${field} is ${value.length} characters, over the ${limit} limit`);
    }
  }
  return failures;
}

export function storeListingFailures({ ios, android, appVersion, appIdentifier, nativePurchases }) {
  const failures = [
    ...countFailures(ios, 'iOS listing', IOS_COUNTED_FIELDS),
    ...countFailures(android, 'Android listing', ANDROID_COUNTED_FIELDS),
  ];

  for (const [label, listing, idKey] of [
    ['iOS listing', ios, 'bundle_id'],
    ['Android listing', android, 'package_name'],
  ]) {
    if (listing._meta?.version !== appVersion) {
      failures.push(
        `${label}: _meta.version is ${listing._meta?.version} but the app ships ${appVersion}`,
      );
    }
    if (listing._meta?.[idKey] !== appIdentifier) {
      failures.push(
        `${label}: _meta.${idKey} is ${listing._meta?.[idKey]} but the app ships ${appIdentifier}`,
      );
    }
  }

  for (const [platform, label, declared] of [
    ['ios', 'iOS listing', ios.pricing?.in_app_purchases],
    ['android', 'Android listing', android.in_app_products?.has_in_app_products],
  ]) {
    const supported = nativePurchases?.[platform];
    if (typeof supported !== 'boolean') {
      failures.push(`${label}: native purchase capability has not been verified`);
    }
    if (typeof declared !== 'boolean') {
      failures.push(`${label}: native purchase declaration must be a boolean`);
    } else if (typeof supported === 'boolean' && declared !== supported) {
      failures.push(
        declared
          ? `${label} declares purchases without native purchase support in the mobile build`
          : `${label} declares no purchases while the mobile build implements native purchases`,
      );
    }
  }
  return failures;
}

export function appVersionFrom(appConfigSource) {
  const version = /^\s*version: '([^']+)',/m.exec(appConfigSource)?.[1];
  if (!version) throw new Error('app.config.js no longer declares a version');
  return version;
}

export function appIdentifierFrom(appConfigSource) {
  const bundle = /bundleIdentifier: '([^']+)'/.exec(appConfigSource)?.[1];
  const android = /package: '([^']+)'/.exec(appConfigSource)?.[1];
  if (!bundle || !android) throw new Error('app.config.js no longer declares both store ids');
  if (bundle !== android) throw new Error(`store ids disagree: ${bundle} and ${android}`);
  return bundle;
}

export const NATIVE_PURCHASE_SOURCE_PATHS = Object.freeze({
  capabilities: 'packages/contracts/types/src/capabilities.ts',
  package: 'apps/mobile/package.json',
  appConfig: 'apps/mobile/app.config.js',
  screen: 'apps/mobile/src/features/settings/cloud-billing/index.tsx',
  hook: 'apps/mobile/src/features/billing/useMobileIap.ts',
  service: 'apps/mobile/src/features/billing/mobileIapService.ts',
  catalog: 'apps/web/lib/server/mobile-iap-catalog.ts',
  catalogRoute: 'apps/web/app/api/mobile/iap/catalog/route.ts',
  verifyRoute: 'apps/web/app/api/mobile/iap/verify/route.ts',
});

const SOURCE_TOKEN =
  /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\[\s\S]|[^'\\])*'|"(?:\\[\s\S]|[^"\\])*"|`(?:\\[\s\S]|[^`\\])*`|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|===|!==|&&|\|\||=>|[^\s]/gy;

function executableSource(source, label) {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new Error(`Native purchase wiring: ${label} source is missing`);
  }
  const tokens = [];
  const literals = new Map();
  const scanner = new RegExp(SOURCE_TOKEN.source, SOURCE_TOKEN.flags);
  let match;
  while ((match = scanner.exec(source)) !== null) {
    const text = match[0];
    if (text === '/' && source.startsWith('/*', match.index)) {
      throw new Error(`Native purchase wiring: ${label} has an unterminated comment`);
    }
    if (/^\s|^\/\/|^\/\*/.test(text)) continue;
    if (/^['"`]/.test(text)) {
      if (text.length === 1)
        throw new Error(`Native purchase wiring: ${label} has an unterminated string`);
      const id = `LITERAL_${literals.size}`;
      literals.set(id, text.slice(1, -1));
      tokens.push(id);
    } else {
      tokens.push(text);
    }
  }
  return { code: tokens.join(' '), tokens, literals };
}

function requireCode(source, pattern, label) {
  if (!pattern.test(source.code)) throw new Error(`Native purchase wiring: ${label}`);
}

function namedImport(source, name, module) {
  return [...source.code.matchAll(/\bimport \{ ([^}]+) \} from (LITERAL_\d+)/g)].some(
    (match) =>
      source.literals.get(match[2]) === module &&
      match[1].split(' , ').some((binding) => binding === name),
  );
}

function callsRoute(source, method, route, prefix = false) {
  return [
    ...source.code.matchAll(
      new RegExp(`\\bapi \\. ${method}(?: < [^>]+ >)? \\( (LITERAL_\\d+)`, 'g'),
    ),
  ].some((match) =>
    prefix
      ? source.literals.get(match[1])?.startsWith(route)
      : source.literals.get(match[1]) === route,
  );
}

function nativePlatformMapped(source, platform) {
  return [
    ...source.code.matchAll(/\bif \( Platform \. OS === (LITERAL_\d+) \) return (LITERAL_\d+) ;/g),
  ].some(
    (match) =>
      source.literals.get(match[1]) === platform && source.literals.get(match[2]) === platform,
  );
}

function pluginRegistered(source, plugin) {
  const declaration = source.tokens.findIndex(
    (token, index) =>
      token === 'plugins' && source.tokens[index + 1] === ':' && source.tokens[index + 2] === '[',
  );
  if (declaration < 0) return false;
  const registeredEntry = (index) => {
    const token = source.tokens[index];
    if (source.literals.get(token) === plugin) return [',', ']'].includes(source.tokens[index + 1]);
    if (
      token !== '[' ||
      source.literals.get(source.tokens[index + 1]) !== plugin ||
      ![',', ']'].includes(source.tokens[index + 2])
    )
      return false;
    let depth = 1;
    for (let end = index + 1; end < source.tokens.length; end++) {
      if (source.tokens[end] === '[') depth++;
      else if (source.tokens[end] === ']' && --depth === 0)
        return [',', ']'].includes(source.tokens[end + 1]);
    }
    return false;
  };
  let brackets = 1;
  let braces = 0;
  let parentheses = 0;
  let entryStart = true;
  let registered = false;
  for (let index = declaration + 3; index < source.tokens.length; index++) {
    const token = source.tokens[index];
    const topLevel = brackets === 1 && braces === 0 && parentheses === 0;
    if (topLevel && entryStart) {
      registered ||= registeredEntry(index);
      entryStart = false;
    }
    if (token === '[') brackets++;
    else if (token === ']') {
      brackets--;
      if (brackets === 0) return braces === 0 && parentheses === 0 && registered;
    } else if (token === '{') braces++;
    else if (token === '}') braces--;
    else if (token === '(') parentheses++;
    else if (token === ')') parentheses--;
    if (brackets < 1 || braces < 0 || parentheses < 0) return false;
    if (token === ',' && topLevel) entryStart = true;
  }
  return false;
}

export function nativePurchaseSupportFrom(sources) {
  const code = Object.fromEntries(
    Object.entries(NATIVE_PURCHASE_SOURCE_PATHS)
      .filter(([name]) => name !== 'package')
      .map(([name, file]) => [name, executableSource(sources?.[name], file)]),
  );
  requireCode(
    code.capabilities,
    /\bconst MOBILE\b[^=]*= \{[^}]*\bcanUseBilling : true\b/,
    'canonical mobile billing capability is not enabled',
  );
  requireCode(
    code.capabilities,
    /\bPLATFORM_CAPABILITIES\b[^=]*= Object \. freeze \( \{[^}]*\bmobile : MOBILE\b/,
    'canonical mobile capability export is missing',
  );
  let manifest;
  try {
    manifest = JSON.parse(sources.package);
  } catch {
    throw new Error('Native purchase wiring: mobile package manifest is missing or invalid');
  }
  if (
    typeof manifest?.dependencies?.['expo-iap'] !== 'string' ||
    !manifest.dependencies['expo-iap'].trim()
  ) {
    throw new Error('Native purchase wiring: expo-iap runtime dependency is missing');
  }
  if (!pluginRegistered(code.appConfig, 'expo-iap'))
    throw new Error('Native purchase wiring: expo-iap native plugin is missing');
  if (!namedImport(code.screen, 'useMobileIap', '@/src/features/billing/useMobileIap'))
    throw new Error(
      'Native purchase wiring: Billing screen no longer imports the native purchase hook',
    );
  requireCode(
    code.screen,
    /\bconst nativeIap = useMobileIap \( \{ enabled : isClerkLoaded && isClerkSignedIn && isCloudModeActive ,? \} \)/,
    'Billing screen no longer enables native purchases for authenticated Cloud mode',
  );
  requireCode(
    code.screen,
    /\bnativeIap \. purchase \(/,
    'Billing screen has no native purchase action',
  );
  if (!namedImport(code.hook, 'useIAP', 'expo-iap'))
    throw new Error('Native purchase wiring: native store SDK hook import is missing');
  requireCode(
    code.hook,
    /\bexport function useMobileIap \(/,
    'native purchase hook export is missing',
  );
  requireCode(code.hook, /\bconst iap = useIAP \(/, 'native store SDK hook is not called');
  requireCode(
    code.hook,
    /\bawait iap \. requestPurchase \( \{/,
    'native store purchase request is missing',
  );
  requireCode(
    code.hook,
    /\bapple : \{ sku : product \. productId\b/,
    'iOS store purchase request is missing',
  );
  requireCode(
    code.hook,
    /\bgoogle : \{ skus : \[ product \. productId \]/,
    'Android store purchase request is missing',
  );
  requireCode(
    code.hook,
    /\bawait fetchMobileIapCatalog \(/,
    'native purchase hook no longer reads the server catalog',
  );
  requireCode(
    code.hook,
    /\bawait verifyMobileIapPurchase \(/,
    'native purchase hook no longer verifies purchases on the server',
  );
  for (const platform of ['ios', 'android']) {
    if (!nativePlatformMapped(code.service, platform))
      throw new Error(`Native purchase wiring: ${platform} catalog platform mapping is missing`);
  }
  if (!callsRoute(code.service, 'get', '/api/mobile/iap/catalog?', true))
    throw new Error('Native purchase wiring: catalog request is missing');
  if (!callsRoute(code.service, 'post', '/api/mobile/iap/verify'))
    throw new Error('Native purchase wiring: receipt verification request is missing');
  requireCode(
    code.catalog,
    /\bMOBILE_IAP_PRODUCT_DEFINITIONS \. flatMap \(/,
    'server catalog no longer consumes the canonical product definitions',
  );
  requireCode(
    code.catalog,
    /\bif \( ! deploymentEnablesMobileIap \( \) \)/,
    'server deployment admission gate is missing',
  );
  requireCode(
    code.catalogRoute,
    /\bgetMobileIapCatalogState \( parsed \. data \. platform \)/,
    'server catalog route is disconnected',
  );
  requireCode(
    code.verifyRoute,
    /\bawait verifyMobileIapPurchase \(/,
    'server store verification is disconnected',
  );
  requireCode(
    code.verifyRoute,
    /\bawait recordVerifiedMobileIapPurchase \(/,
    'server verified purchase recording is disconnected',
  );
  return { ios: true, android: true };
}
