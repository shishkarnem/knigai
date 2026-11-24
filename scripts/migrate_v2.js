const DB_URL = 'https://db.pro-talk.ru/api/proxy/query';
const USER_ID = 'eyJydWlkIjoicmVjVFd5eE4xR3JTUGxTeGMiLCJlbWFpbCI6InJlbnRyb3BleHBlcnRAZ21haWwuY29tIn0';

async function query(sql, params = []) {
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
      safeMode: false,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('Migration error:', res.status, text);
    throw new Error(text);
  }
  return JSON.parse(text);
}

const HUNDRED_GENRES = [
  // Фэнтези
  { name: 'Героическое фэнтези', category: 'Фэнтези', description: 'Подвиги легендарных героев, мечи и магия' },
  { name: 'Темное фэнтези', category: 'Фэнтези', description: 'Мрачный и бескомпромиссный мир высокой цены' },
  { name: 'Славянское фэнтези', category: 'Фэнтези', description: 'Лешие, ведуны, древние руны и сказания' },
  { name: 'Эпическое фэнтези', category: 'Фэнтези', description: 'Масштабные войны королевств и судьбы мира' },
  { name: 'Городское фэнтези', category: 'Фэнтези', description: 'Магия скрыта среди улиц современного мегаполиса' },
  { name: 'Ромфант', category: 'Фэнтези', description: 'Романтика, любовь и магия в академии или дворе' },
  { name: 'Высокое фэнтези', category: 'Фэнтези', description: 'Древние эльфы, драконы и эпические пантеоны' },
  { name: 'Техномагия', category: 'Фэнтези', description: 'Слияние микросхем, квантовой физики и рун' },
  { name: 'Бояръ-аниме', category: 'Фэнтези', description: 'Магические кланы, интриги родов и развитие сил' },
  { name: 'Мифологическое фэнтези', category: 'Фэнтези', description: 'Боги античности, скандинавские или египетские мифы' },
  { name: 'Магический реализм', category: 'Фэнтези', description: 'Тонкая граница между реальностью и чудом' },
  { name: 'Сянься', category: 'Фэнтези', description: 'Даосское культивирование, полет на мечах и бессмертие' },
  { name: 'Уся', category: 'Фэнтези', description: 'Мастера боевых искусств, странствия и кодекс чести' },
  { name: 'Портальное фэнтези', category: 'Фэнтези', description: 'Врата между измерениями и неизведанными сферами' },

  // Фантастика
  { name: 'Киберпанк', category: 'Фантастика', description: 'Высокие технологии, неон, кибернетика и нуар' },
  { name: 'Космоопера', category: 'Фантастика', description: 'Звездные флотилии, контакты цивилизаций' },
  { name: 'Постапокалипсис', category: 'Фантастика', description: 'Мир после катастрофы, борьба за выживание' },
  { name: 'Стимпанк', category: 'Фантастика', description: 'Паровые двигатели, дирижабли и латунные приборы' },
  { name: 'Антиутопия', category: 'Фантастика', description: 'Тоталитарный контроль и восстание личности' },
  { name: 'Хроноопера', category: 'Фантастика', description: 'Путешествия во времени и временные парадоксы' },
  { name: 'Твердая научная фантастика', category: 'Фантастика', description: 'Опора на реальную науку, астрофизику и расчеты' },
  { name: 'Биопанк', category: 'Фантастика', description: 'Генетические мутации, биоинженерия и клоны' },
  { name: 'Соларпанк', category: 'Фантастика', description: 'Гармония технологий и природы, чистая энергия' },
  { name: 'Дизельпанк', category: 'Фантастика', description: 'Эстетика 1920-1950 годов, тяжелая сталь и моторы' },
  { name: 'ЛитРПГ', category: 'Фантастика', description: 'Игровая механика, прокачка уровней и квесты' },
  { name: 'РеалРПГ', category: 'Фантастика', description: 'Игровая система внезапно появляется в реальном мире' },
  { name: 'Исекай', category: 'Фантастика', description: 'Перерождение или попадание в другой мир' },
  { name: 'Первый контакт', category: 'Фантастика', description: 'Первая встреча человечества с внеземным разумом' },
  { name: 'Искусственный интеллект', category: 'Фантастика', description: 'Пробуждение машинного сознания и восстание нейросетей' },
  { name: 'Меха', category: 'Фантастика', description: 'Гигантские пилотируемые шагающие роботы' },
  { name: 'Космический вестерн', category: 'Фантастика', description: 'Фронтир на дальних планетах, охотники за головами' },
  { name: 'Нанопанк', category: 'Фантастика', description: 'Нанороботы, перестройка материи на атомном уровне' },

  // Детектив & Триллер
  { name: 'Детектив нуар', category: 'Детектив', description: 'Дождливый город, циничный сыщик, роковые тайны' },
  { name: 'Психологический триллер', category: 'Триллер', description: 'Манипуляции, игры разума и напряжение' },
  { name: 'Герметичный детектив', category: 'Детектив', description: 'Преступление в замкнутом пространстве среди подозреваемых' },
  { name: 'Исторический детектив', category: 'Детектив', description: 'Расследования в викторианской Англии или древнем Риме' },
  { name: 'Мистический детектив', category: 'Детектив', description: 'Следствие с участием потусторонних сил' },
  { name: 'Полицейский процедурал', category: 'Детектив', description: 'Детали работы криминалистов и следователей' },
  { name: 'Шпионский триллер', category: 'Триллер', description: 'Агенты спецслужб, конспирация и двойные игры' },
  { name: 'Политический триллер', category: 'Триллер', description: 'Борьба за власть, заговоры правительств' },
  { name: 'Судебная драма', category: 'Детектив', description: 'Поединки адвокатов и прокуроров в зале суда' },
  { name: 'Криминальный боевик', category: 'Триллер', description: 'Ограбления, погони, разборки мафии' },
  { name: 'Триллер выживания', category: 'Триллер', description: 'Человек против стихии, хищников или маньяка' },
  { name: 'Технотриллер', category: 'Триллер', description: 'Хакеры, кибератаки и угрозы оружием будущего' },
  { name: 'Медицинский триллер', category: 'Триллер', description: 'Эпидемии, опасные вирусы и врачебные тайны' },
  { name: 'Уютный детектив', category: 'Детектив', description: 'Расследование в тихом городке за чашкой чая' },

  // Ужасы & Хоррор
  { name: 'Лавкрафтовский ужас', category: 'Хоррор', description: 'Космическое безумие, древние боги и бездна' },
  { name: 'Готический роман', category: 'Хоррор', description: 'Старинные замки, семейные проклятия и призраки' },
  { name: 'Психологический хоррор', category: 'Хоррор', description: 'Ужас, рождающийся из глубин поврежденной психики' },
  { name: 'Сплаттерпанк', category: 'Хоррор', description: 'Экстремальный бескомпромиссный хоррор' },
  { name: 'Мистика', category: 'Хоррор', description: 'Тайные ритуалы, знаки судьбы и потустороннее' },
  { name: 'Оккультный хоррор', category: 'Хоррор', description: 'Демоны, черные гримуары и экзорцизм' },
  { name: 'Фолк-хоррор', category: 'Хоррор', description: 'Языческие культы глухих деревень и обряды' },
  { name: 'Вампирская хроника', category: 'Хоррор', description: 'Бессмертные хищники ночи, страсть и жажда крови' },
  { name: 'Зомби-апокалипсис', category: 'Хоррор', description: 'Орда оживших мертвецов и остатки человечества' },
  { name: 'Боди-хоррор', category: 'Хоррор', description: 'Мутации тела, чужеродные паразиты и трансформация' },

  // Романтика & Отношения
  { name: 'Любовный роман', category: 'Романтика', description: 'Глубокие искренние чувства и преодоление преград' },
  { name: 'Исторический романс', category: 'Романтика', description: 'Балы, корсеты, дуэли и светские скандалы' },
  { name: 'Остросюжетный любовный роман', category: 'Романтика', description: 'Страсть в водовороте опасных приключений' },
  { name: 'Офисный роман', category: 'Романтика', description: 'Искра между коллегами или боссом и подчиненным' },
  { name: 'Академия магии', category: 'Романтика', description: 'Студенческие будни, соперничество и первая любовь' },
  { name: 'Запретная любовь', category: 'Романтика', description: 'Чувства между враждующими кланами или кастами' },
  { name: 'Мелодрама', category: 'Романтика', description: 'Трогательная история испытаний и верности' },
  { name: 'Семейная сага', category: 'Драма', description: 'История нескольких поколений одного рода' },
  { name: 'Подростковая драма (Young Adult)', category: 'Романтика', description: 'Взросление, поиск себя, бунт и первая любовь' },

  // Приключения & Экшн
  { name: 'Морские приключения', category: 'Приключения', description: 'Парусники, штормы, штурвалы и неизвестные острова' },
  { name: 'Авантюрный роман', category: 'Приключения', description: 'Харизматичные плуты, дерзкие аферы и шпаги' },
  { name: 'Робинзонада', category: 'Приключения', description: 'Одинокое выживание на необитаемом острове' },
  { name: 'Поиски сокровищ', category: 'Приключения', description: 'Древние гробницы, ловушки и карты пиратов' },
  { name: 'Исторические битвы', category: 'Приключения', description: 'Грохот орудий, построение фаланг и тактика полководцев' },
  { name: 'Военная проза', category: 'Приключения', description: 'Суровый окопный быт, фронтовое братство' },
  { name: 'Самурайский эпос', category: 'Приключения', description: 'Катана, путь бусидо и поединки в феодальной Японии' },
  { name: 'Вестерн', category: 'Приключения', description: 'Кольты, салуны, шерифы и дикий запад' },
  { name: 'Пиратские хроники', category: 'Приключения', description: 'Черный флаг, абордаж, порох и ром' },

  // Комедия & Сатира
  { name: 'Юмористическое фэнтези', category: 'Комедия', description: 'Ирония над штампами, саркастичные волшебники' },
  { name: 'Черная комедия', category: 'Комедия', description: 'Остроумный циничный юмор на грани фола' },
  { name: 'Сатирический роман', category: 'Комедия', description: 'Острое высмеивание общественных пороков' },
  { name: 'Иронический детектив', category: 'Комедия', description: 'Курьезные преступления и неунывающие сыщики' },
  { name: 'Пародия', category: 'Комедия', description: 'Доброе или язвительное высмеивание классики' },
  { name: 'Романтическая комедия', category: 'Комедия', description: 'Смешные недоразумения на пути к любви' },
  { name: 'Трагикомедия', category: 'Комедия', description: 'Смех сквозь слезы и глубокий гуманизм' },

  // Поэзия & Специфика
  { name: 'Поэма в стихах', category: 'Поэзия', description: 'Эпическое или лирическое повествование в рифме' },
  { name: 'Баллада', category: 'Поэзия', description: 'Песнь о рыцарях, подвигах или мистических духах' },
  { name: 'Стихотворный роман', category: 'Поэзия', description: 'Крупная сюжетная форма в поэтическом метре' },
  { name: 'Фанфик', category: 'Фанфикшн', description: 'Авторское продолжение или AU любимых вселенных' },
  { name: 'Повседневность (Slice of Life)', category: 'Проза', description: 'Теплые детали обыденной жизни и душевный покой' },
  { name: 'Философская притча', category: 'Проза', description: 'Глубокий метафорический смысл в короткой форме' },
  { name: 'Сюрреализм', category: 'Проза', description: 'Логика сновидений, парадоксы и метаморфозы' },
  { name: 'Эпистолярный роман', category: 'Проза', description: 'Повествование через письма, дневники и логи' },
];

