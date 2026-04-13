// ============================================================
// TIPOS CENTRAIS DO SISTEMA DE MONITORAMENTO DE SAFs
// ============================================================

export type SafStatus =
  | 'aberto'
  | 'em_andamento'
  | 'aguardando_nossa_resposta'
  | 'aguardando_franquia'
  | 'resolvido'
  | 'cancelado';

export type PriorityCategory =
  | 'dsa_joy'
  | 'myrock'
  | 'plataformas_aulas'
  | 'suporte_emails'
  | 'outros'
  | 'nao_classificado';

export type AlertSeverity = 'info' | 'warning' | 'critical';

// -------------------------------------------------------
// Ticket bruto coletado pelo scraper
// -------------------------------------------------------
export interface RawTicket {
  externalId: string;
  number?: string;
  title: string;
  description?: string;
  status?: string;         // texto livre vindo do site (Status Atual do XLSX)
  statusResponse?: string; // coluna "Status resp." da listagem HTML (ex: "Aguardando Franqueadora")
  department?: string;     // coluna "Departamento" do dfranquias (ex: "DSA JOY", "MyRock") — fonte de verdade para categoria
  franchise?: string;
  service?: string;        // coluna "Serviço" — subcategoria (ex: "Bugs ou ajustes")
  responsible?: string;
  openedAt?: string;       // ISO string ou data bruta
  dueAt?: string;
  lastUpdatedAt?: string;
  updates?: RawTicketUpdate[];
  rawHtml?: string;
}

export interface RawTicketUpdate {
  author?: string;
  content?: string;
  occurredAt?: string;
  isOurs?: boolean;
}

// -------------------------------------------------------
// Ticket normalizado (após processamento)
// -------------------------------------------------------
export interface SafTicket {
  id: string;
  externalId: string;
  number?: string;
  title: string;
  description?: string;
  status: SafStatus;
  priorityCategory: PriorityCategory;
  priorityScore: number;   // 0–100
  franchise?: string;
  service?: string;
  responsible?: string;
  openedAt?: Date;
  dueAt?: Date;
  lastUpdatedAt?: Date;
  resolvedAt?: Date;
  isOverdue: boolean;
  daysOverdue: number;
  daysOpen: number;
  daysWaitingUs: number;
  awaitingOurResponse: boolean;
  clusterId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// -------------------------------------------------------
// Snapshot diário de ticket
// -------------------------------------------------------
export interface TicketSnapshot {
  ticketId: string;
  snapshotDate: string; // YYYY-MM-DD
  status: SafStatus;
  priorityScore: number;
  isOverdue: boolean;
  daysOverdue: number;
  daysOpen: number;
  awaitingOurResponse: boolean;
  priorityCategory: PriorityCategory;
}

// -------------------------------------------------------
// Cluster de tickets por assunto
// -------------------------------------------------------
export interface SafCluster {
  id: string;
  label: string;
  keywords: string[];
  ticketCount: number;
  isSpike: boolean;
  spikeThreshold: number;
}

// -------------------------------------------------------
// Alerta
// -------------------------------------------------------
export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  body: string;
  hash: string;
  sentVia: string[];
  sentAt?: Date;
  acknowledgedAt?: Date;
  createdAt: Date;
}

export type AlertType =
  | 'overdue'
  | 'awaiting'
  | 'oldest'
  | 'spike'
  | 'critical'
  | 'category_summary'
  | 'daily_summary';

// -------------------------------------------------------
// Resultado de execução do cron/agente
// -------------------------------------------------------
export interface CronRun {
  id: string;
  runType: 'scheduled' | 'on_demand';
  status: 'running' | 'success' | 'error';
  triggeredBy?: string;
  ticketsFound: number;
  ticketsNew: number;
  ticketsUpdated: number;
  alertsSent: number;
  errorMessage?: string;
  durationMs?: number;
  startedAt: Date;
  finishedAt?: Date;
}

// -------------------------------------------------------
// Estatísticas diárias agregadas
// -------------------------------------------------------
export interface DailyStats {
  statDate: string;  // YYYY-MM-DD
  totalOpen: number;
  totalOverdue: number;
  totalAwaitingOur: number;
  totalCritical: number;
  totalResolvedToday: number;
  avgResponseTimeHours: number;
  avgResolutionTimeHours: number;
  countDsaJoy: number;
  countMyrock: number;
  countPlataformasAulas: number;
  countSuporteEmails: number;
  countOutros: number;
}

// -------------------------------------------------------
// Resultado de score de prioridade
// -------------------------------------------------------
export interface PriorityScoreResult {
  score: number;          // 0–100
  breakdown: {
    overdue: number;
    daysOpen: number;
    daysWaiting: number;
    categoryBonus: number;
    staleness: number;
  };
  isCritical: boolean;
}

// -------------------------------------------------------
// Resultado do agente de scraping
// -------------------------------------------------------
export interface ScraperResult {
  tickets: RawTicket[];
  totalFound: number;
  pagesScraped: number;
  errors: string[];
  durationMs: number;
}

// -------------------------------------------------------
// Payload de mensagem WhatsApp
// -------------------------------------------------------
export interface WhatsAppMessage {
  to: string;          // número com código do país, sem +
  body: string;
}

export interface DashboardStats {
  totalOpen: number;
  totalOverdue: number;
  totalAwaitingOur: number;
  totalCritical: number;
  totalResolvedToday: number;
  avgResponseTimeHours: number;
  avgResolutionTimeHours: number;
  byCategory: Record<PriorityCategory, number>;
  oldestTickets: SafTicket[];
  overdueTickets: SafTicket[];
  awaitingTickets: SafTicket[];
  criticalTickets: SafTicket[];
  clusters: SafCluster[];
  trend: DailyStats[];
}
