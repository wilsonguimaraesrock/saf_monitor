'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface CategoryChartProps {
  dsaJoy: number;
  myrock: number;
  plataformasAulas: number;
  suporteEmails: number;
  outros: number;
}

const COLORS = ['#8b5cf6', '#f97316', '#06b6d4', '#10b981', '#6b7280'];

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

export function CategoryChart({ dsaJoy, myrock, plataformasAulas, suporteEmails, outros }: CategoryChartProps) {
  const isDark = useIsDark();

  const gridColor    = isDark ? '#1e293b' : '#f1f5f9';
  const axisColor    = isDark ? '#94a3b8' : '#64748b';
  const tooltipBg    = isDark ? '#0f172a' : '#ffffff';
  const tooltipBorder = isDark ? '#1e293b' : '#e2e8f0';
  const tooltipText  = isDark ? '#e2e8f0' : '#1e293b';

  const data = [
    { name: 'DSA JOY',    value: dsaJoy },
    { name: 'MyRock',     value: myrock },
    { name: 'Plataformas', value: plataformasAulas },
    { name: 'Emails',     value: suporteEmails },
    { name: 'Outros',     value: outros },
  ].filter((d) => d.value > 0);

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-5">
        Volume por Categoria
      </h2>
      {data.length === 0 ? (
        <p className="text-sm text-center py-12 text-gray-400 dark:text-slate-600">Sem dados</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 10, left: -14, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis
              dataKey="name"
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
              cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
            />
            <Bar dataKey="value" name="Tickets" radius={[5, 5, 0, 0]} maxBarSize={48}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
