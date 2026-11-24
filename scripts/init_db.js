const DB_URL = 'https://db.pro-talk.ru/api/proxy/query';
const USER_ID = 'eyJydWlkIjoicmVjVFd5eE4xR3JTUGxTeGMiLCJlbWFpbCI6InJlbnRyb3BleHBlcnRAZ21haWwuY29tIn0';

async function query(sql, params = [], safeMode = false) {
  const res = await fetch(DB_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': USER_ID,
    },
    body: JSON.stringify({
      database: 'knigai',
      query: sql,
      params,
      safeMode,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('Query error:', res.status, text);
    throw new Error(`DB Error: ${text}`);
  }
  return JSON.parse(text);
}

const defaultPrompts = [
  {
    key: 'genre_mixer',
    name: 'Смешение жанров и синопсис мира',
    category: 'synopsis',
    template: `Создай концепцию книги, смешав следующие жанры: {genres}.
Тональность: {tone}.
Целевая аудитория: {audience}.
Сеттинг: {setting}.
Главный конфликт: {conflict}.
Сформируй название книги, подзаголовок, краткое описание мира, главную сюжетную интригу и общую сюжетную дугу для книги на {target_chapters} глав.`
  },
  {
    key: 'synopsis_100_chapters',
    name: 'Генератор плана на 100 глав',
    category: 'synopsis',
    template: `На основе книги "{title}" ({genres}, мир: {setting}) создай детальный конспект глав с {start_chapter} по {end_chapter}.
Для каждой главы укажи:
- Номер главы
- Атмосферное название главы
- Краткий сюжет главы (2-3 предложения с кульминацией или клиффхэнгером).
Учитывай участие персонажей: {characters}.`
  },
  {
    key: 'character_builder',
    name: 'Генератор анкеты персонажа',
    category: 'characters',
    template: `Создай персонажа для книги "{title}" ({genres}).
Имя: {name}
Роль: {role}
Черты характера: {traits}
Опиши:
1. Внешность (детали лица, волос, одежды, характерные приметы)
2. Мотивацию и скрытую тайну
3. Промпт для визуальной карты персонажа (коллаж из 1 картинки с 4 ракурсами: портрет крупно, полный рост, эмоция, деталь экипировки/аксессуара).`
  },
  {
    key: 'character_visual_card',
    name: 'Промпт визуальной карты персонажа (коллаж)',
    category: 'visuals',
    template: `Character concept visual sheet, multi-panel collage of single character: {name}, {description}, showing 4 views in one image: portrait close-up, full body dynamic pose, expressive emotion, costume and artifact detail. Clean studio cinematic lighting, detailed digital painting art, character design sheet style, cohesive palette, high resolution 8k.`
  },
  {
    key: 'chapter_cascade',
    name: 'Каскадная генерация текста главы',
    category: 'chapters',
    template: `Напиши полную главу #{chapter_number} книги "{title}".
Название главы: {chapter_title}
Синопсис этой главы: {chapter_synopsis}
Что произошло в предыдущей главе #{prev_chapter_number}: {prev_summary}
Действующие персонажи в главе: {active_characters}
Стиль и жанр: {genres}, темп повествования: {pacing}.
Требование: яркие диалоги, чувственные описания, глубокое погружение, интригующая концовка. Без клише, размер 700-1200 слов.`
  },
  {
    key: 'chapter_illustration',
    name: 'Промпт иллюстрации к главе',
    category: 'visuals',
    template: `Book illustration for chapter "{chapter_title}": {scene_description}. Featuring {characters_involved}. Book interior art style, expressive lighting, fine linework, dramatic atmosphere, high quality editorial book illustration.`
  },
  {
    key: 'cover_art',
    name: 'Промпт типографской обложки книги',
    category: 'covers',
    template: `Commercial bestseller book cover illustration for "{title}". Genre: {genres}. Key scene: {scene}. High-end typography layout aesthetic, dramatic cinematic light, rich textures, award winning book cover design, format A5 proportion.`
  }
];

async function main() {
  console.log('--- Initializing PostgreSQL knigai schema ---');

  await query(`
    CREATE TABLE IF NOT EXISTS prompts (
      id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      key VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      template TEXT NOT NULL,
      category VARCHAR(100) NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✓ prompts table ready');

  await query(`
    CREATE TABLE IF NOT EXISTS books (
      id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      subtitle VARCHAR(255),
      author VARCHAR(255),
      genres JSONB NOT NULL DEFAULT '[]',
      target_chapters INT DEFAULT 100,
      status VARCHAR(50) DEFAULT 'draft',
      cover_config JSONB DEFAULT '{}',
      synopsis_overview TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✓ books table ready');

  await query(`
    CREATE TABLE IF NOT EXISTS characters (
      id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      book_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(100) NOT NULL,
      description TEXT,
      visual_card_url TEXT,
      visual_prompt TEXT,
      traits JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✓ characters table ready');

  await query(`
    CREATE TABLE IF NOT EXISTS chapters (
      id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      book_id INT NOT NULL,
      chapter_number INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      synopsis TEXT,
      content TEXT,
      illustration_url TEXT,
      illustration_prompt TEXT,
      status VARCHAR(50) DEFAULT 'draft',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✓ chapters table ready');

  await query(`
    CREATE TABLE IF NOT EXISTS gallery (
      id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      book_id INT,
      image_url TEXT NOT NULL,
      prompt TEXT,
      aspect_ratio VARCHAR(20) DEFAULT '3:4',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✓ gallery table ready');

  // Seed or update default prompts
  for (const p of defaultPrompts) {
    const existing = await query('SELECT id FROM prompts WHERE key = $1', [p.key]);
    if (existing.rows && existing.rows.length > 0) {
      await query(
        'UPDATE prompts SET name = $1, template = $2, category = $3, updated_at = CURRENT_TIMESTAMP WHERE key = $4',
        [p.name, p.template, p.category, p.key]
      );
    } else {
      await query(
        'INSERT INTO prompts (key, name, template, category) VALUES ($1, $2, $3, $4)',
        [p.key, p.name, p.template, p.category]
      );
    }
  }
  console.log('✓ Prompts seeded successfully in database');

  const check = await query('SELECT count(*) as count FROM prompts;');
  console.log('Total prompts in DB:', check.rows[0].count);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
