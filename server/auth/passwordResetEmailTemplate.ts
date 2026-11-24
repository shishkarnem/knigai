export const EMAIL_LOGO_URL =
  'https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKlJzP2IIL1oQCjoEThIgKi0MYxcxISMRAhEHdCR9FhszIE1gBBEoIy0sKwweK3cYUj4zexQiH30dPRc-ADMANAJpFx5KYQ10VAZoeE9xT2ITKSwDIBgyHjAVAw1-KlN6KRMrMhQqHDgUIz1aDHQqE3lqUjodH2B7SXdLaGFeUXxjXVA.png';

export const EMAIL_BANNER_URL =
  'https://file.pro-talk.ru/tgf/GTUpJwQ9JCkYKlJzP2IIL1oQCjoETh4gKi0MbSRfOBUlVCtFcVUAMmYvDBcBNB0lChssK2kBKEQeQj4zexQjEQQ7ECo5HB89VQEqECN3FHYHIHxlCjgIQxoTFBh9Yl9dbWtRAG0AfCBzGQ0DMCAfMB9REREBWhEqOmQuWzQvYiEtHnIedSoZK3Y9ERR0Y1IGawR2UgRkckB1Qg.jpg';

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface PasswordResetEmailParams {
  recipientName: string;
  recipientEmail: string;
  code: string;
  resetUrl: string;
  siteOrigin: string;
  expiresMinutes?: number;
}

