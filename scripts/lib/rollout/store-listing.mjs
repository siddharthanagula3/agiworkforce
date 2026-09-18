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

/**
 * A listing that claims purchases while the build ships billing switched off
 * is the store-facing half of a claim the app cannot honour.
 */
export function storeListingFailures({ ios, android, appVersion, appIdentifier, billingEnabled }) {
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

  const claimsPurchases = ios.pricing?.in_app_purchases === true;
  const androidProducts = android.in_app_products?.has_in_app_products === true;
  if (!billingEnabled && claimsPurchases) {
    failures.push(
      'iOS listing declares in-app purchases while the mobile build ships billing switched off',
    );
  }
  if (!billingEnabled && androidProducts) {
    failures.push(
      'Android listing declares in-app products while the mobile build ships billing switched off',
    );
  }
  if (billingEnabled && !claimsPurchases) {
    failures.push(
      'the mobile build ships billing on while the iOS listing still declares no in-app purchases',
    );
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

export function billingEnabledFrom(featureFlagsSource) {
  const match = /billing:\s*(true|false)/.exec(featureFlagsSource);
  if (!match) throw new Error('v1FeatureFlags.ts no longer declares the billing feature');
  return match[1] === 'true';
}
