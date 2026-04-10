'use client';

import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TrendPoint {
  stat_date: string | Date;
  total_open: number;
  total_overdue: number;
  total_awaiting_our: number;
  total_critical: number;
}

interface TrendChartProps {
  data: TrendPoint[];
}

function useIsDark() {
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

export function TrendChart({ data }: TrendChartProps) {
  const isDark = useIsDark();

  const gridColor     = isDark ? '#1e293b' : '#f1f5f9';
  const axisColor     = isDark ? '#94a3b8' : '#64748b';
  const tooltipBg     = isDark ? '#0f172a' : '#ffffff';
  const tooltipBorder = isDark ? '#1e293b' : '#e2e8f0';
  const tooltipText   = isDark ? '#e2e8f0' : '#1e293b';

  const formatted = data.map((d) => ({
    ...d,
    date: format(
      typeof d.stat_date === 'string' ? parseISO(d.stat_date) : new Date(d.stat_date),
      'dd/MM', { locale: ptBR }
    ),
  }));

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-5">
        Evolução Diária
      </h2>
      {formatted.length === 0 ? (
        <p className="text-sm text-center py-12 text-gray-400 dark:text-slate-600">Sem dados históricos</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={formatted} margin={{ top: 4, right: 16, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: axisColor }}
              axisLine={{ stroke: gridColor }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: axisColor }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: tooltipBg,
                border: `1px solid ${tooltipBorder}`,
                borderRadius: 10,
                fontSize: 12,
                color: tooltipText,
              }}
              labelStyle={{ color: axisColor, marginBottom: 4 }}
              labelFormatter={(l) => `Dia: ${l}`}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: axisColor }} />
            <Line type="monotone" dataKey="total_open"          stroke="#3b82f6" name="Abertos"      strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="total_overdue"       stroke="#ef4444" name="Atrasados"    strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="total_awaiting_our"  stroke="#f59e0b" name="Aguard. nós"  strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="total_critical"      stroke="#a78bfa" name="Críticos"     strokeWidth={2} dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
