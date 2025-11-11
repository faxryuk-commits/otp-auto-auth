import { Prisma } from '@prisma/client';
import { getConfig } from '../config';
import { prisma } from '../db';

interface SendOtpResult {
  success: boolean;
  response?: unknown;
  error?: unknown;
}

export async function sendOtp(phone: string, otp: string): Promise<SendOtpResult> {
  const config = getConfig();
  if (!config.WA_ACCESS_TOKEN || !config.WA_PHONE_NUMBER_ID) {
    throw new Error('WhatsApp Cloud API не настроен');
  }

  const url = new URL(
    `https://graph.facebook.com/v20.0/${config.WA_PHONE_NUMBER_ID}/messages`,
  );

  const payload = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: config.WA_TEMPLATE_NAME ?? 'auth_otp',
      language: {
        code: config.WA_TEMPLATE_LANG ?? 'ru',
      },
      components: [
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              text: otp,
            },
          ],
        },
      ],
    },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.WA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseBody = await res.json().catch(() => ({}));
    if (!res.ok) {
      await logAudit('wa', 'send_failed', {
        phone,
        responseBody,
        status: res.status,
      });
      console.error('WA sendOtp error', res.status, responseBody);
      return { success: false, error: responseBody };
    }

    return { success: true, response: responseBody };
  } catch (error) {
    await logAudit('wa', 'send_exception', {
      phone,
      error: String(error),
    });
    console.error('WA sendOtp exception', error);
    return { success: false, error };
  }
}

async function logAudit(channel: string, event: string, details: Prisma.InputJsonValue) {
  try {
    await prisma.auditLog.create({
      data: {
        channel,
        event,
        details,
      },
    });
  } catch (error) {
    console.error('Не удалось записать audit log', error);
  }
}
