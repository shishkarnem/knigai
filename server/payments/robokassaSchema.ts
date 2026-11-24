import type { QueryPgFn } from '../backup/backupTypes';

export interface SystemConfigRow {
  id: number;
  config_key: string;
  domain: string;
  provider: string;
  merchant_login: string;
  password_1: string;
  password_2: string;
  hash_algorithm: string;
  result_url: string;
  success_url: string;
  fail_url: string;
  receipt_item_name: string;
  tax_system: string;
  vat_rate: string | null;
  is_test: boolean;
  is_active: boolean;
  updated_at?: string;
}

export interface PaymentOrderRow {
  id: number;
  inv_id: number;
  user_uid: number;
  domain: string;
  config_key: string;
  merchant_login: string;
  letters_amount: number;
  amount_rub: string | number;
  out_sum: string;
  discount_percent: number;
  receipt_json: string;
  status: string;
  robokassa_signature: string | null;
  consent_accepted: boolean;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export const BASE_LETTERS_PACK = 100000;
export const BASE_LETTERS_PRICE_RUB = 15;
export const MIN_PURCHASE_RUBLES = 15;

export function calculateAuthoritativeLettersPrice(lettersCountRaw: number): {
  letters: number;
  baseRubles: number;
  discountPercent: number;
  discountRubles: number;
  finalRubles: number;
} {
  const safeNum = Number.isFinite(lettersCountRaw) ? Math.floor(lettersCountRaw) : BASE_LETTERS_PACK;
  const letters = Math.max(BASE_LETTERS_PACK, safeNum);
  const baseRubles = (letters / BASE_LETTERS_PACK) * BASE_LETTERS_PRICE_RUB;
  let discountPercent = 0;
  let finalRubles = baseRubles;

  if (letters >= 1000000000) {
    discountPercent = 33;
    finalRubles = (letters / 1000000000) * 100000;
  } else if (letters >= 100000000) {
    discountPercent = 20;
    finalRubles = baseRubles * 0.8;
  } else if (letters >= 10000000) {
    discountPercent = 10;
    finalRubles = baseRubles * 0.9;
  }

  const discountRubles = Math.round(baseRubles - finalRubles);
  finalRubles = Math.max(MIN_PURCHASE_RUBLES, Math.round(finalRubles));

  return {
    letters,
    baseRubles: Math.round(baseRubles),
    discountPercent,
    discountRubles,
    finalRubles,
  };
}

let paymentSchemaPromise: Promise<void> | null = null;

export async function ensurePaymentsSchema(queryPg: QueryPgFn): Promise<void> {
  if (!paymentSchemaPromise) {
    paymentSchemaPromise = (async () => {
      await queryPg(`
        CREATE TABLE IF NOT EXISTS system_configs (
          id BIGSERIAL PRIMARY KEY,
          config_key TEXT UNIQUE NOT NULL,
          domain TEXT NOT NULL,
          provider TEXT NOT NULL DEFAULT 'robokassa',
          merchant_login TEXT NOT NULL,
          password_1 TEXT NOT NULL,
          password_2 TEXT NOT NULL,
          hash_algorithm TEXT NOT NULL DEFAULT 'MD5',
          result_url TEXT NOT NULL,
          success_url TEXT NOT NULL,
          fail_url TEXT NOT NULL,
          receipt_item_name TEXT NOT NULL DEFAULT 'Виртуальные единицы Буквы',
          tax_system TEXT NOT NULL DEFAULT 'osn',
          vat_rate TEXT,
          is_test BOOLEAN DEFAULT false,
          is_active BOOLEAN DEFAULT true,
          updated_at TIMESTAMPTZ DEFAULT now()
        );
      `);

      // Seed strictly separated 2 Robokassa merchant rows into system_configs if missing
      await queryPg(
        `INSERT INTO system_configs (
          config_key, domain, provider, merchant_login, password_1, password_2,
          hash_algorithm, result_url, success_url, fail_url,
          receipt_item_name, tax_system, vat_rate, is_test, is_active
        ) VALUES (
          $1, $2, 'robokassa', $3, $4, $5,
          'MD5', $6, $7, $8,
          'Виртуальные единицы Буквы', 'osn', NULL, false, true
        )
        ON CONFLICT (config_key) DO NOTHING;`,
        [
          'robokassa_knigai_online',
          'knigai.online',
          'knigai.online',
          'knigaiPass1_2026',
          'knigaiPass2_2026',
          'https://knigai.online/api/payments/robokassa/result',
          'https://knigai.online/payment/success',
          'https://knigai.online/payment/fail',
        ]
      );

      await queryPg(
        `INSERT INTO system_configs (
          config_key, domain, provider, merchant_login, password_1, password_2,
          hash_algorithm, result_url, success_url, fail_url,
          receipt_item_name, tax_system, vat_rate, is_test, is_active
        ) VALUES (
          $1, $2, 'robokassa', $3, $4, $5,
          'MD5', $6, $7, $8,
          'Виртуальные единицы Буквы', 'osn', NULL, false, true
        )
        ON CONFLICT (config_key) DO NOTHING;`,
        [
          'robokassa_knigai_ru',
          'knigai.ru',
          'knigai.ru',
          'knigaiPass1_2026',
          'knigaiPass2_2026',
          'https://knigai.ru/api/payments/robokassa/result',
          'https://knigai.ru/payment/success',
          'https://knigai.ru/payment/fail',
        ]
      );

      // Migrate legacy iismm.ru merchant_login on knigai.ru config row to knigai.ru
      await queryPg(
        `UPDATE system_configs
         SET merchant_login = 'knigai.ru',
             result_url = 'https://knigai.ru/api/payments/robokassa/result',
             success_url = 'https://knigai.ru/payment/success',
             fail_url = 'https://knigai.ru/payment/fail',
             updated_at = now()
         WHERE config_key = 'robokassa_knigai_ru' AND merchant_login = 'iismm.ru';`
      );

      await queryPg(`
        CREATE TABLE IF NOT EXISTS payment_orders (
          id BIGSERIAL PRIMARY KEY,
          inv_id BIGINT UNIQUE NOT NULL,
          user_uid BIGINT NOT NULL,
          domain TEXT NOT NULL,
          config_key TEXT NOT NULL,
          merchant_login TEXT NOT NULL,
          letters_amount BIGINT NOT NULL,
          amount_rub NUMERIC(12, 2) NOT NULL,
          out_sum TEXT NOT NULL,
          discount_percent INT DEFAULT 0,
          receipt_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          robokassa_signature TEXT,
          consent_accepted BOOLEAN DEFAULT true,
          paid_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        );
      `);

      await queryPg(`
        CREATE TABLE IF NOT EXISTS user_consents (
          id BIGSERIAL PRIMARY KEY,
          user_uid BIGINT,
          email TEXT,
          consent_context TEXT NOT NULL,
          documents_accepted TEXT NOT NULL,
          document_version TEXT NOT NULL DEFAULT '2026-11-22',
          domain TEXT,
          ip_address TEXT,
          user_agent TEXT,
          created_at TIMESTAMPTZ DEFAULT now()
        );
      `);
    })().catch((err) => {
      paymentSchemaPromise = null;
      throw err;
    });
  }
  return paymentSchemaPromise;
}

export function normalizeDomainHost(rawHost: string): string {
  return String(rawHost || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '');
}

/**
 * Strictly fetches the active Robokassa merchant configuration from PostgreSQL system_configs
 * matched by the current request domain (or explicit configKey).
 */
export async function resolveSystemConfigFromDb(
  queryPg: QueryPgFn,
  rawHost: string,
  preferredConfigKey?: string
): Promise<SystemConfigRow> {
  await ensurePaymentsSchema(queryPg);

  const host = normalizeDomainHost(rawHost);
  const { rows } = await queryPg<SystemConfigRow>(
    `SELECT * FROM system_configs WHERE is_active = true ORDER BY id ASC;`
  );

  if (!rows || rows.length === 0) {
    throw new Error('В таблице system_configs не найдены активные настройки Робокассы');
  }

  if (preferredConfigKey) {
    const byKey = rows.find((r) => r.config_key === preferredConfigKey);
    if (byKey) return byKey;
  }

  if (host) {
    const byDomain = rows.find((r) => normalizeDomainHost(r.domain) === host);
    if (byDomain) return byDomain;

    const byMerchant = rows.find((r) => normalizeDomainHost(r.merchant_login) === host);
    if (byMerchant) return byMerchant;

    if (host.includes('knigai.online')) {
      const onlineCfg = rows.find((r) => r.config_key === 'robokassa_knigai_online');
      if (onlineCfg) return onlineCfg;
    }
    if (host.includes('knigai.ru') || host.includes('iismm.ru')) {
      const ruCfg = rows.find((r) => r.config_key === 'robokassa_knigai_ru');
      if (ruCfg) return ruCfg;
    }
  }

  // Fallback for preview/localhost domains: return the primary active DB row from system_configs
  return rows[0];
}
