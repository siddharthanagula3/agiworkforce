import { AuthEntryScreen, type AuthEntryParams } from '../login/AuthEntryScreen';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<AuthEntryParams>;
}) {
  return AuthEntryScreen({
    params: await searchParams,
  });
}
