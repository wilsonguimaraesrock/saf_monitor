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
  TrendingUp, Megaphone, Award, LayoutGrid, Landmark,
  type LucideIcon,
} from 'lucide-react';

export type SectorColor =
  'purple' | 'cyan' | 'orange' | 'emerald' | 'warning' | 'default' | 'critical';

export interface SectorSubdepartment {
  slug: string;
  name: string;
  departments: string[];
  icon: LucideIcon;
  color: SectorColor;
}

export interface SectorChatwootConfig {
  inboxId: number;
  inboxName: string;
}

export interface Sector {
  slug: string;
  name: string;
  /** Valores exatos do campo Departamento no dfranquias */
  departments: string[];
  /** Rótulos amigáveis para header/landing, sem duplicatas e aliases internos */
  displayDepartments?: string[];
  icon: LucideIcon;
  /** Tailwind color key usado nos StatCards e badges */
  color: SectorColor;
  /** Agrupamentos internos usados como subdepartamentos no dashboard */
  subdepartments?: SectorSubdepartment[];
  /** Inbox correspondente no Chatwoot */
  chatwoot?: SectorChatwootConfig;
  /** Se true, mostra breakdown por priority_category (DSA JOY, MyRock, etc.) */
  showCategoryBreakdown?: boolean;
}

const OPERATIONS_ADM_DEPARTMENTS = [
  'Atendimento e Sistema de Gestão',
  'Implantação',
  'Relacionamento',
  'Gerencia',
];

const OPERATIONS_MATERIAL_DEPARTMENTS = [
  'Material Didático',
  'Material didático',
  'Pedidos',
];

export const SECTORS: Sector[] = [
  {
    slug:   'pd-i',
    name:   'PD&I',
    // Variantes de capitalização presentes no dfranquias — manter todas
    departments: ['DSA JOY', 'MyRock', 'My Rock', 'Plataformas de Aulas', 'Plataformas de aulas', 'Suporte E-mails'],
    displayDepartments: ['DSA JOY', 'MyRock', 'Plataformas de Aulas', 'Suporte E-mails'],
    icon:   FlaskConical,
    color:  'purple',
    chatwoot: { inboxId: 9, inboxName: 'Tecnologia' },
    showCategoryBreakdown: true,
  },
  {
    slug:   'operacoes',
    name:   'Operações',
    departments: [...OPERATIONS_ADM_DEPARTMENTS, ...OPERATIONS_MATERIAL_DEPARTMENTS],
    displayDepartments: ['Atendimento ADM', 'Material Didático'],
    icon:   Headphones,
    color:  'cyan',
    subdepartments: [
      {
        slug: 'atendimento-adm',
        name: 'Atendimento ADM',
        departments: OPERATIONS_ADM_DEPARTMENTS,
        icon: Headphones,
        color: 'cyan',
      },
      {
        slug: 'material-didatico',
        name: 'Material Didático',
        departments: OPERATIONS_MATERIAL_DEPARTMENTS,
        icon: BookOpen,
        color: 'orange',
      },
    ],
    chatwoot: { inboxId: 8, inboxName: 'Operações' },
  },
  {
    slug:   'pedagogico',
    name:   'Pedagógico',
    departments: ["Adults 60'", 'Pedagógico'],
    icon:   GraduationCap,
    color:  'emerald',
    chatwoot: { inboxId: 5, inboxName: 'Pedagógico' },
  },
  {
    slug:   'comercial',
    name:   'Comercial',
    departments: ['Comercial'],
    icon:   TrendingUp,
    color:  'default',
    chatwoot: { inboxId: 6, inboxName: 'Comercial' },
  },
  {
    slug:   'mkt',
    name:   'MKT',
    departments: ['Relacionamento'],
    displayDepartments: ['Marketing'],
    icon:   Megaphone,
    color:  'warning',
    chatwoot: { inboxId: 7, inboxName: 'Marketing' },
  },
  {
    slug:   'treinamentos',
    name:   'Treinamentos',
    departments: ['Rockfeller Academy'],
    displayDepartments: ['Rock Academy'],
    icon:   Award,
    color:  'critical',
    chatwoot: { inboxId: 10, inboxName: 'Rock Academy' },
  },
  {
    slug:   'financeiro',
    name:   'Financeiro',
    departments: ['Financeiro'],
    icon:   Landmark,
    color:  'emerald',
    chatwoot: { inboxId: 4, inboxName: 'Financeiro' },
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

export function getSectorDisplayDepartments(sector: Sector): string[] {
  return sector.displayDepartments ?? sector.departments;
}

export function getSectorSubdepartment(sector: Sector, slug?: string): SectorSubdepartment | undefined {
  if (!slug) return undefined;
  return sector.subdepartments?.find((sub) => sub.slug === slug);
}

export function getLegacySectorRedirect(slug: string): { slug: string; subdepartment?: string } | null {
  if (slug === 'atendimento-adm') {
    return { slug: 'operacoes', subdepartment: 'atendimento-adm' };
  }
  if (slug === 'material-didatico') {
    return { slug: 'operacoes', subdepartment: 'material-didatico' };
  }
  return null;
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
  if (slug === 'operacoes') {
    const operationsId = process.env.TELEGRAM_CHAT_ID_OPERACOES?.trim();
    if (operationsId) return [operationsId];

    return [...new Set(
      [
        process.env.TELEGRAM_CHAT_ID_ATENDIMENTO_ADM,
        process.env.TELEGRAM_CHAT_ID_MATERIAL_DIDATICO,
      ]
        .map((value) => value?.trim())
        .filter((value): value is string => !!value)
    )];
  }

  const envMap: Record<string, string | undefined> = {
    'pd-i':          process.env.TELEGRAM_CHAT_ID_PDI,
    'pedagogico':    process.env.TELEGRAM_CHAT_ID_PEDAGOGICO,
    'comercial':     process.env.TELEGRAM_CHAT_ID_COMERCIAL,
    'mkt':           process.env.TELEGRAM_CHAT_ID_MKT,
    'treinamentos':  process.env.TELEGRAM_CHAT_ID_TREINAMENTOS,
    'financeiro':    process.env.TELEGRAM_CHAT_ID_FINANCEIRO,
  };

  const ids: string[] = [];
  const sectorId = envMap[slug];
  if (sectorId?.trim()) ids.push(sectorId.trim());

  // GERAL recebe apenas o resumo consolidado (no final de runReport),
  // não cada report individual de setor — evita flood no grupo.
  return ids;
}
