import 'server-only';

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SHA_PATTERN = /^[0-9a-f]{7,40}$/;

function deployedCommit(): string {
  const candidates = [
    process.env['AGI_RELEASE_SHA'],
    process.env['VERCEL_GIT_COMMIT_SHA'],
    process.env['GITHUB_SHA'],
  ];
  const sha = candidates
    .map((value) => value?.trim().toLowerCase() ?? '')
    .find((value) => SHA_PATTERN.test(value));
  return sha ?? 'unknown';
}

export function GET() {
  return NextResponse.json(
    {
      commit: deployedCommit(),
      environment: process.env['VERCEL_ENV'] ?? 'unknown',
      deploymentId: process.env['VERCEL_DEPLOYMENT_ID'] ?? null,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
