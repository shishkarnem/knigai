import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import type { QueryPgFn } from '../backup/backupTypes';
import {
  calculateAuthoritativeLettersPrice,
  ensurePaymentsSchema,
  normalizeDomainHost,
  PaymentOrderRow,
  resolveSystemConfigFromDb,
  SystemConfigRow,
} from './robokassaSchema';

function md5Lower(input: string): string {
  return crypto.createHash('md5').update(input, 'utf8').digest('hex').toLowerCase();
}

function formatSortedShpForSig(shpParams: Record<string, string>): string {
  const entries = Object.entries(shpParams)
    .filter(([k, v]) => k.startsWith('Shp_') && v !== undefined && v !== null)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${k}=${v}`).join(':');
}

function buildRobokassaInitSignature(params: {
  merchantLogin: string;
  outSum: string;
  invId: number;
  receiptJson: string;
  password1: string;
  shpParams: Record<string, string>;
}): string {
  const shpPart = formatSortedShpForSig(params.shpParams);
  const parts = [
    params.merchantLogin,
    params.outSum,
    String(params.invId),
    params.receiptJson,
    params.password1,
  ];
  if (shpPart) {
    parts.push(shpPart);
  }
  return md5Lower(parts.join(':'));
}

function buildRobokassaCallbackSignature(params: {
  outSum: string;
  invId: string | number;
  password: string;
  shpParams: Record<string, string>;
}): string {
  const shpPart = formatSortedShpForSig(params.shpParams);
  const parts = [String(params.outSum), String(params.invId), params.password];
  if (shpPart) {
    parts.push(shpPart);
  }
  return md5Lower(parts.join(':'));
}

function extractShpParams(source: Record<string, unknown>): Record<string, string> {
  const shp: Record<string, string> = {};
  for (const [key, val] of Object.entries(source || {})) {
    if (key.startsWith('Shp_') && val !== undefined && val !== null) {
      shp[key] = String(val);
    }
  }
  return shp;
}

function extractClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || '';
}

async function recordConsentRow(
  queryPg: QueryPgFn,
  params: {
    userUid: number | null;
    email?: string | null;
    context: string;
    documents: string[];
    domain: string;
    ipAddress: string;
    userAgent: string;
  }
): Promise<void> {
  await ensurePaymentsSchema(queryPg);
  await queryPg(
    `INSERT INTO user_consents (
      user_uid, email, consent_context, documents_accepted, document_version, domain, ip_address, user_agent
    ) VALUES ($1, $2, $3, $4, '2026-11-22', $5, $6, $7);`,
    [
      params.userUid,
      params.email || null,
      params.context,
      params.documents.join(','),
      params.domain,
      params.ipAddress,
      params.userAgent,
    ]
  );
}

async function settlePaidOrder(
  queryPg: QueryPgFn,
  orderId: number,
  signature: string
): Promise<{ newlyCredited: boolean; order: PaymentOrderRow | null; newBalance: number | null }> {
  // Atomically mark order as paid only if not already paid (prevents double-crediting)
  const updateRes = await queryPg<PaymentOrderRow>(
    `UPDATE payment_orders
     SET status = 'paid',
         robokassa_signature = $2,
         paid_at = COALESCE(paid_at, now()),
         updated_at = now()
     WHERE id = $1 AND status <> 'paid'
     RETURNING *;`,
    [orderId, signature]
  );

  if (!updateRes.rows || updateRes.rows.length === 0) {
    const existingRes = await queryPg<PaymentOrderRow>(
      'SELECT * FROM payment_orders WHERE id = $1 LIMIT 1;',
      [orderId]
    );
    return {
      newlyCredited: false,
      order: existingRes.rows[0] || null,
      newBalance: null,
    };
  }

  const paidOrder = updateRes.rows[0];
  const lettersToCredit = Number(paidOrder.letters_amount || 0);
  const userUid = Number(paidOrder.user_uid);

  const balRes = await queryPg<{ letters_balance: string | number }>(
    `UPDATE users
     SET letters_balance = COALESCE(letters_balance, 0) + $1
     WHERE uid = $2
     RETURNING letters_balance;`,
    [lettersToCredit, userUid]
  );

  const newBalance =
    balRes.rows[0]?.letters_balance !== undefined ? Number(balRes.rows[0].letters_balance) : lettersToCredit;

  await queryPg(
    `INSERT INTO transactions (user_uid, amount, balance_after, operation_type, description, details)
     VALUES ($1, $2, $3, 'topup', $4, $5::jsonb);`,
    [
      userUid,
      lettersToCredit,
      newBalance,
      `Оплата через Робокассу (#${paidOrder.inv_id}): +${lettersToCredit.toLocaleString('ru-RU')} букв (${paidOrder.out_sum} ₽)`,
      JSON.stringify({
        provider: 'robokassa',
        inv_id: paidOrder.inv_id,
        merchant_login: paidOrder.merchant_login,
        domain: paidOrder.domain,
        rubles: Number(paidOrder.amount_rub),
        discount_percent: paidOrder.discount_percent,
        vat: 'НДС 5% (ОСН)',
      }),
    ]
  );

  await queryPg(
    `INSERT INTO notifications (user_uid, type, title, message, is_read, link)
     VALUES ($1, 'billing', $2, $3, false, 'balance');`,
    [
      userUid,
      `Оплата #${paidOrder.inv_id} зачислена: +${lettersToCredit.toLocaleString('ru-RU')} букв`,
      `Платёж через Робокассу на сумму ${paidOrder.out_sum} ₽ успешно подтверждён. На ваш баланс зачислено ${lettersToCredit.toLocaleString('ru-RU')} букв.`,
    ]
  );

  return { newlyCredited: true, order: paidOrder, newBalance };
}

