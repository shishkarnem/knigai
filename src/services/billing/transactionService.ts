import { executePgQuery } from '../db/pgProxy';
import { AppRoute, TransactionRecord } from '../../types';
import { getCurrentUser, saveUserSession, INITIAL_LETTERS_BALANCE } from '../auth/authService';
import { calculateAiUsageCost, formatLettersCount, lettersToRubles } from './costCalculator';
import { createNotification } from './notificationService';
import { trackSessionSpentLetters } from '../ai/session/generationSession';

export const BALANCE_CHANGED_EVENT = 'knigai_balance_changed';

function dispatchBalanceChanged(balance: number) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BALANCE_CHANGED_EVENT, { detail: { balance } }));
  }
}

export async function getAuthoritativeBalance(userUid: number): Promise<number> {
  try {
    const res = await executePgQuery<{ letters_balance: string | number }>(
      'SELECT letters_balance FROM users WHERE uid = $1 LIMIT 1;',
      [userUid]
    );
    if (res.rows && res.rows[0] && res.rows[0].letters_balance !== undefined && res.rows[0].letters_balance !== null) {
      const dbBal = Number(res.rows[0].letters_balance);
      const current = getCurrentUser();
      if (current && Number(current.uid) === Number(userUid) && current.letters_balance !== dbBal) {
        current.letters_balance = dbBal;
        saveUserSession(current);
        dispatchBalanceChanged(dbBal);
      }
      return dbBal;
    }
  } catch (err) {
    console.warn('Balance fetch warning:', err);
  }
  const current = getCurrentUser();
  return current?.uid === userUid && typeof current.letters_balance === 'number'
    ? current.letters_balance
    : INITIAL_LETTERS_BALANCE;
}

export async function checkSufficientBalance(
  userUid: number | undefined,
  requiredLetters: number
): Promise<{ ok: boolean; currentBalance: number; missing: number }> {
  if (!userUid) {
    return { ok: true, currentBalance: INITIAL_LETTERS_BALANCE, missing: 0 };
  }
  const currentBalance = await getAuthoritativeBalance(userUid);
  const ok = currentBalance >= requiredLetters;
  return {
    ok,
    currentBalance,
    missing: ok ? 0 : requiredLetters - currentBalance,
  };
}

export async function recordTransaction(params: {
  userUid: number;
  amount: number; // positive = credit, negative = debit
  operationType: TransactionRecord['operation_type'];
  description: string;
  details?: TransactionRecord['details'];
  createAlert?: boolean;
  alertTitle?: string;
  alertType?: 'billing' | 'generation' | 'import' | 'bonus' | 'remix' | 'system';
  alertLink?: AppRoute | string | null;
}): Promise<{ newBalance: number; transaction?: TransactionRecord }> {
  const currentBalance = await getAuthoritativeBalance(params.userUid);
  const newBalance = Math.max(0, Math.round(currentBalance + params.amount));

  try {
    await executePgQuery('UPDATE users SET letters_balance = $1 WHERE uid = $2;', [
      newBalance,
      params.userUid,
    ]);
  } catch (err) {
    console.warn('Failed to update user balance in DB:', err);
  }

  // Update local session if active user matches
  const sessionUser = getCurrentUser();
  if (sessionUser && Number(sessionUser.uid) === Number(params.userUid)) {
    sessionUser.letters_balance = newBalance;
    saveUserSession(sessionUser);
  }
  dispatchBalanceChanged(newBalance);

  let createdTx: TransactionRecord | undefined;
  try {
    const detailsJson = params.details ? JSON.stringify(params.details) : null;
    const res = await executePgQuery<TransactionRecord>(
      `INSERT INTO transactions (user_uid, amount, balance_after, operation_type, description, details)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id, user_uid, amount, balance_after, operation_type, description, details, created_at;`,
      [
        params.userUid,
        Math.round(params.amount),
        newBalance,
        params.operationType,
        params.description,
        detailsJson,
      ]
    );
    createdTx = res.rows[0];
  } catch (err) {
    console.warn('Failed to insert transaction row:', err);
  }

  if (params.createAlert !== false) {
    const isDebit = params.amount < 0;
    const absStr = formatLettersCount(Math.abs(params.amount));
    const defaultTitle = isDebit
      ? `Списание ${absStr} букв`
      : `Начисление +${absStr} букв`;

    await createNotification({
      userUid: params.userUid,
      type: params.alertType || (isDebit ? 'billing' : 'bonus'),
      title: params.alertTitle || defaultTitle,
      message: `${params.description}. Остаток: ${formatLettersCount(newBalance)} букв.`,
      link: params.alertLink || 'balance',
    });
  }

  return { newBalance, transaction: createdTx };
}

