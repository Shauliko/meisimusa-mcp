// Tool: topup_lookup — find an existing US line or eSIM and the top-up plans
// available for it. Wraps POST /web/topup/lookup. Call this before topup_start
// to get the product_id of the recharge plan you want.

import { z } from 'zod';
import type { Config } from '../config.js';
import { callBackend } from '../http.js';

export const TOPUP_LOOKUP_NAME = 'topup_lookup';

export const topupLookupDescription =
  'Look up an existing US prepaid line (by phone) or an eSIM (by ICCID / order) and list the top-up plans available for it. ' +
  'Returns product_ids to pass to topup_start.';

export const topupLookupInput = {
  line_type: z.enum(['us_prepaid', 'esim']).describe('"us_prepaid" for a US phone line, "esim" for a travel eSIM.'),
  phone: z.string().optional().describe('US phone number (for us_prepaid).'),
  carrier: z.string().optional().describe('Carrier name/id (for us_prepaid; see topup carriers).'),
  iccid: z.string().optional().describe('eSIM ICCID (for esim).'),
  email: z.string().email().optional().describe('Customer email (required for esim lookup).'),
};

export function makeTopupLookupHandler(cfg: Config) {
  return async (args: { line_type: string; phone?: string; carrier?: string; iccid?: string; email?: string }) => {
    const data: any = await callBackend(cfg, {
      method: 'POST',
      path: '/web/topup/lookup',
      body: {
        line_type: args.line_type,
        phone: args.phone,
        carrier: args.carrier,
        iccid: args.iccid,
        email: args.email,
      },
    });
    const lines = Array.isArray(data?.lines)
      ? data.lines.map((l: any) => ({
          line_type: l.line_type,
          line_label: l.line_label || '',
          phone: l.phone || null,
          iccid: l.iccid || null,
          carrier: l.carrier || null,
          carrier_id: l.carrier_id ?? null,
          source_order_id: l.source_order_id || null,
          plan_title: l.plan_title || null,
          topups: (l.addons || []).map((a: any) => ({
            product_id: a.id,
            description: a.description || '',
            data: a.dataLimit || '',
            validity: a.validity || '',
            price: Number(a.retailPrice || 0),
            is_range: !!a.isRtr,
            min: a.rtrMin ?? undefined,
            max: a.rtrMax ?? undefined,
          })),
        }))
      : [];
    const result = { lines, hint: data?.hint || undefined };
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], structuredContent: result };
  };
}
