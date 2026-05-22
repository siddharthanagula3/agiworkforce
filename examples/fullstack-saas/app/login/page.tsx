import { signInWithGitHub, signInWithPassword, signUpWithPassword } from '@/app/login/actions';

interface LoginPageProps {
  searchParams?: Promise<{ error?: string; message?: string; next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = params?.next ?? '/dashboard';

  return (
    <main className="auth-grid">
      <section>
        <h1>Secure workspace access.</h1>
        <p className="lede">
          Auth uses Supabase sessions, refreshed in middleware and enforced again inside every
          protected API route.
        </p>
        {params?.error ? <p role="alert">{params.error}</p> : null}
        {params?.message ? <p>{params.message}</p> : null}
      </section>
      <section className="panel">
        <form action={signInWithPassword}>
          <input type="hidden" name="next" value={next} />
          <label className="field">
            <span>Email</span>
            <input required type="email" name="email" autoComplete="email" />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              required
              minLength={8}
              type="password"
              name="password"
              autoComplete="current-password"
            />
          </label>
          <button className="button" type="submit">
            Sign in
          </button>
        </form>
        <form action={signUpWithPassword} style={{ marginTop: 16 }}>
          <label className="field">
            <span>New email</span>
            <input required type="email" name="email" autoComplete="email" />
          </label>
          <label className="field">
            <span>New password</span>
            <input
              required
              minLength={8}
              type="password"
              name="password"
              autoComplete="new-password"
            />
          </label>
          <button className="button secondary" type="submit">
            Create account
          </button>
        </form>
        <form action={signInWithGitHub} style={{ marginTop: 16 }}>
          <button className="button secondary" type="submit">
            Continue with GitHub
          </button>
        </form>
      </section>
    </main>
  );
}
