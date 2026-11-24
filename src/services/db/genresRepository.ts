import { executePgQuery } from './pgProxy';
import { GenreRecord } from '../../types';

export async function fetchAllGenresFromDb(userUid?: number): Promise<GenreRecord[]> {
  try {
    let sql = 'SELECT id, name, category, description, is_custom, user_uid FROM genres';
    const params: (string | number)[] = [];

    if (userUid) {
      params.push(userUid);
      sql += ' WHERE is_custom = false OR user_uid = $1 OR user_uid IS NULL';
    }

    sql += ' ORDER BY category ASC, name ASC;';

    const res = await executePgQuery<GenreRecord>(sql, params);
    return res.rows || [];
  } catch (err) {
    console.warn('Failed fetching genres from DB:', err);
    return [];
  }
}

export async function createCustomGenreInDb(genre: {
  name: string;
  category: string;
  description: string;
  user_uid?: number;
}): Promise<GenreRecord> {
  const sql = `
    INSERT INTO genres (name, category, description, is_custom, user_uid)
    VALUES ($1, $2, $3, true, $4)
    RETURNING id, name, category, description, is_custom, user_uid;
  `;
  const res = await executePgQuery<GenreRecord>(sql, [
    genre.name.trim(),
    genre.category.trim(),
    genre.description.trim(),
    genre.user_uid || null,
  ]);
  return res.rows[0];
}
