'use client';

import { useState, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';

const inputClass = [
  'w-full px-3.5 py-2.5 rounded-lg border text-sm',
  'border-gray-300 dark:border-slate-700',
  'bg-white dark:bg-slate-800',
  'text-gray-900 dark:text-slate-100',
  'placeholder-gray-400 dark:placeholder-slate-500',
  'focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent',
].join(' ');

function LoginFormInner() {
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

  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-orange-100 dark:bg-orange-900/30 mb-4">
        <Lock size={20} className="text-orange-600 dark:text-orange-400" />
      </div>
      <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-1">Acesso ao sistema</h2>
      <p className="text-xs text-gray-400 dark:text-slate-500 mb-7">Entre com suas credenciais</p>

      <form onSubmit={handleSubmit} className="space-y-4 text-left">
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
          className="w-full py-2.5 px-4 rounded-lg bg-orange-600 hover:bg-orange-700
                     disabled:opacity-50 disabled:cursor-not-allowed
                     text-white text-sm font-semibold transition-colors mt-2"
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

export function LoginForm() {
  return (
    <Suspense fallback={<div className="h-48" />}>
      <LoginFormInner />
    </Suspense>
  );
}