export function buildPasswordResetHtmlEmail(params: PasswordResetEmailParams): string {
  const safeName = escapeHtml(params.recipientName || 'Автор KnigAI');
  const safeEmail = escapeHtml(params.recipientEmail);
  const formattedCode = escapeHtml(
    params.code.length === 6 ? `${params.code.slice(0, 3)} ${params.code.slice(3)}` : params.code
  );
  const safeResetUrl = escapeHtml(params.resetUrl);
  const safeOrigin = escapeHtml(params.siteOrigin || 'https://knigai.ru');
  const ttl = params.expiresMinutes || 15;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <title>Восстановление пароля — KnigAI</title>
</head>
<body style="margin:0;padding:0;background-color:#050507;color:#ffffff;font-family:Georgia,'Times New Roman',serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#050507;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background-color:#000000;border:2px solid #ffffff;border-radius:0;">
          <!-- Top Crimson Accent Rule -->
          <tr>
            <td style="height:4px;background-color:#e11d48;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Header Bar with Logo -->
          <tr>
            <td style="padding:20px 24px;background-color:#09090b;border-bottom:1px solid #27272a;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="left" valign="middle">
                    <a href="${safeOrigin}" target="_blank" style="text-decoration:none;color:#ffffff;display:inline-block;">
                      <img src="${EMAIL_LOGO_URL}" alt="KnigAI" height="42" style="display:block;height:42px;width:auto;max-width:190px;border:0;" />
                    </a>
                  </td>
                  <td align="right" valign="middle" style="font-family:Georgia,'Times New Roman',serif;font-size:14px;color:#d4d4d8;line-height:1.4;">
                    <span style="color:#ffffff;font-weight:bold;">Knig</span><span style="color:#e11d48;font-weight:bold;">AI</span>
                    <br />
                    <span style="font-size:13px;color:#a1a1aa;">ИИ-фабрика книг</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero Noir 16:9 Banner (Optimized External Link) -->
          <tr>
            <td style="padding:0;background-color:#000000;border-bottom:2px solid #e11d48;">
              <img
                src="${EMAIL_BANNER_URL}"
                alt="Ключ восстановления доступа KnigAI"
                width="600"
                style="display:block;width:100%;max-width:600px;height:auto;border:0;"
              />
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding:28px 24px 24px 24px;background-color:#000000;">
              <h1 style="margin:0 0 14px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;font-weight:bold;color:#ffffff;">
                Восстановление <span style="color:#e11d48;">доступа</span> к кабинету
              </h1>

              <p style="margin:0 0 14px 0;font-size:16px;line-height:1.65;color:#e4e4e7;">
                Здравствуйте, <strong style="color:#ffffff;">${safeName}</strong>!
              </p>

              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.65;color:#d4d4d8;">
                Мы получили запрос на сброс пароля для вашей учетной записи
                <strong style="color:#ffffff;">${safeEmail}</strong> в платформе KnigAI.
                Вы можете ввести код подтверждения в окне входа или перейти по кнопке ниже, чтобы сразу задать новый пароль.
              </p>

              <!-- 6-Digit Verification Code Box -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 22px 0;background-color:#09090b;border:2px solid #e11d48;border-radius:0;">
                <tr>
                  <td align="center" style="padding:18px 16px;">
                    <div style="font-size:14px;color:#d4d4d8;margin-bottom:8px;">
                      Одноразовый код подтверждения (действует ${ttl} минут):
                    </div>
                    <div style="font-family:'Courier New',Courier,monospace;font-size:34px;line-height:1.2;font-weight:bold;letter-spacing:6px;color:#ffffff;">
                      ${formattedCode}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Primary Bubble CTA Button (Square Noir corners) -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 22px 0;">
                <tr>
                  <td align="center">
                    <a
                      href="${safeResetUrl}"
                      target="_blank"
                      style="display:inline-block;background-color:#e11d48;color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:16px;font-weight:bold;text-decoration:none;padding:15px 28px;border:2px solid #ffffff;border-radius:0;"
                    >
                      Задать новый пароль в KnigAI &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback URL Box -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px 0;background-color:#09090b;border:1px solid #27272a;border-radius:0;">
                <tr>
                  <td style="padding:14px 16px;">
                    <div style="font-size:14px;color:#a1a1aa;margin-bottom:6px;">
                      Если кнопка не открывается, скопируйте и вставьте эту ссылку в браузер:
                    </div>
                    <div style="font-family:'Courier New',Courier,monospace;font-size:13px;line-height:1.5;color:#f43f5e;word-break:break-all;">
                      <a href="${safeResetUrl}" target="_blank" style="color:#f43f5e;text-decoration:underline;">${safeResetUrl}</a>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Security Warning -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #27272a;">
                <tr>
                  <td style="padding-top:16px;font-size:14px;line-height:1.6;color:#a1a1aa;">
                    <span style="color:#e11d48;font-weight:bold;">Безопасность:</span>
                    код и ссылка одноразовые и автоматически сгорят через ${ttl} минут.
                    Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо — ваш текущий пароль останется без изменений.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Noir Footer -->
          <tr>
            <td style="padding:18px 24px;background-color:#09090b;border-top:1px solid #27272a;font-size:14px;line-height:1.5;color:#a1a1aa;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="left" valign="middle">
                    <span style="color:#ffffff;font-weight:bold;">Knig</span><span style="color:#e11d48;font-weight:bold;">AI</span> — ИИ-фабрика книг и аудиокниг
                  </td>
                  <td align="right" valign="middle">
                    <a href="https://knigai.ru" target="_blank" style="color:#d4d4d8;text-decoration:none;">knigai.ru</a>
                    &nbsp;&middot;&nbsp;
                    <a href="https://knigai.online" target="_blank" style="color:#d4d4d8;text-decoration:none;">knigai.online</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildPasswordResetTextFallback(params: PasswordResetEmailParams): string {
  const ttl = params.expiresMinutes || 15;
  return [
    `Здравствуйте, ${params.recipientName || 'Автор KnigAI'}!`,
    '',
    `Получен запрос на восстановление пароля для аккаунта ${params.recipientEmail} в KnigAI.`,
    `Ваш одноразовый код подтверждения: ${params.code} (действует ${ttl} минут).`,
    '',
    `Быстрая ссылка для смены пароля:`,
    params.resetUrl,
    '',
    'Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.',
    'С уважением, команда KnigAI (knigai.ru / knigai.online)',
  ].join('\n');
}