export function registerRobokassaRoutes(app: Express, queryPg: QueryPgFn): void {
  // 1. Resolve current domain public payment metadata (NO passwords exposed!)
  app.get('/api/payments/robokassa/config-info', async (req: Request, res: Response) => {
    try {
      const hostHeader = String(req.headers['x-forwarded-host'] || req.get('host') || '');
      const cfg = await resolveSystemConfigFromDb(queryPg, hostHeader);
      res.json({
        success: true,
        configKey: cfg.config_key,
        domain: cfg.domain,
        merchantLogin: cfg.merchant_login,
        receiptItemName: cfg.receipt_item_name,
        taxSystem: cfg.tax_system,
        vatRate: cfg.vat_rate,
        isTest: cfg.is_test,
        detectedHost: normalizeDomainHost(hostHeader),
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 2. Create real Robokassa order & signed redirect URL strictly using system_configs DB
  app.post('/api/payments/robokassa/create', async (req: Request, res: Response) => {
    try {
      await ensurePaymentsSchema(queryPg);

      const userUid = Number(req.body?.userUid);
      const rawLetters = Number(req.body?.letters);
      const consentAccepted = req.body?.consentAccepted === true;
      const userEmail = typeof req.body?.email === 'string' ? req.body.email.trim() : null;
      const consentContext =
        typeof req.body?.consentContext === 'string' && req.body.consentContext.trim()
          ? req.body.consentContext.trim()
          : 'robokassa_payment';

      if (!Number.isInteger(userUid) || userUid <= 0) {
        return res.status(400).json({ success: false, error: 'Необходима авторизация пользователя' });
      }
      if (!consentAccepted) {
        return res.status(400).json({
          success: false,
          error: 'Для перехода к оплате необходимо подтвердить согласие с офертой и политикой конфиденциальности.',
        });
      }

      const quote = calculateAuthoritativeLettersPrice(rawLetters);
      const hostHeader = String(
        req.body?.host || req.headers['x-forwarded-host'] || req.get('host') || ''
      );
      const cfg = await resolveSystemConfigFromDb(queryPg, hostHeader);

      // Record user legal consent history in PostgreSQL
      await recordConsentRow(queryPg, {
        userUid,
        email: userEmail,
        context: consentContext,
        documents: ['oferta', 'agreement', 'privacy', 'consent'],
        domain: normalizeDomainHost(hostHeader) || cfg.domain,
        ipAddress: extractClientIp(req),
        userAgent: String(req.headers['user-agent'] || ''),
      });

      const outSum = Number(quote.finalRubles).toFixed(2);
      const outSumNum = Number(outSum);
      const itemName = cfg.receipt_item_name || 'Виртуальные единицы Буквы';
      const taxValue = cfg.vat_rate && cfg.vat_rate.trim() ? cfg.vat_rate.trim() : null;

      // Robokassa Receipt JSON: quantity = letters count, sum = OutSum, tax = null (or vat_rate from system_configs)
      const receiptObj = {
        items: [
          {
            name: itemName,
            quantity: quote.letters,
            sum: outSumNum,
            tax: taxValue,
          },
        ],
      };
      const receiptJson = JSON.stringify(receiptObj);

      // Insert pending order first to allocate unique monotonic InvId within signed 32-bit range
      const tempInvId = -Math.floor(Date.now() % 2000000000) - Math.floor(Math.random() * 1000);
      const insertRes = await queryPg<PaymentOrderRow>(
        `INSERT INTO payment_orders (
          inv_id, user_uid, domain, config_key, merchant_login,
          letters_amount, amount_rub, out_sum, discount_percent,
          receipt_json, status, consent_accepted
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', true)
        RETURNING *;`,
        [
          tempInvId,
          userUid,
          cfg.domain,
          cfg.config_key,
          cfg.merchant_login,
          quote.letters,
          outSumNum,
          outSum,
          quote.discountPercent,
          receiptJson,
        ]
      );

      const createdOrder = insertRes.rows[0];
      const invId = 100000 + Number(createdOrder.id);

      await queryPg('UPDATE payment_orders SET inv_id = $1 WHERE id = $2;', [invId, createdOrder.id]);

      const shpParams: Record<string, string> = {
        Shp_config: cfg.config_key,
        Shp_letters: String(quote.letters),
        Shp_uid: String(userUid),
      };

      const signature = buildRobokassaInitSignature({
        merchantLogin: cfg.merchant_login,
        outSum,
        invId,
        receiptJson,
        password1: cfg.password_1,
        shpParams,
      });

      const queryParts: string[] = [
        `MerchantLogin=${encodeURIComponent(cfg.merchant_login)}`,
        `OutSum=${encodeURIComponent(outSum)}`,
        `InvId=${encodeURIComponent(String(invId))}`,
        `Description=${encodeURIComponent(`Пополнение: ${quote.letters.toLocaleString('ru-RU')} букв (KnigAI)`)}`,
        `Receipt=${encodeURIComponent(receiptJson)}`,
        `SignatureValue=${encodeURIComponent(signature)}`,
        `Culture=ru`,
        `Encoding=utf-8`,
        `Shp_config=${encodeURIComponent(shpParams.Shp_config)}`,
        `Shp_letters=${encodeURIComponent(shpParams.Shp_letters)}`,
        `Shp_uid=${encodeURIComponent(shpParams.Shp_uid)}`,
      ];

      if (userEmail) {
        queryParts.push(`Email=${encodeURIComponent(userEmail)}`);
      }
      if (cfg.is_test) {
        queryParts.push('IsTest=1');
      }

      const paymentUrl = `https://auth.robokassa.ru/Merchant/Index.aspx?${queryParts.join('&')}`;

      res.json({
        success: true,
        paymentUrl,
        invId,
        outSum,
        letters: quote.letters,
        discountPercent: quote.discountPercent,
        domain: cfg.domain,
        merchantLogin: cfg.merchant_login,
        receipt: receiptObj,
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 3. Robokassa Result URL callback (supports both POST and GET per Robokassa spec)
  app.all('/api/payments/robokassa/result', async (req: Request, res: Response) => {
    try {
      await ensurePaymentsSchema(queryPg);
      const source = req.method === 'POST' ? { ...req.query, ...req.body } : req.query;

      const outSum = String(source.OutSum || source.out_sum || '').trim();
      const invIdStr = String(source.InvId || source.inv_id || '').trim();
      const receivedSig = String(source.SignatureValue || source.signature || '').trim().toLowerCase();
      const invId = parseInt(invIdStr, 10);

      if (!outSum || !Number.isInteger(invId) || invId <= 0 || !receivedSig) {
        return res.status(400).send('bad params');
      }

      const shpParams = extractShpParams(source as Record<string, unknown>);
      const orderRes = await queryPg<PaymentOrderRow>(
        'SELECT * FROM payment_orders WHERE inv_id = $1 LIMIT 1;',
        [invId]
      );
      const order = orderRes.rows[0];

      if (!order) {
        return res.status(404).send('order not found');
      }

      const hostHeader = String(req.headers['x-forwarded-host'] || req.get('host') || '');
      const cfg = await resolveSystemConfigFromDb(
        queryPg,
        hostHeader,
        shpParams.Shp_config || order.config_key
      );

      const expectedSig = buildRobokassaCallbackSignature({
        outSum,
        invId: invIdStr,
        password: cfg.password_2,
        shpParams,
      });

      if (receivedSig !== expectedSig) {
        // Check all active system_configs rows in case proxy host differed
        const allCfgs = await queryPg<SystemConfigRow>(
          'SELECT * FROM system_configs WHERE is_active = true;'
        );
        const matchedAny = (allCfgs.rows || []).some(
          (row) =>
            buildRobokassaCallbackSignature({
              outSum,
              invId: invIdStr,
              password: row.password_2,
              shpParams,
            }) === receivedSig
        );
        if (!matchedAny) {
          console.warn(`[Robokassa Result] Invalid signature for InvId=${invIdStr}`);
          return res.status(403).send('bad sign');
        }
      }

      // Verify paid sum matches order OutSum
      if (Math.abs(Number(outSum) - Number(order.amount_rub)) > 0.01) {
        return res.status(400).send('bad sum');
      }

      await settlePaidOrder(queryPg, order.id, receivedSig);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(`OK${invId}`);
    } catch (err: unknown) {
      console.error('[Robokassa Result Error]:', err);
      res.status(500).send('internal error');
    }
  });

  // 4. Order status & Success URL verification helper (checks Password 1 signature safely on server)
  app.get('/api/payments/robokassa/status', async (req: Request, res: Response) => {
    try {
      await ensurePaymentsSchema(queryPg);
      const invId = parseInt(String(req.query.InvId || req.query.invId || ''), 10);
      if (!Number.isInteger(invId) || invId <= 0) {
        return res.status(400).json({ success: false, error: 'Некорректный InvId' });
      }

      const orderRes = await queryPg<PaymentOrderRow>(
        'SELECT * FROM payment_orders WHERE inv_id = $1 LIMIT 1;',
        [invId]
      );
      const order = orderRes.rows[0];
      if (!order) {
        return res.status(404).json({ success: false, error: 'Заказ не найден' });
      }

      let currentOrder = order;
      const outSum = String(req.query.OutSum || '');
      const sig = String(req.query.SignatureValue || '').trim().toLowerCase();

      // Optional fallback credit if Success URL arrives with valid Password 1 signature before Result URL webhook
      if (currentOrder.status !== 'paid' && outSum && sig) {
        const shpParams = extractShpParams(req.query as Record<string, unknown>);
        const hostHeader = String(req.headers['x-forwarded-host'] || req.get('host') || '');
        const cfg = await resolveSystemConfigFromDb(
          queryPg,
          hostHeader,
          shpParams.Shp_config || order.config_key
        );
        const expectedPass1Sig = buildRobokassaCallbackSignature({
          outSum,
          invId,
          password: cfg.password_1,
          shpParams,
        });
        if (sig === expectedPass1Sig && Math.abs(Number(outSum) - Number(order.amount_rub)) <= 0.01) {
          const settled = await settlePaidOrder(queryPg, order.id, sig);
          if (settled.order) {
            currentOrder = settled.order;
          }
        }
      }

      const userBalRes = await queryPg<{ letters_balance: string | number }>(
        'SELECT letters_balance FROM users WHERE uid = $1 LIMIT 1;',
        [currentOrder.user_uid]
      );
      const currentBalance =
        userBalRes.rows[0]?.letters_balance !== undefined
          ? Number(userBalRes.rows[0].letters_balance)
          : null;

      res.json({
        success: true,
        order: {
          inv_id: currentOrder.inv_id,
          user_uid: Number(currentOrder.user_uid),
          domain: currentOrder.domain,
          merchant_login: currentOrder.merchant_login,
          letters_amount: Number(currentOrder.letters_amount),
          amount_rub: Number(currentOrder.amount_rub),
          out_sum: currentOrder.out_sum,
          status: currentOrder.status,
          paid_at: currentOrder.paid_at,
          created_at: currentOrder.created_at,
        },
        currentBalance,
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 5. Record legal consent acceptance into PostgreSQL user_consents
  app.post('/api/consents/record', async (req: Request, res: Response) => {
    try {
      const userUidRaw = req.body?.userUid;
      const userUid = Number.isInteger(Number(userUidRaw)) && Number(userUidRaw) > 0 ? Number(userUidRaw) : null;
      const email = typeof req.body?.email === 'string' ? req.body.email.trim() : null;
      const context = typeof req.body?.context === 'string' ? req.body.context.trim() : 'registration';
      const docs = Array.isArray(req.body?.documents)
        ? req.body.documents.map((d: unknown) => String(d)).filter(Boolean)
        : ['oferta', 'agreement', 'privacy', 'consent'];

      const hostHeader = String(req.headers['x-forwarded-host'] || req.get('host') || '');
      await recordConsentRow(queryPg, {
        userUid,
        email,
        context,
        documents: docs,
        domain: normalizeDomainHost(hostHeader),
        ipAddress: extractClientIp(req),
        userAgent: String(req.headers['user-agent'] || ''),
      });

      res.json({ success: true });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 6. Get user's legal consent history
  app.get('/api/consents/history', async (req: Request, res: Response) => {
    try {
      await ensurePaymentsSchema(queryPg);
      const userUid = parseInt(String(req.query.userUid || ''), 10);
      if (!Number.isInteger(userUid) || userUid <= 0) {
        return res.json({ success: true, consents: [] });
      }
      const { rows } = await queryPg(
        `SELECT id, user_uid, email, consent_context, documents_accepted, document_version, domain, created_at
         FROM user_consents WHERE user_uid = $1 ORDER BY id DESC LIMIT 50;`,
        [userUid]
      );
      res.json({ success: true, consents: rows || [] });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        consents: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 7. Admin: List system_configs (masked passwords) & recent payment orders
  app.get('/api/admin/system-configs', async (_req: Request, res: Response) => {
    try {
      await ensurePaymentsSchema(queryPg);
      const [cfgRes, ordersRes, consentsRes] = await Promise.all([
        queryPg<SystemConfigRow>('SELECT * FROM system_configs ORDER BY id ASC;'),
        queryPg<PaymentOrderRow>('SELECT * FROM payment_orders ORDER BY id DESC LIMIT 50;'),
        queryPg('SELECT * FROM user_consents ORDER BY id DESC LIMIT 50;'),
      ]);

      const maskedConfigs = (cfgRes.rows || []).map((c) => ({
        ...c,
        password_1_masked: c.password_1 ? `${c.password_1.slice(0, 3)}***${c.password_1.slice(-2)}` : '',
        password_2_masked: c.password_2 ? `${c.password_2.slice(0, 3)}***${c.password_2.slice(-2)}` : '',
        password_1: undefined,
        password_2: undefined,
      }));

      res.json({
        success: true,
        configs: maskedConfigs,
        orders: ordersRes.rows || [],
        consents: consentsRes.rows || [],
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 8. Admin: Update a system_configs row in PostgreSQL
  app.put('/api/admin/system-configs/:id', async (req: Request, res: Response) => {
    try {
      await ensurePaymentsSchema(queryPg);
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ success: false, error: 'Некорректный ID конфигурации' });
      }

      const existingRes = await queryPg<SystemConfigRow>(
        'SELECT * FROM system_configs WHERE id = $1 LIMIT 1;',
        [id]
      );
      const existing = existingRes.rows[0];
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Конфигурация не найдена' });
      }

      const domain = String(req.body?.domain || existing.domain).trim();
      const merchantLogin = String(req.body?.merchant_login || existing.merchant_login).trim();
      const password1 =
        typeof req.body?.password_1 === 'string' && req.body.password_1.trim()
          ? req.body.password_1.trim()
          : existing.password_1;
      const password2 =
        typeof req.body?.password_2 === 'string' && req.body.password_2.trim()
          ? req.body.password_2.trim()
          : existing.password_2;
      const resultUrl = String(req.body?.result_url || existing.result_url).trim();
      const successUrl = String(req.body?.success_url || existing.success_url).trim();
      const failUrl = String(req.body?.fail_url || existing.fail_url).trim();
      const receiptItemName = String(req.body?.receipt_item_name || existing.receipt_item_name).trim();
      const taxSystem = String(req.body?.tax_system || existing.tax_system).trim();
      const rawVat = req.body?.vat_rate;
      const vatRate = rawVat === null || rawVat === '' || rawVat === 'null' ? null : String(rawVat).trim();
      const isTest = typeof req.body?.is_test === 'boolean' ? req.body.is_test : existing.is_test;
      const isActive = typeof req.body?.is_active === 'boolean' ? req.body.is_active : existing.is_active;

      const updatedRes = await queryPg<SystemConfigRow>(
        `UPDATE system_configs
         SET domain = $1,
             merchant_login = $2,
             password_1 = $3,
             password_2 = $4,
             result_url = $5,
             success_url = $6,
             fail_url = $7,
             receipt_item_name = $8,
             tax_system = $9,
             vat_rate = $10,
             is_test = $11,
             is_active = $12,
             updated_at = now()
         WHERE id = $13
         RETURNING *;`,
        [
          domain,
          merchantLogin,
          password1,
          password2,
          resultUrl,
          successUrl,
          failUrl,
          receiptItemName,
          taxSystem,
          vatRate,
          isTest,
          isActive,
          id,
        ]
      );

      const u = updatedRes.rows[0];
      res.json({
        success: true,
        config: {
          ...u,
          password_1_masked: u.password_1 ? `${u.password_1.slice(0, 3)}***${u.password_1.slice(-2)}` : '',
          password_2_masked: u.password_2 ? `${u.password_2.slice(0, 3)}***${u.password_2.slice(-2)}` : '',
          password_1: undefined,
          password_2: undefined,
        },
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
