import type { QueryPgFn } from '../backup/backupTypes';

export async function ensureBookEnhancementSchema(queryPg: QueryPgFn): Promise<void> {
  const migrations = [
    `ALTER TABLE books ADD COLUMN IF NOT EXISTS parent_book_id BIGINT;`,
    `ALTER TABLE books ADD COLUMN IF NOT EXISTS relation_type TEXT;`,
    `ALTER TABLE books ADD COLUMN IF NOT EXISTS series_name TEXT;`,
    `ALTER TABLE books ADD COLUMN IF NOT EXISTS series_order INT;`,
    `ALTER TABLE books ADD COLUMN IF NOT EXISTS book_meta JSONB DEFAULT '{}'::jsonb;`,
    `ALTER TABLE books ADD COLUMN IF NOT EXISTS author_instructions TEXT;`,
    `ALTER TABLE books ADD COLUMN IF NOT EXISTS is_parsed_source BOOLEAN DEFAULT false;`,
    `ALTER TABLE chapters ADD COLUMN IF NOT EXISTS author_comment TEXT;`,
    `CREATE TABLE IF NOT EXISTS book_drafts (
      id BIGSERIAL PRIMARY KEY,
      user_uid BIGINT,
      book_id BIGINT,
      chapter_id BIGINT,
      chapter_number INT,
      draft_type TEXT NOT NULL DEFAULT 'note',
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'manual',
      source_image_url TEXT,
      status TEXT NOT NULL DEFAULT 'idea',
      include_in_ai BOOLEAN DEFAULT true,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );`,
    `ALTER TABLE book_drafts ADD COLUMN IF NOT EXISTS source_image_url TEXT;`,
    `ALTER TABLE book_drafts ADD COLUMN IF NOT EXISTS include_in_ai BOOLEAN DEFAULT true;`,
    `ALTER TABLE book_drafts ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;`,
    `CREATE INDEX IF NOT EXISTS idx_book_drafts_user_book
     ON book_drafts (user_uid, book_id, sort_order ASC, id DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_book_drafts_book_chap
     ON book_drafts (book_id, chapter_number, sort_order ASC);`,
    `CREATE TABLE IF NOT EXISTS chapter_revisions (
      id BIGSERIAL PRIMARY KEY,
      book_id BIGINT NOT NULL,
      chapter_id BIGINT,
      chapter_number INT NOT NULL,
      title TEXT NOT NULL,
      synopsis TEXT,
      content TEXT,
      revision_note TEXT,
      mode TEXT DEFAULT 'edit',
      created_at TIMESTAMPTZ DEFAULT now()
    );`,
    `CREATE INDEX IF NOT EXISTS idx_chapter_revisions_book_chap
     ON chapter_revisions (book_id, chapter_number, id DESC);`,
  ];

  for (const sql of migrations) {
    try {
      await queryPg(sql);
    } catch (err) {
      console.warn('[KnigAI Schema] Book enhancement migration notice:', err);
    }
  }

  // Seed new system prompts for polish edit, full remake, cascade synopsis remake, sequel canon planning, OCR & writer mode
  const promptSeeds = [
    {
      key: 'chapter_polish_edit',
      title: 'Редактура и литературное усиление главы',
      category: 'Текст и главы',
      system_instruction:
        'Ты — главный редактор и стилист издательства KnigAI. Улучшай слог, диалоги, ритм и сенсорные детали текста, сохраняя сюжет и персонажей.',
      template:
        'Отредактируй и литературно усиль главу #{chapter_number} «{chapter_title}» книги «{book_title}». Устрани повторы и воду, раскрой сцены до ~10 страниц А5. Указания автора: {edit_instruction}.',
      macro_description: '{book_title}, {chapter_number}, {chapter_title}, {edit_instruction}',
      input_cost_multiplier: 1.0,
      output_cost_multiplier: 1.0,
    },
    {
      key: 'chapter_full_remake',
      title: 'Полный ремейк главы по новым мыслям',
      category: 'Текст и главы',
      system_instruction:
        'Ты — соавтор-романист KnigAI. Перепиши главу заново на основе новых идей автора, используя исходный черновик только как отправную базу.',
      template:
        'Выполни полный ремейк главы #{chapter_number} книги «{book_title}» согласно новому синопсису и мыслям автора: {edit_instruction}.',
      macro_description: '{book_title}, {chapter_number}, {edit_instruction}',
      input_cost_multiplier: 1.0,
      output_cost_multiplier: 1.0,
    },
    {
      key: 'synopsis_remake_cascade',
      title: 'Каскадная перестройка синопсиса глав',
      category: 'Сюжет и планирование',
      system_instruction:
        'Ты — архитектор сюжетов KnigAI. Перестраивай поглавный план в строгом JSON, связывая события до финала.',
      template:
        'Перестрой синопсис глав с #{start_chapter} по #{end_chapter} для книги «{book_title}» в режиме {mode} с учётом новых мыслей: {author_thoughts}.',
      macro_description: '{book_title}, {start_chapter}, {end_chapter}, {mode}, {author_thoughts}',
      input_cost_multiplier: 1.0,
      output_cost_multiplier: 1.0,
    },
    {
      key: 'sequel_canon_planner',
      title: 'Планировщик продолжения (Сиквел / Приквел / Спин-офф)',
      category: 'Сюжет и планирование',
      system_instruction:
        'Ты — шоураннер книжных серий KnigAI. Извлекаешь канон первоисточника и проектируешь новую книгу серии.',
      template:
        'На основе книги «{source_title}» создай концепцию и план ({relation_type}) с учётом пожеланий: {sequel_wishes}.',
      macro_description: '{source_title}, {relation_type}, {sequel_wishes}',
      input_cost_multiplier: 1.0,
      output_cost_multiplier: 1.0,
    },
    {
      key: 'draft_ocr_extract',
      title: 'Распознавание текста с фото и сканов черновиков (OCR)',
      category: 'Черновики и импорт',
      system_instruction:
        'Ты — точный литературовед-расшифровщик KnigAI. Твоя задача — без потерь и выдумок распознать рукописный или печатный текст с изображения и оформить его чистыми абзацами.',
      template:
        'Распознай и расшифруй весь текст со скана/фотографии черновика по прямой ссылке: {image_url}. Дополнительный контекст автора: {hint}. Верни только чистый распознанный текст с сохранением абзацев и знаков препинания.',
      macro_description: '{image_url}, {hint}',
      input_cost_multiplier: 1.0,
      output_cost_multiplier: 1.0,
    },
    {
      key: 'fragment_ai_rewrite',
      title: 'Точечная редактура выделенного фрагмента (Режим писателя)',
      category: 'Текст и главы',
      system_instruction:
        'Ты — литературный соавтор KnigAI. Перепиши ровно выделенный фрагмент согласно задаче, сохраняя стиль и связность с окружающим контекстом.',
      template:
        'Отредактируй выделенный фрагмент главы #{chapter_number} книги «{book_title}». Задача: {instruction}. Контекст вокруг: {context}. Исходный фрагмент:\n{selection}',
      macro_description: '{book_title}, {chapter_number}, {instruction}, {context}, {selection}',
      input_cost_multiplier: 1.0,
      output_cost_multiplier: 1.0,
    },
  ];

  for (const p of promptSeeds) {
    try {
      await queryPg(
        `INSERT INTO ai_prompts (
          key, title, category, system_instruction, template,
          macro_description, input_cost_multiplier, output_cost_multiplier
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (key) DO NOTHING;`,
        [
          p.key,
          p.title,
          p.category,
          p.system_instruction,
          p.template,
          p.macro_description,
          p.input_cost_multiplier,
          p.output_cost_multiplier,
        ]
      );
    } catch {
      // ignore if ai_prompts has unique constraints handled
    }
  }
}
