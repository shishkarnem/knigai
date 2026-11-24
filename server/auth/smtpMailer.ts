import nodemailer from 'nodemailer';
import { getActiveMailConfig, MailConfigRow, QueryPgFn } from './mailConfigSchema';

export interface SendMailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

function buildTransporter(cfg: MailConfigRow, port: number, secure: boolean) {
  return nodemailer.createTransport({
    host: cfg.smtp_host,
    port,
    secure,
    requireTLS: !secure,
    auth: {
      user: cfg.username,
      pass: cfg.password,
    },
    connectionTimeout: 12000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: {
      minVersion: 'TLSv1.2',
      servername: cfg.smtp_host,
    },
  });
}

export async function sendMailViaDbConfig(
  queryPg: QueryPgFn,
  payload: SendMailPayload
): Promise<{ messageId: string; portUsed: number; senderEmail: string }> {
  const cfg = await getActiveMailConfig(queryPg);
  const primaryPort = Number(cfg.smtp_ssl_port) || 465;
  const fromHeader = `"${cfg.sender_name || 'KnigAI'}" <${cfg.sender_email || cfg.username}>`;

  const attempts: Array<{ port: number; secure: boolean }> = [
    { port: primaryPort, secure: primaryPort === 465 },
  ];
  if (primaryPort !== 587) {
    attempts.push({ port: 587, secure: false });
  }

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const transporter = buildTransporter(cfg, attempt.port, attempt.secure);
      const info = await transporter.sendMail({
        from: fromHeader,
        replyTo: cfg.sender_email || cfg.username,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      });
      return {
        messageId: info.messageId || 'sent',
        portUsed: attempt.port,
        senderEmail: cfg.sender_email || cfg.username,
      };
    } catch (err) {
      lastError = err;
      console.warn(
        `[KnigAI SMTP] Delivery attempt failed on ${cfg.smtp_host}:${attempt.port}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Не удалось подключиться к исходящему SMTP-серверу');
}

export async function verifySmtpConnection(queryPg: QueryPgFn): Promise<{
  ok: boolean;
  host: string;
  port: number;
  username: string;
  senderEmail: string;
  error?: string;
}> {
  const cfg = await getActiveMailConfig(queryPg);
  const primaryPort = Number(cfg.smtp_ssl_port) || 465;

  try {
    const transporter = buildTransporter(cfg, primaryPort, primaryPort === 465);
    await transporter.verify();
    return {
      ok: true,
      host: cfg.smtp_host,
      port: primaryPort,
      username: cfg.username,
      senderEmail: cfg.sender_email,
    };
  } catch (primaryErr) {
    try {
      const fallback = buildTransporter(cfg, 587, false);
      await fallback.verify();
      return {
        ok: true,
        host: cfg.smtp_host,
        port: 587,
        username: cfg.username,
        senderEmail: cfg.sender_email,
      };
    } catch {
      return {
        ok: false,
        host: cfg.smtp_host,
        port: primaryPort,
        username: cfg.username,
        senderEmail: cfg.sender_email,
        error: primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
      };
    }
  }
}
