import { createHmac } from 'crypto';
import { createChildLogger } from './logger';

const log = createChildLogger('webhooks');

export interface WebhookPayload {
  event: 'scraper_complete' | 'manual_trigger';
  timestamp: string;
  data: unknown;
}

/**
 * Reads WEBHOOK_URL_1, WEBHOOK_URL_2, … from env and POSTs the payload to each.
 * Optionally signs the body with HMAC-SHA256 using WEBHOOK_SECRET if configured.
 */
export async function dispatchWebhooks(payload: WebhookPayload): Promise<void> {
  const secret = process.env.WEBHOOK_SECRET?.trim();

  const urls: string[] = [];
  let i = 1;
  while (process.env[`WEBHOOK_URL_${i}`]) {
    urls.push(process.env[`WEBHOOK_URL_${i}`]!.trim());
    i++;
  }

  if (urls.length === 0) return;

  const body = JSON.stringify(payload);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (secret) {
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    headers['X-SAF-Signature'] = `sha256=${sig}`;
  }

  await Promise.allSettled(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, { method: 'POST', headers, body });
        log.info(`Webhook ${url}: ${res.status}`);
      } catch (err) {
        log.error(`Webhook ${url} failed: ${(err as Error).message}`);
      }
    })
  );
}

/**
 * Builds the standard API payload for all sectors.
 * Shared by both the REST API and the webhook dispatch.
 */
export async function buildSectorsPayload(month?: string) {
  const { SECTORS } = await import('./sectors');
  const { getSectorStats, getSectorSlaStats } = await import('../repository/sectors');
  const { getChatwootLandingStats } = await import('../integrations/chatwoot');
  const { parseMonthParam, ymToDateRange } = await import('./month');

  const { ym } = parseMonthParam(month);
  const { dateFrom, dateTo } = ymToDateRange(ym);

  const sectors = await Promise.all(
    SECTORS.map(async (sector) => {
      const [statsRaw, sla] = await Promise.all([
        getSectorStats(sector.departments, { dateFrom, dateTo }) as Promise<Record<string, string> | null>,
        getSectorSlaStats(sector.departments),
      ]);

      const stats = {
        open:             Number(statsRaw?.total_open             ?? 0),
        monthTotal:       Number(statsRaw?.total_month            ?? 0),
        overdue:          Number(statsRaw?.total_overdue          ?? 0),
        awaiting:         Number(statsRaw?.total_awaiting         ?? 0),
        awaitingSchool:   Number(statsRaw?.total_awaiting_school  ?? 0),
        notOpened:        Number(statsRaw?.total_not_opened       ?? 0),
        noResponseStatus: Number(statsRaw?.total_no_response_status ?? 0),
        resolvedToday:    Number(statsRaw?.total_resolved_today   ?? 0),
      };

      let whatsapp: Record<string, unknown> | null = null;
      if (sector.chatwoot) {
        const { start, end } = parseMonthParam(month);
        const wa = await getChatwootLandingStats(
          sector.chatwoot.inboxId,
          sector.chatwoot.teamId,
          start,
          end,
        ).catch(() => null);
        if (wa) {
          whatsapp = {
            open:         wa.open,
            pending:      wa.pending,
            monthlyTotal: wa.monthlyTotal,
            csatAvg:      wa.csatAvg,
          };
        }
      }

      // Subdepartment breakdown if applicable
      const subdepartments = sector.subdepartments
        ? await Promise.all(
            sector.subdepartments.map(async (sub) => {
              const subStats = await getSectorStats(sub.departments, { dateFrom, dateTo }) as Record<string, string> | null;
              return {
                slug:  sub.slug,
                name:  sub.name,
                open:  Number(subStats?.total_open   ?? 0),
                overdue: Number(subStats?.total_overdue ?? 0),
                awaiting: Number(subStats?.total_awaiting ?? 0),
              };
            })
          )
        : undefined;

      return {
        slug:         sector.slug,
        name:         sector.name,
        departments:  sector.departments,
        safs:         stats,
        sla: {
          rate:               sla.slaRate,
          atRisk:             sla.atRisk,
          avgResolutionDays:  sla.avgResolutionDays,
          avgFirstResponseHours: sla.avgFirstResponseHours,
          noDeadline:         sla.noDeadline,
        },
        whatsapp,
        subdepartments,
      };
    })
  );

  return { month: ym, timestamp: new Date().toISOString(), sectors };
}
