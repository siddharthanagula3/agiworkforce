import { AuthEntryScreen, type AuthEntryParams } from './AuthEntryScreen';

const LOGIN_FALLBACK_REDIRECT = '/';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<AuthEntryParams>;
}) {
  return AuthEntryScreen({
    params: await searchParams,
    fallbackRedirect: LOGIN_FALLBACK_REDIRECT,
  });
}
