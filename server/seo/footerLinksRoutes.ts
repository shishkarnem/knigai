import type { Express, Request, Response } from 'express';

type QueryPgFn = <T = Record<string, unknown>>(
  sql: string,
  params?: (string | number | boolean | null)[]
) => Promise<{ rows: T[]; rowCount: number }>;

export interface FooterLinkRow {
  id: number;
  title: string;
  url: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

const DEFAULT_FOOTER_LINKS_SEED: Array<{ title: string; url: string; sort_order: number }> = [
  { title: 'Робот Рекрутер', url: 'https://hr-rr.ru/', sort_order: 10 },
  { title: 'ИИ-Ревизор', url: 'https://ii-rr.ru/', sort_order: 20 },
  { title: 'ИИ-Викторины', url: 'https://qaiz.ru/', sort_order: 30 },
  { title: 'АлхимИИ', url: 'https://aihim.ru/', sort_order: 40 },
  { title: 'ИИ-Разработка', url: 'https://sav-ai.ru/', sort_order: 50 },
  { title: 'Канал про ИИ', url: 'https://t.me/SAV_AI', sort_order: 60 },
  { title: 'AI РОП', url: 'https://rent-rop.com/ii-dlya-otdela-prodazh/', sort_order: 70 },
  { title: 'ИИSMM', url: 'https://iismm.ru/', sort_order: 80 },
];

function isValidLinkUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

let schemaInitPromise: Promise<void> | null = null;

export async function ensureFooterLinksSchema(queryPg: QueryPgFn): Promise<void> {
  if (!schemaInitPromise) {
    schemaInitPromise = (async () => {
      await queryPg(`
        CREATE TABLE IF NOT EXISTS footer_links (
          id BIGSERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          url TEXT NOT NULL,
          sort_order INT DEFAULT 0,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        );
      `);

      const countRes = await queryPg<{ total: string }>('SELECT COUNT(*) AS total FROM footer_links;');
      const existingCount = Number(countRes.rows[0]?.total || 0);

      if (existingCount === 0) {
        for (const item of DEFAULT_FOOTER_LINKS_SEED) {
          await queryPg(
            `INSERT INTO footer_links (title, url, sort_order, is_active) VALUES ($1, $2, $3, true);`,
            [item.title, item.url, item.sort_order]
          );
        }
        console.log('[KnigAI FooterLinks] Seeded 8 default ecosystem links into PostgreSQL.');
      }
    })().catch((err) => {
      schemaInitPromise = null;
      throw err;
    });
  }
  return schemaInitPromise;
}

export function registerFooterLinksRoutes(app: Express, queryPg: QueryPgFn): void {
  // GET /api/footer-links (?all=true for admin view)
  app.get('/api/footer-links', async (req: Request, res: Response) => {
    try {
      await ensureFooterLinksSchema(queryPg);
      const includeAll = String(req.query.all || '') === 'true';
      const sql = includeAll
        ? 'SELECT id, title, url, sort_order, is_active, created_at, updated_at FROM footer_links ORDER BY sort_order ASC, id ASC;'
        : 'SELECT id, title, url, sort_order, is_active, created_at, updated_at FROM footer_links WHERE is_active = true ORDER BY sort_order ASC, id ASC;';
      const { rows } = await queryPg<FooterLinkRow>(sql);
      res.json({ success: true, links: rows || [] });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        links: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // POST /api/footer-links
  app.post('/api/footer-links', async (req: Request, res: Response) => {
    try {
      const title = String(req.body?.title || '').trim();
      const url = String(req.body?.url || '').trim();
      const isActive = req.body?.is_active !== false;
      const rawSortOrder = req.body?.sort_order;

      if (!title) {
        return res.status(400).json({ success: false, error: 'Название ссылки обязательно' });
      }
      if (!isValidLinkUrl(url)) {
        return res.status(400).json({
          success: false,
          error: 'Укажите корректный URL, начинающийся с https://, http:// или /',
        });
      }

      let sortOrder = Number.isFinite(Number(rawSortOrder)) ? Math.round(Number(rawSortOrder)) : NaN;
      if (Number.isNaN(sortOrder)) {
        const maxRes = await queryPg<{ max_sort: number }>(
          'SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM footer_links;'
        );
        sortOrder = Number(maxRes.rows[0]?.max_sort || 0) + 10;
      }

      const insertRes = await queryPg<FooterLinkRow>(
        `INSERT INTO footer_links (title, url, sort_order, is_active)
         VALUES ($1, $2, $3, $4)
         RETURNING id, title, url, sort_order, is_active, created_at, updated_at;`,
        [title, url, sortOrder, isActive]
      );

      res.json({ success: true, link: insertRes.rows[0] });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // PUT /api/footer-links/reorder
  app.put('/api/footer-links/reorder', async (req: Request, res: Response) => {
    try {
      const orderedIds = Array.isArray(req.body?.orderedIds)
        ? req.body.orderedIds.map((v: unknown) => Number(v)).filter((n: number) => Number.isInteger(n) && n > 0)
        : [];

      if (orderedIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Список ID для сортировки пуст' });
      }

      for (let i = 0; i < orderedIds.length; i++) {
        await queryPg(
          'UPDATE footer_links SET sort_order = $1, updated_at = now() WHERE id = $2;',
          [(i + 1) * 10, orderedIds[i]]
        );
      }

      const { rows } = await queryPg<FooterLinkRow>(
        'SELECT id, title, url, sort_order, is_active, created_at, updated_at FROM footer_links ORDER BY sort_order ASC, id ASC;'
      );
      res.json({ success: true, links: rows });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // PUT /api/footer-links/:id
  app.put('/api/footer-links/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ success: false, error: 'Некорректный ID ссылки' });
      }

      const title = String(req.body?.title || '').trim();
      const url = String(req.body?.url || '').trim();
      const sortOrder = Number.isFinite(Number(req.body?.sort_order))
        ? Math.round(Number(req.body.sort_order))
        : 0;
      const isActive = req.body?.is_active !== false;

      if (!title) {
        return res.status(400).json({ success: false, error: 'Название ссылки обязательно' });
      }
      if (!isValidLinkUrl(url)) {
        return res.status(400).json({
          success: false,
          error: 'Укажите корректный URL, начинающийся с https://, http:// или /',
        });
      }

      const updateRes = await queryPg<FooterLinkRow>(
        `UPDATE footer_links
         SET title = $1, url = $2, sort_order = $3, is_active = $4, updated_at = now()
         WHERE id = $5
         RETURNING id, title, url, sort_order, is_active, created_at, updated_at;`,
        [title, url, sortOrder, isActive, id]
      );

      if (!updateRes.rows || updateRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Ссылка не найдена' });
      }

      res.json({ success: true, link: updateRes.rows[0] });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // DELETE /api/footer-links/:id
  app.delete('/api/footer-links/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ success: false, error: 'Некорректный ID ссылки' });
      }

      const delRes = await queryPg<{ id: number }>(
        'DELETE FROM footer_links WHERE id = $1 RETURNING id;',
        [id]
      );

      if (!delRes.rows || delRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Ссылка не найдена' });
      }

      res.json({ success: true, deletedId: id });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