export async function recordAiUsage(params: {
  userUid?: number;
  promptKey?: string;
  inputChars: number;
  outputChars: number;
  inputMultiplier?: number;
  outputMultiplier?: number;
  isImage?: boolean;
  isDecision?: boolean;
  decisionModel?: import('./costCalculator').DecisionModelId;
  decisionType?: string;
  imagesCount?: number;
  decisionResultSummary?: string;
  exactTokens?: number;
  tokensIn?: number;
  tokensOut?: number;
  operationType?: TransactionRecord['operation_type'];
  description: string;
  bookId?: number;
  bookTitle?: string;
  chapterNumber?: number;
  alertLink?: AppRoute;
}): Promise<{ newBalance: number; costLetters: number }> {
  const breakdown = calculateAiUsageCost({
    inputChars: params.inputChars,
    outputChars: params.outputChars,
    inputMultiplier: params.inputMultiplier,
    outputMultiplier: params.outputMultiplier,
    isImage: params.isImage,
    isDecision: params.isDecision,
    decisionModel: params.decisionModel,
    imagesCount: params.imagesCount,
    exactTokens: params.exactTokens,
    tokensIn: params.tokensIn,
    tokensOut: params.tokensOut,
  });

  if (!params.userUid) {
    trackSessionSpentLetters(breakdown.totalLetters);
    return { newBalance: INITIAL_LETTERS_BALANCE, costLetters: breakdown.totalLetters };
  }

  const res = await recordTransaction({
    userUid: params.userUid,
    amount: -breakdown.totalLetters,
    operationType: params.operationType || (params.isImage ? 'image_generation' : 'ai_generation'),
    description: params.description,
    details: {
      input_chars: breakdown.inputChars,
      output_chars: breakdown.outputChars,
      input_letters: breakdown.inputLetters,
      output_letters: breakdown.outputLetters,
      tokens_total: breakdown.tokensTotal,
      tokens_in_source: breakdown.tokensIn,
      tokens_out_source: breakdown.tokensOut,
      prompt_key: params.promptKey,
      book_id: params.bookId,
      book_title: params.bookTitle,
      chapter_number: params.chapterNumber,
      rubles: breakdown.rubles,
      ...(params.isDecision
        ? {
            decision_api: 'protalk_763',
            decision_model: params.decisionModel,
            decision_type: params.decisionType,
            images_count: params.imagesCount || 0,
            decision_result: params.decisionResultSummary,
          }
        : {}),
    },
    alertType: params.isImage ? 'generation' : 'billing',
    alertTitle: `${params.description} (-${formatLettersCount(breakdown.totalLetters)} букв)`,
    alertLink: params.alertLink || 'balance',
  });

  trackSessionSpentLetters(breakdown.totalLetters);

  return {
    newBalance: res.newBalance,
    costLetters: breakdown.totalLetters,
  };
}

export async function fetchUserTransactions(
  userUid: number,
  filter: 'all' | 'debit' | 'credit' = 'all'
): Promise<TransactionRecord[]> {
  try {
    let sql = `SELECT id, user_uid, amount, balance_after, operation_type, description, details, created_at
               FROM transactions WHERE user_uid = $1`;
    if (filter === 'debit') {
      sql += ' AND amount < 0';
    } else if (filter === 'credit') {
      sql += ' AND amount > 0';
    }
    sql += ' ORDER BY id DESC LIMIT 200;';

    const res = await executePgQuery<TransactionRecord>(sql, [userUid]);
    const rows = res.rows || [];

    // Seed initial welcome transaction once if user has no ledger history yet
    if (rows.length === 0 && filter === 'all') {
      const checkAny = await executePgQuery<{ count: string }>(
        'SELECT COUNT(*) as count FROM transactions WHERE user_uid = $1;',
        [userUid]
      );
      if (parseInt(checkAny.rows[0]?.count || '0', 10) === 0) {
        const balance = await getAuthoritativeBalance(userUid);
        const seedRes = await executePgQuery<TransactionRecord>(
          `INSERT INTO transactions (user_uid, amount, balance_after, operation_type, description, details)
           VALUES ($1, $2, $2, 'welcome_bonus', $3, $4::jsonb)
           RETURNING id, user_uid, amount, balance_after, operation_type, description, details, created_at;`,
          [
            userUid,
            balance,
            'Стартовый бонус автора KnigAI при регистрации',
            JSON.stringify({ rubles: lettersToRubles(balance) }),
          ]
        );
        return seedRes.rows || [];
      }
    }

    return rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      balance_after: Number(r.balance_after),
      details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details,
    }));
  } catch (err) {
    console.warn('Failed to fetch transactions:', err);
    return [];
  }
}

export async function grantReferralBonus(params: {
  referrerUid: number;
  invitedEmail: string;
  bonusLetters?: number;
}): Promise<void> {
  const bonus = params.bonusLetters ?? 100000;
  await recordTransaction({
    userUid: params.referrerUid,
    amount: bonus,
    operationType: 'referral_bonus',
    description: `Реферальный бонус за приглашение автора (${params.invitedEmail})`,
    details: { invited_email: params.invitedEmail, rubles: lettersToRubles(bonus) },
    alertType: 'bonus',
    alertTitle: `Реферальный бонус +${formatLettersCount(bonus)} букв`,
    alertLink: 'balance',
  });
}
