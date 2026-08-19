'use client';

import { useEffect, useState } from 'react';

interface Props {
  /** Intervalo entre atualizações, em segundos. */
  seconds: number;
}

/**
 * Recarrega a página em intervalo fixo. A página pública do dashboard costuma
 * ficar aberta indefinidamente numa TV ou num iframe, sem ninguém para apertar
 * F5 — o recarregamento completo é o caminho mais confiável nesse cenário
 * (sobrevive a erro transitório de rede, ao contrário de um fetch incremental).
 */
export function AutoRefresh({ seconds }: Props) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    const tick = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          window.location.reload();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  return (
    <span className="tabular-nums" suppressHydrationWarning>
      atualiza em {left}s
    </span>
  );
}
