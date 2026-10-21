'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Operator sign-in.
 *
 * The dashboard reads the evidence ledger and starts adjudications, so it is
 * behind the operator credential. The key is exchanged for an HttpOnly
 * session cookie by `POST /api/session` and is never stored in the browser.
 */
export default function LoginPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/70 p-8">
        <h1 className="text-xl font-semibold tracking-tight">Referee · Operator sign-in</h1>
        <p className="mt-2 text-sm text-slate-400">
          This console reads the evidence ledger and runs adjudications. Enter the operator key to
          continue.
        </p>

        <Suspense fallback={<p className="mt-6 text-sm text-slate-500">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) {
        setError(
          res.status === 401
            ? 'That key was not accepted.'
            : 'Sign-in is not available: the service has no operator key configured.'
        );
        return;
      }
      const next = params?.get('next');
      router.replace(next && next.startsWith('/') ? next : '/');
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <label className="block text-xs font-mono uppercase tracking-wider text-slate-400">
        Operator key
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="current-password"
          required
          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
        />
      </label>

      {error ? (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
