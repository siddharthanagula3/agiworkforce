import { AuthEntryScreen, type AuthEntryParams } from './AuthEntryScreen';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<AuthEntryParams>;
}) {
  return AuthEntryScreen({
    params: await searchParams,
  });
}
