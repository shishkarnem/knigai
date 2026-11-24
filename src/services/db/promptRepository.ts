import { executePgQuery } from './pgProxy';
import { PromptTemplate } from '../../types';

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    key: 'genre_mixer',
    name: 'Смешение жанров и концепт книги',
    title: 'Смешение жанров и концепт книги',
    category: 'synopsis',
    system_instruction: 'Ты — признанный литературный архитектор и драматург. Пиши выразительным литературным языком без капслока.',
    macro_description: '{genres}, {tone}, {audience}, {setting}, {conflict}, {target_chapters}, {plot_directive}',
    input_cost_multiplier: 1.0,
    output_cost_multiplier: 1.0,
    template: `Ты — признанный литературный архитектор. Создай захватывающую концепцию книги, глубоко смешав следующие жанры: {genres}.
Тональность: {tone}.
Целевая аудитория: {audience}.
Сеттинг мира: {setting}.
Ключевой конфликт: {conflict}.
{plot_directive}

Сформируй:
1. Заглавие книги (без кавычек и капслока)
2. Подзаголовок (1 интригующая фраза)
3. Описание вселенной и уникальных правил этого мира (2-3 абзаца)
4. Главный сквозной конфликт и ставки для мира
5. Краткий план сюжетной дуги на {target_chapters} глав.`
  },
  {
    key: 'synopsis_generator',
    name: 'Генератор плана и синопсисов глав (JSON)',
    title: 'Генератор плана и синопсисов глав (JSON)',
    category: 'synopsis',
    system_instruction: 'Ты — сценарист-конструктор больших романных арок. Отвечай строго валидным JSON без пояснений и без капслока.',
    macro_description: '{title}, {genres}, {setting}, {conflict}, {tone}, {target_chapters}, {start_chapter}, {end_chapter}, {characters}, {entities_catalog}, {prev_arc}, {plot_directive}',
    input_cost_multiplier: 1.0,
    output_cost_multiplier: 1.0,
    template: `Книга «{title}» (жанры: {genres}, тональность: {tone}, мир: {setting}).
Сюжетная дуга: {conflict}
Персонажи: {characters}
Сущности мира: {entities_catalog}
Уже запланировано ранее: {prev_arc}
{plot_directive}

Сгенерируй плотный, нелинейный сюжетный план для глав с #{start_chapter} по #{end_chapter} (всего в книге {target_chapters} глав).
Верни СТРОГО JSON-объект без лишнего текста:
{
  "chapters": [
    {
      "chapter_number": {start_chapter},
      "title": "Интригующее название без слова Глава",
      "synopsis": "3-4 емких предложения: расстановка сил, поворот сцены, зацепка для финала главы.",
      "entity_ids": [1, 2]
    }
  ]
}`
  },
  {
    key: 'character_bible',
    name: 'Генератор анкеты персонажа',
    title: 'Генератор анкеты персонажа',
    category: 'characters',
    system_instruction: 'Ты — мастер психологических портретов персонажей. Создавай живых героев с противоречиями.',
    macro_description: '{name}, {role}, {traits}, {book_title}, {setting}, {genres}',
    input_cost_multiplier: 1.0,
    output_cost_multiplier: 1.0,
    template: `Создай колоритного персонажа для книги "{book_title}" (жанры: {genres}, мир: {setting}).
Имя: {name}
Роль в сюжете: {role}
Черты характера: {traits}
Опиши:
1. Внешность (черты лица, взгляд, стиль одежды, характерная примета или артефакт)
2. Внутренний конфликт, глубинная мотивация и скрытая тайна
3. Характер речи и привычки в диалогах.`
  },
  {
    key: 'character_visual_card',
    name: 'Промпт визуальной карты персонажа (коллаж)',
    title: 'Промпт визуальной карты персонажа (коллаж)',
    category: 'visuals',
    system_instruction: 'Visual prompt builder for character turnarounds and detail sheets.',
    macro_description: '{name}, {role}, {traits}, {description}',
    input_cost_multiplier: 1.0,
    output_cost_multiplier: 1.0,
    template: `Character concept visual sheet, multi-panel collage of single character: {name}, {role}, traits: {traits}. {description}. Showing 4 views in one image: portrait close-up, full body dynamic pose, expressive emotion, costume and artifact detail. Dark noir aesthetic, clean studio cinematic lighting, detailed digital ink art, character design sheet style, no text, high resolution 8k.`
  },
  {
    key: 'chapter_entity_picker',
    name: 'Подбор релевантных сущностей мира для главы (ИИ)',
    title: 'Подбор релевантных сущностей мира для главы (ИИ)',
    category: 'chapters',
    system_instruction: 'Отбирай только действительно нужных персонажей, локации, предметы, фракции и законы мира для конкретной главы.',
    macro_description: '{title}, {chapter_number}, {chapter_title}, {chapter_synopsis}, {prev_summary}, {catalog}',
    input_cost_multiplier: 1.0,
    output_cost_multiplier: 1.0,
    template: `Ты — редактор непрерывности (continuity editor) книги «{title}».
Проанализируй синопсис главы #{chapter_number} («{chapter_title}») и определи, какие персонажи, локации, артефакты, фракции и законы мира из базы данных должны участвовать или учитываться в этой главе.

Синопсис главы #{chapter_number}: {chapter_synopsis}
Контекст предыдущей главы: {prev_summary}

Каталог доступных сущностей из базы данных:
{catalog}

Верни СТРОГО JSON-массив числовых или строковых ID выбранных сущностей (от 1 до 10 штук), например:
{"selected_ids": ["lore:12", "char:3", "lore:15"]}`
  },
  {
    key: 'chapter_cascade',
    name: 'Полноценная глава А5 на 10 страниц (JSON + Rolling лор)',
    title: 'Полноценная глава А5 на 10 страниц (JSON + Rolling лор)',
    category: 'chapters',
    system_instruction: 'Ты — мастер большой художественной прозы. Пиши развернутые 10-страничные главы без воды, с глубокой психологией, живыми диалогами и сенсорной атмосферой. Не используй капслок. Отвечай строго валидным JSON.',
    macro_description: '{title}, {chapter_number}, {chapter_title}, {chapter_synopsis}, {rolling_context}, {entities_compact}, {style_block}, {plot_directive}, {genres}, {tone}, {target_chars}',
    input_cost_multiplier: 1.0,
    output_cost_multiplier: 1.0,
    template: `Напиши полноценную, глубоко детализированную главу #{chapter_number} книги «{title}» («{chapter_title}»).
Жанры: {genres}. Тональность: {tone}.
Синопсис главы: {chapter_synopsis}

{rolling_context}

Активные сущности и канон мира (используй точно по фактам):
{entities_compact}

{style_block}
{plot_directive}

Архитектура объема (СТРОГО ~10 книжных страниц А5 = {target_chars} символов с пробелами / 1900-2400 слов):
1. Разбей главу внутри текста на 4-5 полноценных драматических сцен (переходы через «* * *» на отдельной строке). Каждая сцена — 2800-3500 символов: действие, психологический подтекст, многословные диалоги с действиями персонажей, звуки/запахи/свет.
2. Не пересказывай события конспективно — показывай сцены в реальном времени (show, don't tell).
3. Используй сноски вида *1, *2 для уникальных понятий и артефактов сеттинга, перечислив расшифровки в поле footnotes.
4. Не пиши в тексте заголовок «Глава X» в начале — сразу начинай художественную прозу, без капслока.

Верни СТРОГО JSON-объект:
{
  "chapter_number": {chapter_number},
  "title": "{chapter_title}",
  "synopsis": "Уточненный синопсис 2-3 предложения",
  "content": "Полный текст главы объемом {target_chars} символов с абзацами через \\n\\n",
  "footnotes": ["*1: Пояснение термина"],
  "entity_ids": [1, 2],
  "continuity_summary": "Сжатый итог (до 350 знаков): кто где оказался, какие улики/артефакты получены, что изменилось к следующей главе"
}`
  },
  {
    key: 'book_entity_extraction',
    name: 'ИИ-анализ загруженной книги / черновиков',
    title: 'ИИ-анализ загруженной книги / черновиков',
    category: 'import',
    system_instruction: 'Ты — аналитический редактор книг. Извлекай структурированные метаданные, героев, локации, предметы, фракции, законы мира и краткие синопсисы глав в строгом JSON.',
    macro_description: '{title}, {chapters_count}, {chapter_briefs}',
    input_cost_multiplier: 1.0,
    output_cost_multiplier: 1.0,
    template: `Ты — литературный редактор и архитектор книг KnigAI.
Тебе предоставлены фрагменты глав произведения: «{title}».
Всего глав: {chapters_count}.

Фрагменты глав:
{chapter_briefs}

Проанализируй произведение и верни СТРОГО JSON-объект без лишнего текста:
{
  "title": "Уточненное название книги",
  "synopsis_overview": "Краткий общий синопсис книги (3-4 емких предложения)",
  "genres": ["1-3 жанра из списка: Темное фэнтези, Киберпанк, Детектив нуар, Комедия, Фанфик, Ужасы и хоррор, Поэма и стихи, Космоопера, Исекай (Попаданцы), Постапокалипсис"],
  "basic_plots": ["1-2 сюжета: overcoming-the-monster, rags-to-riches, the-quest, voyage-and-return, comedy, tragedy, rebirth"],
  "characters": [
    {
      "name": "Имя персонажа",
      "role": "Роль (Главный герой / Антагонист / Наставник / Спутник / Таинственный союзник / Второстепенный)",
      "description": "Краткая характеристика внешности, мотивации и характера"
    }
  ],
  "world_entities": [
    {
      "name": "Название",
      "entity_type": "location (или item, faction, law)",
      "description": "Краткое описание и роль в истории"
    }
  ],
  "chapter_synopses": [
    {
      "chapter_number": 1,
      "synopsis": "Краткий пересказ главы в 1-2 предложениях"
    }
  ]
}`
  },
  {
    key: 'lore_entity_builder',
    name: 'Конструктор сущности мира (персонаж, локация, артефакт, фракция, закон)',
    title: 'Конструктор сущности мира',
    category: 'lore',
    system_instruction: 'Создавай детализированные карточки лора с четким заполнением всех структурных полей.',
    macro_description: '{book_title}, {genres}, {setting}, {entity_type_label}, {user_wish}, {synopsis_overview}',
    input_cost_multiplier: 1.0,
    output_cost_multiplier: 1.0,
    template: `Ты — литературный архитектор книги «{book_title}» (жанры: {genres}, сеттинг: {setting}).
Создай или детально проработай сущность мира типа «{entity_type_label}».
{user_wish}
Общий конфликт книги: {synopsis_overview}

Ответь строго по шаблону:
Имя: [Название или имя]
Подзаголовок: [Роль, категория или статус]
Описание: [3-4 емких предложения с предысторией и значением для сюжета]
Поле 1: [Для персонажа — черты; для локации — география и климат; для предмета — свойства и эффект; для фракции — кредо; для закона — область действия]
Поле 2: [Для персонажа — внутренняя драма; для локации — опасности; для предмета — цена и слабости; для фракции — лидер и структура; для закона — последствия нарушения]
Поле 3: [Для персонажа — скрытая тайна; для локации — атмосфера; для предмета — текущий владелец; для фракции — враги и союзники; для закона — исключения]
Визуальный промпт: [Детальный англоязычный промпт для иллюстрации в стиле нуар: subject, architecture/costume, dramatic noir lighting, sharp ink linework, 8k]`
  },
  {
    key: 'lore_batch_builder',
    name: 'Пакетная генерация комплекта лора ИИ',
    title: 'Пакетная генерация комплекта лора ИИ',
    category: 'lore',
    system_instruction: 'Создавай взаимосвязанную систему персонажей, локаций, артефактов, фракций и законов мира.',
    macro_description: '{book_title}, {genres}, {setting}, {plot_focus}, {types}, {count_per_type}',
    input_cost_multiplier: 1.0,
    output_cost_multiplier: 1.0,
    template: `Ты — ведущий мир-строитель (worldbuilder) для нуарной книги «{book_title}».
Жанры: {genres}.
Сеттинг: {setting}.
Конфликт и сюжет: {plot_focus}.

Задача: Создай комплект взаимосвязанных сущностей мира:
Категории: {types}
Количество каждого типа: по {count_per_type} шт.

Ответь строго блоками, разделенными символами "---":
Тип: [character / location / item / faction / law]
Имя: [Название или имя]
Подзаголовок: [Роль, категория или статус]
Описание: [3-4 предложения с раскрытием значения для сюжета]
Поле 1: [Ключевые черты / география / способности / кредо / механика закона]
Поле 2: [Драма / опасности / слабости / лидер / последствия нарушения]
Поле 3: [Тайна / атмосфера / владелец / враги / исключения]
Визуальный промпт: [Англоязычный детальный промпт для нуарной иллюстрации 3:4, no text]
---`
  },
  {
    key: 'lore_visual_card',
    name: 'Промпт иллюстрации сущности мира',
    title: 'Промпт иллюстрации сущности мира',
    category: 'visuals',
    system_instruction: 'Build cinematic dark noir image prompt for a lore entity.',
    macro_description: '{book_title}, {kind}, {name}, {subtitle_or_role}, {description}, {attrs_text}',
    input_cost_multiplier: 1.0,
    output_cost_multiplier: 1.0,
    template: `Book illustration ({kind}) for "{book_title}": {name} ({subtitle_or_role}). Details: {description}. {attrs_text}. Dark noir aesthetic, dramatic chiaroscuro lighting, deep blacks, stark ink linework, subtle crimson highlights, cinematic atmosphere, 8k resolution, no text.`
  },
  {
    key: 'chapter_illustration',
    name: 'Промпт иллюстрации главы',
    title: 'Промпт иллюстрации главы',
    category: 'visuals',
    system_instruction: 'Build evocative book interior scene prompt.',
    macro_description: '{title}, {chapter_number}, {chapter_title}, {scene_description}, {characters_involved}, {entities_summary}, {aspect_ratio}',
    input_cost_multiplier: 1.0,
    output_cost_multiplier: 1.0,
    template: `Book interior illustration for "{title}", chapter #{chapter_number} "{chapter_title}": {scene_description}. Featuring characters: {characters_involved}. World lore details: {entities_summary}. Dark atmospheric noir lighting, fine ink linework, deep contrast, format {aspect_ratio}, no text.`
  },
  {
    key: 'cover_art',
    name: 'Промпт лицевой обложки книги (А5)',
    title: 'Промпт лицевой обложки книги (А5)',
    category: 'covers',
    system_instruction: 'Build vertical A5 bestseller book cover artwork prompt.',
    macro_description: '{title}, {genres}, {scene}, {entities_summary}',
    input_cost_multiplier: 1.0,
    output_cost_multiplier: 1.0,
    template: `Commercial bestseller vertical book cover illustration for "{title}". Genre: {genres}. Central scene: {scene}. World lore & characters: {entities_summary}. High contrast dark noir ink and crimson aesthetic, dramatic cinematic lighting, rich textures, vertical format A5 proportion, clean top and bottom composition without text.`
  },
  {
    key: 'back_cover_art',
    name: 'Промпт задней стороны переплета (А5)',
    title: 'Промпт задней стороны переплета (А5)',
    category: 'covers',
    system_instruction: 'Build moody background art prompt for book back cover.',
    macro_description: '{title}, {genres}, {synopsis_overview}, {entities_summary}',
    input_cost_multiplier: 1.0,
    output_cost_multiplier: 1.0,
    template: `Vertical back cover art for "{title}". Genre: {genres}. Atmospheric mysterious background inspired by: {synopsis_overview}. Key world artifacts & locations: {entities_summary}. High contrast black and white inks with dramatic noir lighting, subtle crimson shadows, space for blurb and barcode, no text.`
  },
  {
    key: 'style_builder',
    name: 'Конструктор литературного стиля книги (ИИ)',
    title: 'Конструктор литературного стиля книги (ИИ)',
    category: 'style',
    system_instruction: 'Ты — ведущий литературный редактор и стилист. Формируй четкие авторские директивы.',
    macro_description: '{user_prompt}',
    input_cost_multiplier: 1.0,
    output_cost_multiplier: 1.0,
    template: `Ты — ведущий литературный редактор и стилист художественной прозы.
На основе запроса пользователя создай уникальный литературный и визуальный стиль книги.
Запрос пользователя: "{user_prompt}"

Заполни параметры строго в следующем формате:
Название стиля: [Лаконичное емкое название]
Голос прозы: [2-3 предложения о позиции повествователя, интонации и дистанции с читателем]
Ритм и темп: [1-2 предложения о длине предложений, динамике сцен и паузах]
Словарный состав: [Характерная лексика, специфика метафор и запрещенные штампы]
Визуальная эстетика: [Визуальные маркеры для иллюстраций: светотень, композиция, контраст, детали]
Правила для ИИ: [Конкретные директивы, как автору писать текст в этом стиле]`
  },
  {
    key: 'voice_punctuation_editor',
    name: 'Литературная пунктуация и корректура голосовой диктовки',
    title: 'Литературная пунктуация и корректура голосовой диктовки',
    category: 'voice',
    system_instruction: 'Ты — деликатный корректор русской речи и прозы. Расставь знаки препинания и разбей на абзацы, не меняя авторских слов и смысла.',
    macro_description: '{raw_text}, {field_context}',
    input_cost_multiplier: 1.0,
    output_cost_multiplier: 1.0,
    template: `Отредактируй сырой текст, распознанный с голосовой диктовки для поля «{field_context}».
Удали явные оговорки и слова-паразиты («ээ», «мм»), расставь правильные знаки препинания, оформи диалоги и разбей текст на логичные абзацы.
Сохрани смысл, имена, термины и живую интонацию автора. Не используй капслок.
Верни ТОЛЬКО готовый исправленный текст без пояснений и комментариев.

Сырой текст диктовки:
{raw_text}`
  },
  {
    key: 'decision_book_classifier',
    name: 'Decisions 763: Классификатор жанров (до 5), стиля и сюжетов KnigAI (до 3)',
    title: 'Decisions 763: Классификатор жанров, стиля и сюжетов KnigAI',
    category: 'import',
    system_instruction: 'Классифицирует черновики и загруженные книги по жанрам, литературно-визуальным стилям и фундаментальным сюжетам KnigAI через API 763 (~typesafe/jev-latest, 0.25x тарифа).',
    macro_description: '{text}, {instruction}, {options}',
    input_cost_multiplier: 0.25,
    output_cost_multiplier: 0.25,
    template: `Определи литературный и визуальный стиль, до 5 подходящих жанров с весами и до 3 фундаментальных сюжетов KnigAI на основе отрывка книги или черновиков.`
  },
  {
    key: 'decision_rework_filter',
    name: 'Decisions 763: Фильтр затрагиваемых глав при переделке/ремейке',
    title: 'Decisions 763: Фильтр затрагиваемых глав',
    category: 'chapters',
    system_instruction: 'Определяет через noul (~typesafe/jev-latest, 0.25x тарифа), нужно ли перерабатывать конкретную главу под новые мысли автора.',
    macro_description: '{chapter_synopsis}, {author_thoughts}',
    input_cost_multiplier: 0.25,
    output_cost_multiplier: 0.25,
    template: `Оцени, затрагивают ли новые мысли автора и режим переделки события конкретной главы, или главу можно безопасно пропустить ради экономии букв.`
  },
  {
    key: 'decision_chapter_qa',
    name: 'Decisions 763: Оценка качества и завершенности главы (1..5 / noul)',
    title: 'Decisions 763: Оценка качества и завершенности главы',
    category: 'chapters',
    system_instruction: 'Оценивает драматургическую завершенность и литературное качество текста главы через API 763 (~typesafe/jev-latest, 0.25x тарифа).',
    macro_description: '{chapter_title}, {chapter_text}',
    input_cost_multiplier: 0.25,
    output_cost_multiplier: 0.25,
    template: `Оцени качество диалогов, атмосферы, логической завершенности сцены и соответствие канону книги по шкале 1..5.`
  },
  {
    key: 'decision_image_qa',
    name: 'Decisions 763: Визуальная ИИ-проверка обложек и артов (PPLX, до 4 фото)',
    title: 'Decisions 763: Визуальная ИИ-проверка обложек и артов',
    category: 'visuals',
    system_instruction: 'Мультимодальная оценка 1–4 изображений через PPLX Decider (0.55x тарифа + фото): отбраковка артефактов и выбор лучшего арта.',
    macro_description: '{subject}, {style_name}, {images_urls}',
    input_cost_multiplier: 0.55,
    output_cost_multiplier: 0.55,
    template: `Оцени визуальное качество, композицию, соответствие описанию и нуар-эстетике переданных изображений.`
  }
];

