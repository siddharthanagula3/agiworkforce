import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  verifyGitHubWebhookSignature,
  getInstallationAccessToken,
  getPrDiff,
  postIssueComment,
  GITHUB_WEBHOOK_SECRET,
} from '@/lib/github-app';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const GITHUB_BOT_LOGIN = process.env['GITHUB_BOT_LOGIN'] ?? 'agi-workforce[bot]';
const BOT_MENTION = '@agi-workforce';

// NOTE: No CSRF check - GitHub webhook HMAC-SHA256 signature IS the authentication
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'github-webhook');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // IMPORTANT: Read raw body BEFORE any JSON parsing - required for HMAC verification
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256') ?? '';

  if (
    !GITHUB_WEBHOOK_SECRET ||
    !verifyGitHubWebhookSignature(rawBody, signature, GITHUB_WEBHOOK_SECRET)
  ) {
    logger.warn({ signature }, 'GitHub webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = request.headers.get('x-github-event');
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Only handle new issue comments that mention the bot
  if (event !== 'issue_comment' || payload['action'] !== 'created') {
    return NextResponse.json({ received: true });
  }

  const commentBody: string =
    ((payload['comment'] as Record<string, unknown>)?.['body'] as string) ?? '';
  if (!commentBody.toLowerCase().includes(BOT_MENTION.toLowerCase())) {
    return NextResponse.json({ received: true });
  }

  // Prevent infinite loop - skip bot's own comments
  const sender = payload['sender'] as Record<string, unknown> | undefined;
  if (sender?.['type'] === 'Bot' || sender?.['login'] === GITHUB_BOT_LOGIN) {
    return NextResponse.json({ received: true });
  }

  // Only handle PR comments (issues without pull_request key are skipped)
  const issue = payload['issue'] as Record<string, unknown> | undefined;
  if (!issue?.['pull_request']) {
    return NextResponse.json({ received: true });
  }

  const installation = payload['installation'] as Record<string, unknown> | undefined;
  const repository = payload['repository'] as Record<string, unknown> | undefined;
  const installationId = installation?.['id'] as number | undefined;
  const fullName = repository?.['full_name'] as string | undefined;
  const prNumber = issue?.['number'] as number | undefined;

  if (!installationId || !fullName || !prNumber) {
    return NextResponse.json({ received: true });
  }

  const [owner, repo] = fullName.split('/');
  if (!owner || !repo) {
    return NextResponse.json({ received: true });
  }

  // Process review asynchronously - return 200 immediately so GitHub doesn't retry
  const processReview = async () => {
    try {
      const cookieStore = await cookies();
      const supabase = createServerClient(
        process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
        process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '',
        {
          cookies: {
            get(name: string) {
              return cookieStore.get(name)?.value;
            },
            set(name: string, value: string, options: CookieOptions) {
              cookieStore.set({ name, value, ...options });
            },
            remove(name: string, options: CookieOptions) {
              cookieStore.set({ name, value: '', ...options });
            },
          },
        },
      );

      const { data: installationRecord } = await supabase
        .from('github_installations')
        .select('user_id, pr_review_enabled, review_model')
        .eq('installation_id', installationId)
        .single();

      const token = await getInstallationAccessToken(installationId);

      if (!installationRecord) {
        await postIssueComment(
          token,
          owner,
          repo,
          prNumber,
          `To use AGI Workforce PR review, connect your GitHub account at [agiworkforce.com/chat](https://agiworkforce.com/chat).`,
        );
        return;
      }

      if (!installationRecord.pr_review_enabled) return;

      const diff = await getPrDiff(token, owner, repo, prNumber);

      const prompt = `You are a senior software engineer reviewing a GitHub PR. Provide:
1. 2-3 sentence summary of what this PR does
2. Specific code quality observations (bugs, security issues, style)
3. Suggested improvements with code examples where relevant
4. Overall verdict: LGTM / Needs Changes / Request Changes

Respond in GitHub Markdown, max 2000 characters.

---BEGIN DIFF DATA---
${diff}
---END DIFF DATA---`;

      const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
      if (!anthropicApiKey) {
        logger.error({}, 'ANTHROPIC_API_KEY not configured for GitHub PR review');
        return;
      }

      const reviewResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!reviewResponse.ok) {
        logger.error({ status: reviewResponse.status }, 'LLM call failed for PR review');
        return;
      }

      const llmData = (await reviewResponse.json()) as {
        content?: Array<{ text?: string }>;
      };
      const reviewText = llmData.content?.[0]?.text ?? 'Unable to generate review.';

      const reviewBody = `## AGI Workforce Code Review\n\n${reviewText}\n\n---\n*Reviewed by [AGI Workforce](https://agiworkforce.com) · [Disconnect](https://agiworkforce.com/chat)*`;

      await postIssueComment(token, owner, repo, prNumber, reviewBody);
    } catch (error) {
      logger.error({ error }, 'PR review processing error');
    }
  };

  // Use waitUntil if available (Vercel edge runtime), otherwise fire-and-forget
  const ctx = (request as unknown as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil;
  if (ctx) {
    ctx(processReview());
  } else {
    processReview().catch((err: unknown) => logger.error({ err }, 'PR review background error'));
  }

  return NextResponse.json({ received: true });
}
