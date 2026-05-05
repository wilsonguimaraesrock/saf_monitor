'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export function DarkModeToggle() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
      className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors
        text-white/90 hover:text-white hover:bg-white/10
        dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
