import { DEFAULT_PROMPT_TEMPLATES } from '../../src/services/db/promptRepository';
import { AVAILABLE_GENRES } from '../../src/services/genres/GenrePresets';

type QueryPgFn = <T = Record<string, unknown>>(
  sql: string,
  params?: (string | number | boolean | null)[]
) => Promise<{ rows: T[]; rowCount: number }>;

/**
 * Seeds default AI prompt templates (`ai_prompts`) and genre catalog (`genres`)
 * on server startup so admin tables and AI generation always share authoritative DB records.
 */
export async function seedPromptsAndGenres(queryPg: QueryPgFn): Promise<void> {
  try {
    // 1. Seed AI Prompts with exact 1:1 token-to-letter multipliers
    for (const p of DEFAULT_PROMPT_TEMPLATES) {
      await queryPg(
        `INSERT INTO ai_prompts (key, title, category, system_instruction, template, macro_description, input_cost_multiplier, output_cost_multiplier)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (key) DO NOTHING;`,
        [
          p.key,
          p.title || p.name,
          p.category,
          p.system_instruction || '',
          p.template,
          p.macro_description || '',
          1.0,
          1.0,
        ]
      );
    }

    // Align legacy seeded prompt multipliers to 1.0 (1 AI token = 1 Letter) if untouched at 1.5/1.2
    await queryPg(
      `UPDATE ai_prompts
       SET input_cost_multiplier = 1.0,
           output_cost_multiplier = 1.0,
           updated_at = CURRENT_TIMESTAMP
       WHERE output_cost_multiplier IN (1.2, 1.5);`
    );

    // Ensure entity macro templates & upgraded 10-page JSON templates sync cleanly if still legacy
    const upgradeKeys = ['chapter_illustration', 'cover_art', 'back_cover_art', 'chapter_cascade', 'synopsis_generator'];
    for (const uk of upgradeKeys) {
      const def = DEFAULT_PROMPT_TEMPLATES.find((d) => d.key === uk);
      if (!def) continue;
      if (uk === 'chapter_cascade') {
        await queryPg(
          `UPDATE ai_prompts
           SET title = $2,
               system_instruction = $3,
               template = $4,
               macro_description = $5,
               updated_at = CURRENT_TIMESTAMP
           WHERE key = $1 AND (template LIKE '%900-1500 слов%' OR template NOT LIKE '%continuity_summary%');`,
          [def.key, def.title || def.name, def.system_instruction || '', def.template, def.macro_description || '']
        );
      } else if (uk === 'synopsis_generator') {
        await queryPg(
          `UPDATE ai_prompts
           SET title = $2,
               system_instruction = $3,
               template = $4,
               macro_description = $5,
               updated_at = CURRENT_TIMESTAMP
           WHERE key = $1 AND template NOT LIKE '%"chapters"%';`,
          [def.key, def.title || def.name, def.system_instruction || '', def.template, def.macro_description || '']
        );
      } else {
        await queryPg(
          `UPDATE ai_prompts
           SET template = $2,
               macro_description = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE key = $1 AND (macro_description IS NULL OR macro_description NOT LIKE '%entities_summary%');`,
          [def.key, def.template, def.macro_description || '']
        );
      }
    }

    // 2. Seed Genres catalog from GenrePresets if empty or missing presets
    const countRes = await queryPg<{ count: string }>('SELECT COUNT(*) AS count FROM genres;');
    const existingCount = parseInt(countRes.rows[0]?.count || '0', 10);
    if (existingCount < AVAILABLE_GENRES.length) {
      for (const g of AVAILABLE_GENRES) {
        await queryPg(
          `INSERT INTO genres (user_uid, name, category, description, is_custom)
           VALUES (NULL, $1, $2, $3, false)
           ON CONFLICT (name) DO NOTHING;`,
          [g.name, g.category, g.description]
        );
      }
    }

    console.log('[KnigAI Noir] Seeded ai_prompts and genres tables successfully.');
  } catch (err) {
    console.warn('[KnigAI Noir] Seed prompts/genres warning:', err);
  }
}
