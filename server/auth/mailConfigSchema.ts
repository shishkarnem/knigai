export type QueryPgFn = <T = Record<string, unknown>>(
  sql: string,
  params?: (string | number | boolean | null)[],
  safeMode?: boolean
) => Promise<{ rows: T[]; rowCount: number }>;

export interface MailConfigRow {
  id: number;
  config_key: string;
  provider: string;
  username: string;
  sender_name: string;
  sender_email: string;
  password: string;
  incoming_host: string;
  pop3_port: number;
  pop3_ssl_port: number;
  imap_port: number;
  imap_ssl_port: number;
  smtp_host: string;
  smtp_ports: string;
  smtp_ssl_port: number;
  smtp_use_tls: boolean;
  is_active: boolean;
  updated_at?: string;
}

export const DEFAULT_MAIL_CONFIG = {
  config_key: 'regru_primary',
  provider: 'mail.hosting.reg.ru',
  username: 'info@arenda-ropa.com',
  sender_name: 'KnigAI',
  sender_email: 'info@arenda-ropa.com',
  password: process.env.SMTP_PASSWORD || 'eV5?rW4?fEiP5*mC',
  incoming_host: 'mail.hosting.reg.ru',
  pop3_port: 110,
  pop3_ssl_port: 995,
  imap_port: 143,
  imap_ssl_port: 993,
  smtp_host: 'mail.hosting.reg.ru',
  smtp_ports: '25:465:587',
  smtp_ssl_port: 465,
  smtp_use_tls: true,
  is_active: true,
};

let mailSchemaReady = false;
let mailSchemaPromise: Promise<void> | null = null;

export async function ensureMailAndAuthSchema(queryPg: QueryPgFn): Promise<void> {
  if (mailSchemaReady) return;
  if (mailSchemaPromise) return mailSchemaPromise;

  mailSchemaPromise = (async () => {
    const statements = [
      `CREATE TABLE IF NOT EXISTS mail_configs (
        id BIGSERIAL PRIMARY KEY,
        config_key TEXT UNIQUE NOT NULL,
        provider TEXT NOT NULL DEFAULT 'mail.hosting.reg.ru',
        username TEXT NOT NULL,
        sender_name TEXT NOT NULL DEFAULT 'KnigAI',
        sender_email TEXT NOT NULL,
        password TEXT NOT NULL,
        incoming_host TEXT NOT NULL DEFAULT 'mail.hosting.reg.ru',
        pop3_port INT NOT NULL DEFAULT 110,
        pop3_ssl_port INT NOT NULL DEFAULT 995,
        imap_port INT NOT NULL DEFAULT 143,
        imap_ssl_port INT NOT NULL DEFAULT 993,
        smtp_host TEXT NOT NULL DEFAULT 'mail.hosting.reg.ru',
        smtp_ports TEXT NOT NULL DEFAULT '25:465:587',
        smtp_ssl_port INT NOT NULL DEFAULT 465,
        smtp_use_tls BOOLEAN NOT NULL DEFAULT true,
        is_active BOOLEAN NOT NULL DEFAULT true,
        updated_at TIMESTAMPTZ DEFAULT now()
      );`,
      `CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id BIGSERIAL PRIMARY KEY,
        user_uid BIGINT NOT NULL,
        email TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        max_attempts INT NOT NULL DEFAULT 5,
        request_ip TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now()
      );`,
      `CREATE INDEX IF NOT EXISTS idx_pwd_reset_email_created ON password_reset_tokens (LOWER(email), created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_pwd_reset_token_hash ON password_reset_tokens (token_hash);`,
    ];

    for (const sql of statements) {
      await queryPg(sql);
    }

    await queryPg(
      `INSERT INTO mail_configs (
        config_key, provider, username, sender_name, sender_email, password,
        incoming_host, pop3_port, pop3_ssl_port, imap_port, imap_ssl_port,
        smtp_host, smtp_ports, smtp_ssl_port, smtp_use_tls, is_active
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16
      )
      ON CONFLICT (config_key) DO NOTHING;`,
      [
        DEFAULT_MAIL_CONFIG.config_key,
        DEFAULT_MAIL_CONFIG.provider,
        DEFAULT_MAIL_CONFIG.username,
        DEFAULT_MAIL_CONFIG.sender_name,
        DEFAULT_MAIL_CONFIG.sender_email,
        DEFAULT_MAIL_CONFIG.password,
        DEFAULT_MAIL_CONFIG.incoming_host,
        DEFAULT_MAIL_CONFIG.pop3_port,
        DEFAULT_MAIL_CONFIG.pop3_ssl_port,
        DEFAULT_MAIL_CONFIG.imap_port,
        DEFAULT_MAIL_CONFIG.imap_ssl_port,
        DEFAULT_MAIL_CONFIG.smtp_host,
        DEFAULT_MAIL_CONFIG.smtp_ports,
        DEFAULT_MAIL_CONFIG.smtp_ssl_port,
        DEFAULT_MAIL_CONFIG.smtp_use_tls,
        DEFAULT_MAIL_CONFIG.is_active,
      ]
    );
    mailSchemaReady = true;
  })().catch((err) => {
    mailSchemaPromise = null;
    throw err;
  });

  return mailSchemaPromise;
}

export async function getActiveMailConfig(queryPg: QueryPgFn): Promise<MailConfigRow> {
  await ensureMailAndAuthSchema(queryPg);
  const { rows } = await queryPg<MailConfigRow>(
    `SELECT * FROM mail_configs WHERE is_active = true ORDER BY (config_key = 'regru_primary') DESC, id ASC LIMIT 1;`
  );
  if (rows && rows.length > 0) {
    const row = rows[0];
    return {
      ...row,
      password: process.env.SMTP_PASSWORD || row.password || DEFAULT_MAIL_CONFIG.password,
    };
  }
  return {
    id: 0,
    ...DEFAULT_MAIL_CONFIG,
  };
}

export function maskMailSecret(secret?: string | null): string {
  const val = String(secret || '');
  if (!val) return 'Не задан';
  if (val.length <= 4) return '****';
  return `${val.slice(0, 2)}${'*'.repeat(Math.min(10, val.length - 4))}${val.slice(-2)}`;
}
