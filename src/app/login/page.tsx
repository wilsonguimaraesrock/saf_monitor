'use client';

import { useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Image from 'next/image';

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const from         = searchParams.get('from') ?? '/';

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`/api/auth?from=${encodeURIComponent(from)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        router.push(from);
        router.refresh();
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? 'Credenciais inválidas');
      }
    } catch {
      setError('Erro ao conectar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const inputClass = `w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700
    bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100
    placeholder-gray-400 dark:placeholder-slate-500
    focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm`;

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-800 p-8">

          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Image
                src="/logo-rockfeller-branca.png"
                alt="Rockfeller"
                width={180}
                height={18}
                className="h-8 w-auto dark:invert-0 invert"
                priority
              />
            </div>
            <h1 className="text-base font-bold text-gray-900 dark:text-slate-100">
              Monitoramento de SAFs
            </h1>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Acesse com suas credenciais</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoFocus
                autoComplete="email"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                Senha
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className={inputClass}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-2.5 px-4 rounded-xl bg-orange-600 hover:bg-orange-700
                         disabled:opacity-50 disabled:cursor-not-allowed
                         text-white text-sm font-semibold transition-colors"
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
