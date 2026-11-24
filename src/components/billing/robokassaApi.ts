export interface RobokassaConfigInfo {
  success: boolean;
  configKey: string;
  domain: string;
  merchantLogin: string;
  receiptItemName: string;
  taxSystem: string;
  vatRate: string | null;
  isTest: boolean;
  detectedHost: string;
}

export interface RobokassaCreatePaymentResponse {
  success: boolean;
  paymentUrl?: string;
  invId?: number;
  outSum?: string;
  letters?: number;
  discountPercent?: number;
  domain?: string;
  merchantLogin?: string;
  receipt?: {
    items: Array<{
      name: string;
      quantity: number;
      sum: number;
      tax: string | null;
    }>;
  };
  error?: string;
}

export interface RobokassaOrderSummary {
  inv_id: number;
  user_uid: number;
  domain: string;
  merchant_login: string;
  letters_amount: number;
  amount_rub: number;
  out_sum: string;
  status: string;
  paid_at: string | null;
  created_at: string;
}

export interface RobokassaOrderStatusResponse {
  success: boolean;
  order?: RobokassaOrderSummary;
  currentBalance?: number | null;
  error?: string;
}

export interface UserConsentRecord {
  id: number;
  user_uid: number | null;
  email: string | null;
  consent_context: string;
  documents_accepted: string;
  document_version: string;
  domain: string | null;
  created_at: string;
}

export interface AdminSystemConfigRow {
  id: number;
  config_key: string;
  domain: string;
  provider: string;
  merchant_login: string;
  password_1_masked: string;
  password_2_masked: string;
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

export interface AdminPaymentOrderRow {
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
  paid_at: string | null;
  created_at: string;
}

export async function fetchRobokassaConfigInfo(): Promise<RobokassaConfigInfo> {
  const res = await fetch('/api/payments/robokassa/config-info', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Не удалось получить параметры оплаты Робокассы');
  }
  return data;
}

export async function initiateRobokassaPayment(params: {
  userUid: number;
  letters: number;
  email?: string;
  consentAccepted: boolean;
  consentContext?: string;
}): Promise<RobokassaCreatePaymentResponse> {
  const host = typeof window !== 'undefined' ? window.location.host : '';
  const res = await fetch('/api/payments/robokassa/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      userUid: params.userUid,
      letters: params.letters,
      email: params.email,
      consentAccepted: params.consentAccepted,
      consentContext: params.consentContext || 'robokassa_payment',
      host,
    }),
  });

  const data = (await res.json()) as RobokassaCreatePaymentResponse;
  if (!res.ok || !data.success || !data.paymentUrl) {
    throw new Error(data.error || 'Ошибка создания платежа в Робокассе');
  }
  if (!data.paymentUrl.startsWith('https://auth.robokassa.ru/')) {
    throw new Error('Некорректный адрес платежного шлюза Робокассы');
  }
  return data;
}

export async function fetchRobokassaOrderStatus(
  queryString: string
): Promise<RobokassaOrderStatusResponse> {
  const cleanQuery = queryString.startsWith('?') ? queryString : `?${queryString}`;
  const res = await fetch(`/api/payments/robokassa/status${cleanQuery}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const data = (await res.json()) as RobokassaOrderStatusResponse;
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Не удалось проверить статус платежа');
  }
  return data;
}

export async function recordUserConsent(params: {
  userUid?: number | null;
  email?: string | null;
  context: string;
  documents?: string[];
}): Promise<void> {
  try {
    await fetch('/api/consents/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userUid: params.userUid ?? null,
        email: params.email ?? null,
        context: params.context,
        documents: params.documents || ['oferta', 'agreement', 'privacy', 'consent'],
      }),
    });
  } catch {
    // Non-blocking fallback
  }
}

export async function fetchUserConsents(userUid: number): Promise<UserConsentRecord[]> {
  try {
    const res = await fetch(`/api/consents/history?userUid=${encodeURIComponent(String(userUid))}`);
    const data = await res.json();
    return Array.isArray(data?.consents) ? data.consents : [];
  } catch {
    return [];
  }
}

export async function fetchAdminSystemConfigs(): Promise<{
  configs: AdminSystemConfigRow[];
  orders: AdminPaymentOrderRow[];
  consents: UserConsentRecord[];
}> {
  const res = await fetch('/api/admin/system-configs', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Ошибка загрузки настроек Робокассы');
  }
  return {
    configs: Array.isArray(data.configs) ? data.configs : [],
    orders: Array.isArray(data.orders) ? data.orders : [],
    consents: Array.isArray(data.consents) ? data.consents : [],
  };
}

export async function updateAdminSystemConfig(
  id: number,
  payload: {
    domain: string;
    merchant_login: string;
    password_1?: string;
    password_2?: string;
    result_url: string;
    success_url: string;
    fail_url: string;
    receipt_item_name: string;
    tax_system: string;
    vat_rate: string | null;
    is_test: boolean;
    is_active: boolean;
  }
): Promise<AdminSystemConfigRow> {
  const res = await fetch(`/api/admin/system-configs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success || !data.config) {
    throw new Error(data.error || 'Не удалось сохранить конфигурацию Робокассы');
  }
  return data.config;
}
