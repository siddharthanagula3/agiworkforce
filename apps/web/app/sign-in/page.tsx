import { redirect } from 'next/navigation';

/**
 * /sign-in → /login alias.
 *
 * The desktop app's cloud-auth handoff (apps/desktop cloudAccountAuth.ts
 * openWebAccount) opens `${WEB_APP_URL}/sign-in?...`, and Clerk's default
 * path convention is /sign-in · but the web Clerk page lives at /login.
 * This stub keeps every external entry point working, preserving query
 * params (redirectTo, intent, …) for the login page.
 */
export default async function SignInAlias({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') qs.set(key, value);
    else if (Array.isArray(value) && value[0] != null) qs.set(key, value[0]);
  }
  const suffix = qs.size > 0 ? `?${qs.toString()}` : '';
  redirect(`/login${suffix}`);
}