let seededInSession = false;
let cachedPrompts: PromptTemplate[] | null = null;

function normalizePromptRow(r: PromptTemplate & { title?: string }): PromptTemplate {
  return {
    ...r,
    name: r.title || r.name || r.key,
    title: r.title || r.name || r.key,
    input_cost_multiplier: r.input_cost_multiplier !== undefined ? Number(r.input_cost_multiplier) : 1.0,
    output_cost_multiplier: r.output_cost_multiplier !== undefined ? Number(r.output_cost_multiplier) : 1.0,
  };
}

export async function ensureSeededPrompts(): Promise<void> {
  if (seededInSession) return;
  seededInSession = true;
  try {
    for (const p of DEFAULT_PROMPT_TEMPLATES) {
      await executePgQuery(
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
          p.input_cost_multiplier ?? 1.0,
          p.output_cost_multiplier ?? 1.0,
        ]
      );
    }
  } catch (err) {
    console.warn('Auto-seed ai_prompts notice:', err);
  }
}

export async function fetchAllPrompts(forceRefresh = false): Promise<PromptTemplate[]> {
  if (cachedPrompts && !forceRefresh) {
    return cachedPrompts;
  }
  await ensureSeededPrompts();
  try {
    const res = await executePgQuery<PromptTemplate>(
      `SELECT id, key, title, category, system_instruction, template, macro_description, input_cost_multiplier, output_cost_multiplier, updated_at
       FROM ai_prompts ORDER BY id ASC;`
    );
    if (res.rows && res.rows.length > 0) {
      const normalized = res.rows.map(normalizePromptRow);
      cachedPrompts = normalized;
      return normalized;
    }
  } catch (error) {
    console.warn('Could not load prompts from ai_prompts table, using defaults:', error);
  }
  return DEFAULT_PROMPT_TEMPLATES;
}

