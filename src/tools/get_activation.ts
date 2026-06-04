// Tool 4: get_activation — fetch install QR + status for an order.
// Wraps GET /web/order/:order_id (public). order_id is what purchase returned.
// "ready" once the order is fulfilled and a QR/LPA exists; "pending" while
// awaiting payment or provisioning. The QR renders as an image when the order
// carries a base64 PNG, otherwise the LPA string is in activation_code.

import { z } from 'zod';
import type { Config } from '../config.js';
import { callBackend } from '../http.js';

export const GET_ACTIVATION_NAME = 'get_activation';

export const getActivationDescription =
  'Get the eSIM install QR code, activation (LPA) string, and status for an order. Pass the ' +
  'order_id from purchase. Status is "ready" when the profile can be installed (after the customer pays).';

export const getActivationInput = {
  order_id: z.string().describe('The order_id returned by purchase.'),
};

function looksLikePng(s: string): boolean {
  return /^data:image\/png/i.test(s) || /^iVBOR/.test(s);
}

const INSTALL_INSTRUCTIONS = {
  ios: 'Settings -> Cellular (Mobile Service) -> Add eSIM -> Use QR Code, or "Enter Details Manually" and paste the activation code. Keep your home SIM for calls; use the eSIM for data.',
  android: 'Settings -> Network & internet -> SIMs -> Add eSIM -> scan the QR, or "Enter manually" and paste the code. Wording varies by phone (Samsung: Connections -> SIM manager).',
};

export function makeGetActivationHandler(cfg: Config) {
  return async (args: { order_id: string }) => {
    const data: any = await callBackend(cfg, {
      method: 'GET',
      path: `/web/order/${encodeURIComponent(args.order_id)}`,
    });
    const order = data?.order || {};

    const state = String(order.order_state || '').toLowerCase();
    const paid = String(order.payment_status || '').toLowerCase() === 'paid';
    const qr = order.qr_code || null;
    const qrPng = typeof qr === 'string' && looksLikePng(qr) ? qr : null;
    const activationCode =
      order.activation_code ||
      order.lpa ||
      (typeof qr === 'string' && !looksLikePng(qr) ? qr : null) ||
      null;

    const haveProfile = !!(qrPng || activationCode);
    let status: 'ready' | 'pending' | 'expired';
    if (/fulfilled|completed|delivered/.test(state) && haveProfile) status = 'ready';
    else if (haveProfile && paid) status = 'ready';
    else status = 'pending';

    const result = {
      status,
      qr_code_png_base64: qrPng,
      activation_code: activationCode,
      install_instructions: INSTALL_INSTRUCTIONS,
      expires_at: order.expires_at || null,
    };

    const content: (
      | { type: 'text'; text: string }
      | { type: 'image'; data: string; mimeType: string }
    )[] = [{ type: 'text', text: JSON.stringify(result, null, 2) }];
    if (qrPng) {
      content.unshift({ type: 'image', data: qrPng.replace(/^data:image\/png;base64,/i, ''), mimeType: 'image/png' });
    }

    return { content, structuredContent: result };
  };
}
