'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Button, Input } from '@/components/ui';
import { Bot } from 'lucide-react';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({
        type: 'success',
        text: 'Check your email for the confirmation link.',
      });
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 py-12 text-white">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center text-center">
          <Link
            href="/"
            className="flex items-center gap-2 font-bold text-2xl tracking-tighter mb-6"
          >
            <Bot className="h-8 w-8 text-blue-500" />
            <span>AGI Workforce</span>
          </Link>
          <h2 className="text-3xl font-bold">Create an account</h2>
          <p className="mt-2 text-zinc-400">Start building your AI workforce today</p>
        </div>

        <form onSubmit={handleSignup} className="mt-8 space-y-4">
          <div>
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {message && (
            <p
              className={`text-sm p-3 rounded border ${
                message.type === 'error'
                  ? 'text-red-500 bg-red-500/10 border-red-500/20'
                  : 'text-green-500 bg-green-500/10 border-green-500/20'
              }`}
            >
              {message.text}
            </p>
          )}

          <Button type="submit" className="w-full h-12" disabled={loading}>
            {loading ? 'Creating account...' : 'Sign Up'}
          </Button>
        </form>

        <div className="text-center text-sm">
          <p className="text-zinc-400">
            Already have an account?{' '}
            <Link href="/login" className="text-white hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