export async function getPromptConfig(key: string): Promise<PromptTemplate> {
  try {
    await ensureSeededPrompts();
    const res = await executePgQuery<PromptTemplate>(
      `SELECT id, key, title, category, system_instruction, template, macro_description, input_cost_multiplier, output_cost_multiplier, updated_at
       FROM ai_prompts WHERE key = $1 LIMIT 1;`,
      [key]
    );
    if (res.rows && res.rows[0]) {
      return normalizePromptRow(res.rows[0]);
    }
  } catch (err) {
    console.warn(`Failed to fetch prompt "${key}" from ai_prompts:`, err);
  }
  const fallback = DEFAULT_PROMPT_TEMPLATES.find((p) => p.key === key);
  return fallback || {
    key,
    name: key,
    title: key,
    category: 'synopsis',
    template: '',
    input_cost_multiplier: 1.0,
    output_cost_multiplier: 1.0,
  };
}

export async function getPromptByKey(key: string): Promise<string> {
  const cfg = await getPromptConfig(key);
  return cfg.template || '';
}

export function renderPrompt(
  template: string,
  variables: Record<string, string | number | undefined | null>,
  systemInstruction?: string
): string {
  let rendered = template;
  for (const [varName, rawValue] of Object.entries(variables)) {
    const val = rawValue !== undefined && rawValue !== null ? String(rawValue) : '';
    rendered = rendered.split(`{${varName}}`).join(val);
  }
  // Remove unresolved placeholders cleanly if empty
  rendered = rendered.replace(/\{[a-z0-9_]+\}/gi, '');
  if (systemInstruction && systemInstruction.trim()) {
    return `${systemInstruction.trim()}\n\n${rendered.trim()}`;
  }
  return rendered.trim();
}

