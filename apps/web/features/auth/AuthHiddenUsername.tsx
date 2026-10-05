export function AuthHiddenUsername({ email }: { email: string }) {
  return (
    <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
  );
}
