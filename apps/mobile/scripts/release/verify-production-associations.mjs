#!/usr/bin/env node

import process from 'node:process';
import { pathToFileURL } from 'node:url';

const PRODUCTION_ORIGIN = 'https://agiworkforce.com';
const IOS_APPLICATION_IDENTIFIER = 'D2PR62RLT4.com.agiworkforce.app';
const ANDROID_PACKAGE_NAME = 'com.agiworkforce.app';
const HANDLE_ALL_URLS_RELATION = 'delegate_permission/common.handle_all_urls';
const EXPECTED_IOS_PATHS = ['/auth/reset-password', '/pair', '/pair/*'];
const MAX_RESPONSE_BYTES = 64 * 1024;

export function normalizeSha256Fingerprint(value) {
  const hex = value.replaceAll(':', '').trim().toUpperCase();
  if (!/^[0-9A-F]{64}$/u.test(hex)) return undefined;
  return hex.match(/.{2}/gu)?.join(':');
}

export function parseExpectedFingerprints(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new Error(
      'ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS must contain the real Google Play App Signing SHA-256 fingerprint',
    );
  }

  const values = raw.split(/[\n,]+/u).filter((value) => value.trim().length > 0);
  const normalized = values.map((value) => normalizeSha256Fingerprint(value));
  if (normalized.some((value) => value === undefined)) {
    throw new Error(
      'ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS contains an invalid SHA-256 fingerprint',
    );
  }
  return [...new Set(normalized)];
}

async function readBoundedJson(response, url) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!/^application\/json(?:;|$)/iu.test(contentType)) {
    throw new Error(`${url} returned unsupported Content-Type ${JSON.stringify(contentType)}`);
  }

  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error(`${url} response exceeds ${MAX_RESPONSE_BYTES} bytes`);
  }
  if (response.body === null) throw new Error(`${url} returned an empty body`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error(`${url} response exceeds ${MAX_RESPONSE_BYTES} bytes`);
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${url} did not return valid JSON`);
  }
}

async function fetchAssociationDocument(path, fetchImpl) {
  const url = `${PRODUCTION_ORIGIN}${path}`;
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error(`${url} redirected instead of serving the association document directly`);
  }
  if (response.status !== 200) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  if (response.url && response.url !== url) {
    throw new Error(`${url} resolved to unexpected URL ${response.url}`);
  }
  return readBoundedJson(response, url);
}

function verifyAppleAssociation(document) {
  const details = document?.applinks?.details;
  if (!Array.isArray(details)) throw new Error('Apple association is missing applinks.details');

  const app = details.find(
    (detail) => Array.isArray(detail?.appIDs) && detail.appIDs.includes(IOS_APPLICATION_IDENTIFIER),
  );
  if (!app || !Array.isArray(app.components)) {
    throw new Error(`Apple association is missing ${IOS_APPLICATION_IDENTIFIER}`);
  }

  const paths = app.components
    .map((component) => component?.['/'])
    .filter((path) => typeof path === 'string')
    .sort();
  if (
    paths.length !== EXPECTED_IOS_PATHS.length ||
    paths.some((path, index) => path !== EXPECTED_IOS_PATHS[index])
  ) {
    throw new Error(`Apple association paths do not match ${EXPECTED_IOS_PATHS.join(', ')}`);
  }
}

function verifyAndroidAssociation(document, expectedFingerprints) {
  if (!Array.isArray(document) || document.length !== 1) {
    throw new Error('Android association must contain exactly one statement');
  }

  const [statement] = document;
  if (
    !Array.isArray(statement?.relation) ||
    !statement.relation.includes(HANDLE_ALL_URLS_RELATION)
  ) {
    throw new Error('Android association is missing handle_all_urls delegation');
  }
  if (
    statement?.target?.namespace !== 'android_app' ||
    statement.target.package_name !== ANDROID_PACKAGE_NAME
  ) {
    throw new Error(`Android association does not target ${ANDROID_PACKAGE_NAME}`);
  }

  const advertised = statement.target.sha256_cert_fingerprints;
  if (!Array.isArray(advertised) || advertised.length === 0) {
    throw new Error('Android association has no signing fingerprints');
  }
  const normalized = advertised.map((value) =>
    typeof value === 'string' ? normalizeSha256Fingerprint(value) : undefined,
  );
  if (normalized.some((value) => value === undefined)) {
    throw new Error('Android association contains an invalid signing fingerprint');
  }

  const actual = [...new Set(normalized)].sort();
  const expected = [...expectedFingerprints].sort();
  if (
    actual.length !== expected.length ||
    actual.some((fingerprint, index) => fingerprint !== expected[index])
  ) {
    throw new Error(
      'Android association fingerprints do not match the protected Play signing value',
    );
  }
}

export async function verifyProductionAssociations({
  rawFingerprints = process.env['ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS'],
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');
  const expectedFingerprints = parseExpectedFingerprints(rawFingerprints);
  const [appleDocument, androidDocument] = await Promise.all([
    fetchAssociationDocument('/.well-known/apple-app-site-association', fetchImpl),
    fetchAssociationDocument('/.well-known/assetlinks.json', fetchImpl),
  ]);
  verifyAppleAssociation(appleDocument);
  verifyAndroidAssociation(androidDocument, expectedFingerprints);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    await verifyProductionAssociations();
    console.log('[release] production Apple and Android association documents verified');
  } catch (error) {
    console.error(`[release] production association verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
