import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

const REQUIRED_VARS = [
  'CLOUDFLARE_R2_ACCOUNT_ID',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'CLOUDFLARE_R2_BUCKET_NAME',
  'CLOUDFLARE_R2_PUBLIC_BASE_URL',
];

function ok(label) {
  console.log(`  ✓ ${label}`);
}
function fail(label, err) {
  console.error(`  ✗ ${label}: ${err?.message ?? err}`);
}

function publicUrlForKey(base, key) {
  return `${base.replace(/\/$/, '')}/${key}`;
}

async function main() {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`);
    console.error('Set them in the environment or apps/web/.env.local (never in chat / git).');
    process.exit(2);
  }

  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID.trim();
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID.trim();
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY.trim();
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME.trim();
  const publicBaseUrl = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL.trim();

  console.log('Verifying the Cloudflare R2 binding against the live bucket...');

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const key = `agi-verify/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
  const body = `agi r2 verify ${new Date().toISOString()}`;
  let failures = 0;

  try {
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'text/plain' }),
    );
    ok(`PutObjectCommand -> ${key}`);
  } catch (err) {
    fail('PutObjectCommand', err);
    console.error('\nR2 verification FAILED — cannot upload. Check credentials/bucket name.');
    process.exit(1);
  }

  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    ok('HeadObjectCommand (object exists in bucket)');
  } catch (err) {
    fail('HeadObjectCommand', err);
    failures += 1;
  }

  const url = publicUrlForKey(publicBaseUrl, key);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text !== body) throw new Error(`unexpected body: ${JSON.stringify(text)}`);
    ok(`public URL served the object -> ${url}`);
  } catch (err) {
    fail(`public URL fetch (${url})`, err);
    failures += 1;
  }

  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    ok('DeleteObjectCommand');
  } catch (err) {
    fail('DeleteObjectCommand', err);
    failures += 1;
  }

  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    fail('confirm deletion', new Error('object still exists after delete'));
    failures += 1;
  } catch {
    ok('confirm deletion (object no longer exists)');
  }

  if (failures > 0) {
    console.error(`\nR2 verification FAILED (${failures} op(s)). The binding may need a fix.`);
    process.exit(1);
  }
  console.log('\nR2 verification PASSED — upload, public serve, and delete all work end to end.');
}

main().catch((err) => {
  console.error('Unexpected error:', err?.message ?? err);
  process.exit(1);
});