export async function updatePromptInDb(params: {
  key: string;
  title: string;
  template: string;
  category: string;
  system_instruction?: string;
  macro_description?: string;
  input_cost_multiplier?: number;
  output_cost_multiplier?: number;
}): Promise<boolean> {
  try {
    await executePgQuery(
      `INSERT INTO ai_prompts (key, title, category, system_instruction, template, macro_description, input_cost_multiplier, output_cost_multiplier, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET
         title = EXCLUDED.title,
         category = EXCLUDED.category,
         system_instruction = EXCLUDED.system_instruction,
         template = EXCLUDED.template,
         macro_description = EXCLUDED.macro_description,
         input_cost_multiplier = EXCLUDED.input_cost_multiplier,
         output_cost_multiplier = EXCLUDED.output_cost_multiplier,
         updated_at = CURRENT_TIMESTAMP;`,
      [
        params.key,
        params.title,
        params.category,
        params.system_instruction || '',
        params.template,
        params.macro_description || '',
        params.input_cost_multiplier ?? 1.0,
        params.output_cost_multiplier ?? 1.0,
      ]
    );
    cachedPrompts = null;
    return true;
  } catch (error) {
    console.warn(`Failed to save prompt ${params.key} to ai_prompts:`, error);
    return false;
  }
}
