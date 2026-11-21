import { AuthEntryScreen, type AuthEntryParams } from '../login/AuthEntryScreen';

const SIGNUP_FALLBACK_REDIRECT = '/chat';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<AuthEntryParams>;
}) {
  return AuthEntryScreen({
    params: await searchParams,
    fallbackRedirect: SIGNUP_FALLBACK_REDIRECT,
  });
}
