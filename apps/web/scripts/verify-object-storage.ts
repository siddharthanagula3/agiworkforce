import {
  hasObjectStorageCredentials,
  resolveObjectStorageConfig,
  resolveObjectStorageRuntime,
  OBJECT_STORAGE_ACCESS_KEY_ID_ENV,
  OBJECT_STORAGE_BUCKET_ENV,
  OBJECT_STORAGE_ENDPOINT_ENV,
  OBJECT_STORAGE_PUBLIC_BASE_URL_ENV,
  OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV,
  type ObjectStore,
} from '@agiworkforce/object-storage';

const CONNECTION_TIMEOUT_MS = 3_000;
const REQUEST_TIMEOUT_MS = 10_000;
const VERIFY_KEY_PREFIX = 'agi-verify/';
const KEY_SUFFIX_RADIX = 36;
const KEY_SUFFIX_START = 2;
const CONFIGURATION_EXIT_CODE = 2;

function ok(label: string): void {
  console.log(`  pass ${label}`);
}

function fail(label: string, error: unknown): void {
  console.error(`  fail ${label}: ${(error as { message?: string } | null)?.message ?? error}`);
}

async function main(): Promise<void> {
  const config = resolveObjectStorageConfig();
  const missing = [
    hasObjectStorageCredentials(config)
      ? null
      : `${OBJECT_STORAGE_ENDPOINT_ENV}, ${OBJECT_STORAGE_ACCESS_KEY_ID_ENV}, ${OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV}`,
    config.publicBucket ? null : OBJECT_STORAGE_BUCKET_ENV,
    config.publicBaseUrl ? null : OBJECT_STORAGE_PUBLIC_BASE_URL_ENV,
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    console.error(`Missing storage configuration: ${missing.join(', ')}`);
    console.error('Set them in the environment or apps/web/.env.local (never in chat / git).');
    process.exit(CONFIGURATION_EXIT_CODE);
  }

  const bucket = config.publicBucket as string;
  const publicBaseUrl = config.publicBaseUrl as string;
  const runtime = resolveObjectStorageRuntime({
    timeouts: {
      connectionTimeoutMs: CONNECTION_TIMEOUT_MS,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
    },
  });
  const store = runtime.store as ObjectStore;

  console.log(`Verifying the object-storage binding against ${config.endpoint ?? ''}...`);

  const key = `${VERIFY_KEY_PREFIX}${Date.now()}-${Math.random().toString(KEY_SUFFIX_RADIX).slice(KEY_SUFFIX_START)}.txt`;
  const body = `agi storage verify ${new Date().toISOString()}`;
  let failures = 0;

  try {
    await store.put({
      bucket,
      key,
      body: new TextEncoder().encode(body),
      contentType: 'text/plain',
    });
    ok(`put -> ${key}`);
  } catch (error) {
    fail('put', error);
    console.error('\nStorage verification FAILED, cannot upload. Check credentials and bucket.');
    process.exit(1);
  }

  const head = await store.head(bucket, key);
  if (head) ok('head (object exists in bucket)');
  else {
    fail('head', new Error('the object is not readable after the upload'));
    failures += 1;
  }

  const url = `${publicBaseUrl.replace(/\/$/u, '')}/${key}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (text !== body) throw new Error(`unexpected body: ${JSON.stringify(text)}`);
    ok(`public url served the object -> ${url}`);
  } catch (error) {
    fail(`public url fetch (${url})`, error);
    failures += 1;
  }

  try {
    await store.delete(bucket, key);
    ok('delete');
  } catch (error) {
    fail('delete', error);
    failures += 1;
  }

  if (await store.head(bucket, key)) {
    fail('confirm deletion', new Error('the object still exists after the delete'));
    failures += 1;
  } else {
    ok('confirm deletion (the object no longer exists)');
  }

  if (failures > 0) {
    console.error(`\nStorage verification FAILED (${failures} operation(s)).`);
    process.exit(1);
  }
  console.log('\nStorage verification PASSED: upload, public serve, and delete all work.');
}

main().catch((error: unknown) => {
  console.error('Unexpected error:', (error as { message?: string } | null)?.message ?? error);
  process.exit(1);
});
