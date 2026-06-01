// Server Component — sem 'use client', logo renderiza igual às outras páginas
import Image from 'next/image';
import { DarkModeToggle } from '@/components/DarkModeToggle';
import { LoginForm } from './LoginForm';

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-slate-950 flex flex-col">

      {/* Header Server Component — mesma estrutura das páginas internas */}
      <header className="bg-gradient-to-r from-orange-600 to-amber-600 border-b border-orange-700 dark:from-slate-900 dark:to-slate-900 dark:border-slate-800">
        <div className="max-w-screen-2xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Image
              src="/logo-rockfeller-branca.png"
              alt="Rockfeller"
              width={794}
              height={77}
              className="h-3.5 w-auto"
              priority
            />
            <div className="w-px h-6 bg-orange-300/50 dark:bg-slate-700" />
            <div>
              <h1 className="text-base font-bold text-white dark:text-slate-100 leading-tight">
                Monitoramento de SAFs
              </h1>
              <p className="text-xs text-orange-100 dark:text-slate-600">Rockfeller</p>
            </div>
          </div>
          <DarkModeToggle />
        </div>
      </header>

      {/* Formulário Client Component (usa useSearchParams) */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-800 p-8">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
