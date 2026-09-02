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
  ClipboardList, Package, Rocket, Users2, GraduationCap as CapIcon,
  DollarSign, MoreHorizontal,
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
  /** ID do team no Chatwoot (departamento) — usado para filtrar conversas */
  teamId: number;
  /** ID da inbox WhatsApp única — usada para CSAT */
  inboxId: number;
  inboxName: string;
  /**
   * Nome do departamento no cadastro do ChatBot Whats Franquias, quando difere
   * do nome do setor aqui. Usado só para pré-selecionar o departamento no
   * "Iniciar conversa" — sem correspondência, o atendente escolhe na lista.
   */
  chatbotDepartment?: string;
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

// Rótulos finos de department gerados pelo classificador de Operações
// (ver classifyOperationsDepartment em src/engine/classifier.ts).
const ADM_TURMAS      = 'Adm · Turmas e Aulas';
const ADM_ALUNOS      = 'Adm · Alunos e Contratos';
const ADM_MATERIAIS   = 'Adm · Materiais Didáticos';
const ADM_FINANCEIRO  = 'Adm · Financeiro';
const ADM_OUTROS      = 'Adm · Outros';

export const SECTORS: Sector[] = [
  {
    slug:   'pd-i',
    name:   'PD&I',
    // Variantes de capitalização presentes no dfranquias — manter todas
    departments: ['DSA JOY', 'MyRock', 'My Rock', 'Plataformas de Aulas', 'Plataformas de aulas', 'Suporte E-mails'],
    displayDepartments: ['DSA JOY', 'MyRock', 'Plataformas de Aulas', 'Suporte E-mails'],
    icon:   FlaskConical,
    color:  'purple',
    chatwoot: { teamId: 3, inboxId: 11, inboxName: 'WhatsApp – Rockfeller', chatbotDepartment: 'Tecnologia' },
    showCategoryBreakdown: true,
  },
  {
    slug:   'administrativo',
    name:   'Administrativo',
    // 'Relacionamento' é compartilhado com o MKT — mantido aqui no subgrupo "Outros"
    departments: [ADM_TURMAS, ADM_ALUNOS, ADM_MATERIAIS, ADM_FINANCEIRO, ADM_OUTROS, 'Relacionamento'],
    displayDepartments: ['Turmas e Aulas', 'Alunos e Contratos', 'Materiais Didáticos', 'Financeiro', 'Outros'],
    icon:   ClipboardList,
    color:  'cyan',
    subdepartments: [
      { slug: 'turmas-e-aulas',      name: 'Turmas e Aulas',      departments: [ADM_TURMAS],                   icon: CapIcon,          color: 'cyan' },
      { slug: 'alunos-e-contratos',  name: 'Alunos e Contratos',  departments: [ADM_ALUNOS],                   icon: Users2,           color: 'purple' },
      { slug: 'materiais-didaticos', name: 'Materiais Didáticos', departments: [ADM_MATERIAIS],                icon: BookOpen,         color: 'orange' },
      { slug: 'financeiro',          name: 'Financeiro',          departments: [ADM_FINANCEIRO],               icon: DollarSign,       color: 'emerald' },
      { slug: 'outros',              name: 'Outros',              departments: [ADM_OUTROS, 'Relacionamento'], icon: MoreHorizontal,   color: 'default' },
    ],
    chatwoot: { teamId: 10, inboxId: 11, inboxName: 'WhatsApp – Rockfeller' },
  },
  {
    slug:   'logistica',
    name:   'Logística',
    departments: ['Logística'],
    icon:   Package,
    color:  'orange',
    chatwoot: { teamId: 9, inboxId: 11, inboxName: 'WhatsApp – Rockfeller' },
  },
  {
    slug:   'implantacao',
    name:   'Implantação',
    departments: ['Implantação'],
    icon:   Rocket,
    color:  'warning',
    chatwoot: { teamId: 11, inboxId: 11, inboxName: 'WhatsApp – Rockfeller' },
  },
  {
    slug:   'pedagogico',
    name:   'Pedagógico',
    departments: ["Adults 60'", 'Pedagógico'],
    icon:   GraduationCap,
    color:  'emerald',
    chatwoot: { teamId: 7, inboxId: 11, inboxName: 'WhatsApp – Rockfeller' },
  },
  {
    slug:   'comercial',
    name:   'Comercial',
    departments: ['Comercial'],
    icon:   TrendingUp,
    color:  'default',
    chatwoot: { teamId: 5, inboxId: 11, inboxName: 'WhatsApp – Rockfeller' },
  },
  {
    slug:   'mkt',
    name:   'MKT',
    departments: ['Relacionamento'],
    displayDepartments: ['Marketing'],
    icon:   Megaphone,
    color:  'warning',
    chatwoot: { teamId: 4, inboxId: 11, inboxName: 'WhatsApp – Rockfeller', chatbotDepartment: 'Marketing' },
  },
  {
    slug:   'treinamentos',
    name:   'Treinamentos',
    departments: ['Rockfeller Academy'],
    displayDepartments: ['Rock Academy'],
    icon:   Award,
    color:  'critical',
    chatwoot: { teamId: 8, inboxId: 11, inboxName: 'WhatsApp – Rockfeller', chatbotDepartment: 'Rock Academy' },
  },
  {
    slug:   'financeiro',
    name:   'Financeiro',
    departments: ['Financeiro'],
    icon:   Landmark,
    color:  'emerald',
    chatwoot: { teamId: 6, inboxId: 11, inboxName: 'WhatsApp – Rockfeller' },
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
  // Operações foi dividido em Administrativo / Logística / Implantação
  if (slug === 'operacoes')          return { slug: 'administrativo' };
  if (slug === 'atendimento-adm')    return { slug: 'administrativo' };
  if (slug === 'material-didatico')  return { slug: 'administrativo', subdepartment: 'materiais-didaticos' };
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
  const opsFallback = process.env.TELEGRAM_CHAT_ID_OPERACOES?.trim();

  // Os 3 setores nascidos de Operações usam o próprio grupo se configurado,
  // senão caem no grupo legado de Operações (evita perder notificação).
  const envMap: Record<string, string | undefined> = {
    'pd-i':           process.env.TELEGRAM_CHAT_ID_PDI,
    'administrativo': process.env.TELEGRAM_CHAT_ID_ADMINISTRATIVO ?? opsFallback,
    'logistica':      process.env.TELEGRAM_CHAT_ID_LOGISTICA ?? opsFallback,
    'implantacao':    process.env.TELEGRAM_CHAT_ID_IMPLANTACAO ?? opsFallback,
    'pedagogico':     process.env.TELEGRAM_CHAT_ID_PEDAGOGICO,
    'comercial':      process.env.TELEGRAM_CHAT_ID_COMERCIAL,
    'mkt':            process.env.TELEGRAM_CHAT_ID_MKT,
    'treinamentos':   process.env.TELEGRAM_CHAT_ID_TREINAMENTOS,
    'financeiro':     process.env.TELEGRAM_CHAT_ID_FINANCEIRO,
  };

  const ids: string[] = [];
  const sectorId = envMap[slug];
  if (sectorId?.trim()) ids.push(sectorId.trim());

  // GERAL recebe apenas o resumo consolidado (no final de runReport),
  // não cada report individual de setor — evita flood no grupo.
  return ids;
}
