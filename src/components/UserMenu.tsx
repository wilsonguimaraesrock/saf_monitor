'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, User } from 'lucide-react';

interface SessionUser {
  name: string;
  email: string;
  role: 'superadmin' | 'user';
}

export function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetch('/api/auth')
      .then((r) => r.json())
      .then((d: { user: SessionUser | null }) => setUser(d.user))
      .catch(() => setUser(null));
  }, []);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth', { method: 'DELETE' });
      router.push('/login');
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  if (!user) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="hidden sm:flex items-center gap-1.5 text-white/90 dark:text-slate-300">
        <User size={14} />
        <span className="text-sm font-medium leading-none max-w-[140px] truncate">{user.name}</span>
      </div>
      <button
        onClick={logout}
        disabled={loggingOut}
        title="Sair"
        className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors
          text-white/90 hover:text-white hover:bg-white/10
          dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800
          disabled:opacity-50"
      >
        <LogOut size={16} />
      </button>
    </div>
  );
}
