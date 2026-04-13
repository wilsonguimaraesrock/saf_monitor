/**
 * Configuração central de setores.
 *
 * Cada setor agrupa um conjunto de valores do campo "Departamento"
 * do dfranquias. Um mesmo departamento pode aparecer em mais de um setor
 * (ex: "Relacionamento" está em Atendimento ADM e MKT).
 *
 * ⚠️ Os nomes em `departments` devem ser exatamente iguais ao que aparece
 * na coluna "Departamento" do dfranquias (case-sensitive).
 * Confirme os nomes do PD&I rodando o relatório e ajuste aqui se necessário.
 */

import {
  FlaskConical, Headphones, BookOpen, GraduationCap,
  TrendingUp, Megaphone, Award, LayoutGrid,
  type LucideIcon,
} from 'lucide-react';

export interface Sector {
  slug: string;
  name: string;
  /** Valores exatos do campo Departamento no dfranquias */
  departments: string[];
  icon: LucideIcon;
  /** Tailwind color key usado nos StatCards e badges */
  color: 'purple' | 'cyan' | 'orange' | 'emerald' | 'warning' | 'default' | 'critical';
  /** Se true, mostra breakdown por priority_category (DSA JOY, MyRock, etc.) */
  showCategoryBreakdown?: boolean;
}

export const SECTORS: Sector[] = [
  {
    slug:   'pd-i',
    name:   'PD&I',
    // ⚠️ Confirme os nomes exatos no dfranquias — vimos "DSA JOY" no relatório
    departments: ['DSA JOY', 'MyRock', 'Plataformas de Aulas', 'Suporte E-mails'],
    icon:   FlaskConical,
    color:  'purple',
    showCategoryBreakdown: true,
  },
  {
    slug:   'atendimento-adm',
    name:   'Atendimento ADM',
    departments: ['Atendimento e sistema de gestão', 'Implantação', 'Pedidos', 'Relacionamento'],
    icon:   Headphones,
    color:  'cyan',
  },
  {
    slug:   'material-didatico',
    name:   'Material Didático',
    departments: ['Material didático'],
    icon:   BookOpen,
    color:  'orange',
  },
  {
    slug:   'pedagogico',
    name:   'Pedagógico',
    departments: ["Adults 60'", 'Pedagógico'],
    icon:   GraduationCap,
    color:  'emerald',
  },
  {
    slug:   'comercial',
    name:   'Comercial',
    departments: ['Comercial'],
    icon:   TrendingUp,
    color:  'default',
  },
  {
    slug:   'mkt',
    name:   'MKT',
    // Compartilha "Relacionamento" e "Pedidos" com Atendimento ADM — esperado
    departments: ['Relacionamento', 'Pedidos'],
    icon:   Megaphone,
    color:  'warning',
  },
  {
    slug:   'treinamentos',
    name:   'Treinamentos',
    departments: ['Rockfeller Academy'],
    icon:   Award,
    color:  'critical',
  },
];

/** Setor especial "Geral" — aparece apenas na landing e agrega todos os setores */
export const SECTOR_GERAL = {
  slug: 'geral',
  name: 'Geral',
  icon: LayoutGrid,
};

export function getSectorBySlug(slug: string): Sector | undefined {
  return SECTORS.find((s) => s.slug === slug);
}

/** Retorna todos os departments de todos os setores (sem duplicatas) */
export function getAllDepartments(): string[] {
  return [...new Set(SECTORS.flatMap((s) => s.departments))];
}

/**
 * Retorna os chat IDs Telegram configurados via env vars para um setor.
 * Inclui automaticamente o chat ID do grupo "Geral" se configurado.
 */
export function getSectorTelegramChatIds(slug: string): string[] {
  const envMap: Record<string, string | undefined> = {
    'pd-i':                process.env.TELEGRAM_CHAT_ID_PDI,
    'atendimento-adm':     process.env.TELEGRAM_CHAT_ID_ATENDIMENTO_ADM,
    'material-didatico':   process.env.TELEGRAM_CHAT_ID_MATERIAL_DIDATICO,
    'pedagogico':          process.env.TELEGRAM_CHAT_ID_PEDAGOGICO,
    'comercial':           process.env.TELEGRAM_CHAT_ID_COMERCIAL,
    'mkt':                 process.env.TELEGRAM_CHAT_ID_MKT,
    'treinamentos':        process.env.TELEGRAM_CHAT_ID_TREINAMENTOS,
  };

  const ids: string[] = [];
  const sectorId = envMap[slug];
  if (sectorId?.trim()) ids.push(sectorId.trim());

  // Sempre inclui o grupo Geral (se configurado)
  const geral = process.env.TELEGRAM_CHAT_ID_GERAL?.trim();
  if (geral && !ids.includes(geral)) ids.push(geral);

  return ids;
}
