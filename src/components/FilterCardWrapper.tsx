'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { clsx } from 'clsx';

interface FilterCardWrapperProps {
  children: React.ReactNode;
  filterKey?: string;   // qual param da URL setar (ex: 'overdue', 'category')
  filterValue?: string; // valor do param (ex: 'true', 'dsa_joy')
  clearAll?: boolean;   // se true, limpa TODOS os filtros
  isActive: boolean;    // computado no server (page.tsx)
}

export function FilterCardWrapper({
  children,
  filterKey,
  filterValue,
  clearAll,
  isActive,
}: FilterCardWrapperProps) {
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams = useSearchParams();

  function handleClick() {
    if (clearAll) {
      router.push(pathname);
      return;
    }
    if (!filterKey) return;

    const params = new URLSearchParams(searchParams.toString());
    if (isActive) {
      params.delete(filterKey);
    } else {
      params.set(filterKey, filterValue ?? 'true');
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      className={clsx(
        'h-full cursor-pointer rounded-2xl transition-all duration-150 outline-none',
        'hover:scale-[1.02] active:scale-[0.98]',
        isActive
          ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-950 shadow-lg shadow-blue-500/10'
          : 'hover:shadow-md'
      )}
    >
      {children}
    </div>
  );
}
