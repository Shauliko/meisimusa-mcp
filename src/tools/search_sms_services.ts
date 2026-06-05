// Tool: search_sms_services — list the services you can get a US verification
// number for (WhatsApp, Google, banking apps, etc.) with prices.
// Wraps GET /web/sms/services (public).

import { z } from 'zod';
import type { Config } from '../config.js';
import { callBackend } from '../http.js';

export const SEARCH_SMS_SERVICES_NAME = 'search_sms_services';

export const searchSmsServicesDescription =
  'Search the apps/services you can get a real US phone number for SMS verification (e.g. WhatsApp, Google, ' +
  'banking, dating apps). Returns a service_id + price. Use when the user needs to receive a verification code on a US number.';

export const searchSmsServicesInput = {
  query: z.string().optional().describe('Filter by service name, e.g. "whatsapp", "google".'),
  limit: z.number().int().positive().max(200).optional().describe('Max results (default 60).'),
};

interface RawService { id: number; serviceName?: string; capability?: string; durationDays?: number; label?: string; emoji?: string; priceUsd?: number; featured?: boolean; }

export function makeSearchSmsServicesHandler(cfg: Config) {
  return async (args: { query?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (args.query) qs.set('q', args.query);
    qs.set('limit', String(args.limit || 60));
    const raw = await callBackend<{ services?: RawService[]; totalCount?: number }>(cfg, {
      method: 'GET',
      path: `/web/sms/services?${qs.toString()}`,
    });
    const services = (raw?.services || []).map((s) => ({
      service_id: s.id,
      name: s.serviceName || s.label || '',
      label: s.label || s.serviceName || '',
      capability: s.capability || 'sms',
      duration_days: Number(s.durationDays || 0),
      price: Number(s.priceUsd || 0),
      currency: 'USD' as const,
      featured: !!s.featured,
    }));
    const result = {
      services,
      meta: { total_results: services.length, total_available: Number(raw?.totalCount || services.length), source: 'meisimusa' as const },
    };
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], structuredContent: result };
  };
}