async function main() {
  console.log('--- Running Migration V2 ---');

  // 1. Users table
  await query(`
    CREATE TABLE IF NOT EXISTS app_users (
      uid BIGINT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✓ app_users table ready');

  // 2. Add columns to books
  await query(`
    ALTER TABLE books ADD COLUMN IF NOT EXISTS user_uid BIGINT;
    ALTER TABLE books ADD COLUMN IF NOT EXISTS slug TEXT;
    ALTER TABLE books ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;
  `);
  console.log('✓ books columns updated');

  // 3. Add columns to characters
  await query(`
    ALTER TABLE characters ADD COLUMN IF NOT EXISTS user_uid BIGINT;
  `);
  console.log('✓ characters columns updated');

  // 4. Add columns to chapters
  await query(`
    ALTER TABLE chapters ADD COLUMN IF NOT EXISTS user_uid BIGINT;
    ALTER TABLE chapters ADD COLUMN IF NOT EXISTS footnotes JSONB DEFAULT '[]';
    ALTER TABLE chapters ADD COLUMN IF NOT EXISTS image_layout JSONB DEFAULT '{}';
  `);
  console.log('✓ chapters columns updated');

  // 5. Add columns to files
  await query(`
    ALTER TABLE file_storage ADD COLUMN IF NOT EXISTS user_uid BIGINT;
    ALTER TABLE file_folders ADD COLUMN IF NOT EXISTS user_uid BIGINT;
  `);
  console.log('✓ file storage columns updated');

  // 6. Reading progress table
  await query(`
    CREATE TABLE IF NOT EXISTS reading_progress (
      id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_uid BIGINT NOT NULL,
      book_id INT NOT NULL,
      current_chapter INT DEFAULT 1,
      current_page INT DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_uid, book_id)
    );
  `);
  console.log('✓ reading_progress table ready');

  // 7. Genres table (100 genres)
  await query(`
    CREATE TABLE IF NOT EXISTS genres (
      id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      is_custom BOOLEAN DEFAULT false,
      user_uid BIGINT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✓ genres table ready');

  // Seed 100 genres
  for (const g of HUNDRED_GENRES) {
    const existing = await query('SELECT id FROM genres WHERE name = $1', [g.name]);
    if (!existing.rows || existing.rows.length === 0) {
      await query(
        'INSERT INTO genres (name, category, description, is_custom) VALUES ($1, $2, $3, false)',
        [g.name, g.category, g.description]
      );
    }
  }
  console.log(`✓ Seeded ${HUNDRED_GENRES.length} genres in PostgreSQL`);

  // Update prompt templates to include footnotes and table of contents instructions
  await query(`
    UPDATE prompts SET template = 'Напиши полную главу #{chapter_number} книги "{title}".
Название главы: {chapter_title}
Синопсис этой главы: {chapter_synopsis}
Контекст предыдущей главы #{prev_chapter_number}: {prev_summary}
Действующие персонажи: {active_characters}
Стиль и жанры: {genres}. Тональность: {tone}.
Требования:
- Живой кинематографичный язык, осязаемые детали, диалоги.
- Если в тексте упоминаются редкие термины, магия или артефакты, добавляй сноски со звездочкой и номером в тексте, например: этериум*1. В конце главы обязательно приводи расшифровку сносок в формате:
Сноски:
*1: Краткое пояснение термина.
- Без капслока, объем 800-1400 слов.' WHERE key = 'chapter_cascade';
  `);
  console.log('✓ Updated chapter_cascade prompt with footnotes instructions');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
