import React, { useMemo, useState } from 'react';
import { Check, MapPin, Plus, Shield, Sparkles, User, Wand2, BookOpen } from 'lucide-react';
import { Book, WorldEntity, WorldEntityType } from '../../../types';
import { saveWorldEntity } from '../../../services/db/bookRepository';
import { formatLettersCount } from '../../../services/billing/costCalculator';
import { NoirButton } from '../../common/NoirButton';
import { WorldEntityConstructorModal } from '../../lore/WorldEntityConstructorModal';

interface ChapterEntitiesSelectorPanelProps {
  book: Book;
  worldEntities: WorldEntity[];
  selectedEntityIds: number[];
  onChangeSelectedIds: (nextIds: number[]) => void;
  onEntityCreated: (newEntity: WorldEntity) => void;
  userUid?: number;
  readOnly?: boolean;
  onAiPickEntities?: () => void;
  aiPickLoading?: boolean;
  aiPickEstLetters?: number;
}

const CATEGORY_META: Array<{
  id: 'all' | WorldEntityType;
  label: string;
  shortLabel: string;
}> = [
  { id: 'all', label: 'Все сущности', shortLabel: 'Все' },
  { id: 'character', label: 'Персонажи', shortLabel: 'Персонаж' },
  { id: 'location', label: 'Окружение / локации', shortLabel: 'Локация' },
  { id: 'item', label: 'Предметы и артефакты', shortLabel: 'Предмет' },
  { id: 'faction', label: 'Фракции', shortLabel: 'Фракция' },
  { id: 'law', label: 'Законы мира', shortLabel: 'Закон' },
];

export const ChapterEntitiesSelectorPanel: React.FC<ChapterEntitiesSelectorPanelProps> = ({
  book,
  worldEntities,
  selectedEntityIds,
  onChangeSelectedIds,
  onEntityCreated,
  userUid,
  readOnly = false,
  onAiPickEntities,
  aiPickLoading = false,
  aiPickEstLetters = 0,
}) => {
  const [filterType, setFilterType] = useState<'all' | WorldEntityType>('all');
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [creatorDefaultType, setCreatorDefaultType] = useState<WorldEntityType>('character');

  const selectedSet = useMemo(() => new Set(selectedEntityIds.map(Number)), [selectedEntityIds]);

  const countsByType = useMemo(() => {
    const counts: Record<string, number> = {
      all: worldEntities.length,
      character: 0,
      location: 0,
      item: 0,
      faction: 0,
      law: 0,
    };
    for (const ent of worldEntities) {
      counts[ent.entity_type] = (counts[ent.entity_type] || 0) + 1;
    }
    return counts;
  }, [worldEntities]);

  const filteredEntities = useMemo(() => {
    if (filterType === 'all') return worldEntities;
    return worldEntities.filter((e) => e.entity_type === filterType);
  }, [worldEntities, filterType]);

  const toggleEntity = (id: number) => {
    if (readOnly) return;
    if (selectedSet.has(id)) {
      onChangeSelectedIds(selectedEntityIds.filter((item) => item !== id));
    } else {
      onChangeSelectedIds([...selectedEntityIds, id]);
    }
  };

  const openCreateModal = (type: WorldEntityType) => {
    setCreatorDefaultType(type);
    setCreatorOpen(true);
  };

  const renderCategoryIcon = (type: WorldEntityType) => {
    switch (type) {
      case 'character':
        return <User className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
      case 'location':
        return <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
      case 'faction':
        return <Shield className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
      case 'law':
        return <BookOpen className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
      default:
        return <Sparkles className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
    }
  };

  const shortTypeName = (type: WorldEntityType) =>
    CATEGORY_META.find((c) => c.id === type)?.shortLabel || 'Сущность';

  return (
    <div className="p-3.5 bg-zinc-950/90 border border-zinc-700 flex flex-col gap-3 rounded-none min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[14px] font-bold text-white">
          Персонажи, окружение и сущности для главы ({selectedEntityIds.length} из {worldEntities.length}):
        </span>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1.5">
            {onAiPickEntities && (
              <NoirButton
                variant="outline"
                onClick={onAiPickEntities}
                loading={aiPickLoading}
                disabled={worldEntities.length === 0}
                icon={<Wand2 className="w-4 h-4 text-rose-500" />}
              >
                Подобрать ИИ (≈ {formatLettersCount(aiPickEstLetters)} б.)
              </NoirButton>
            )}
            {worldEntities.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => onChangeSelectedIds(worldEntities.map((e) => e.id))}
                  className="min-h-[36px] px-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 text-[14px] font-bold cursor-pointer rounded-none"
                >
                  Выбрать все
                </button>
                <button
                  type="button"
                  onClick={() => onChangeSelectedIds([])}
                  className="min-h-[36px] px-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 text-[14px] font-bold cursor-pointer rounded-none"
                >
                  Сбросить
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Quick Inline Entity Creation Row */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 p-2 bg-black/70 border border-zinc-800">
          <span className="text-[14px] text-zinc-400">Добавить новую сущность прямо здесь:</span>
          <button
            type="button"
            onClick={() => openCreateModal('character')}
            className="min-h-[36px] px-3 bg-zinc-900 hover:bg-white hover:text-black text-white border border-rose-500/70 text-[14px] font-bold cursor-pointer flex items-center gap-1.5 rounded-none transition"
          >
            <Plus className="w-3.5 h-3.5 text-rose-500" />
            <span>Персонаж</span>
          </button>
          <button
            type="button"
            onClick={() => openCreateModal('location')}
            className="min-h-[36px] px-3 bg-zinc-900 hover:bg-white hover:text-black text-white border border-zinc-600 text-[14px] font-bold cursor-pointer flex items-center gap-1.5 rounded-none transition"
          >
            <Plus className="w-3.5 h-3.5 text-rose-500" />
            <span>Окружение / локация</span>
          </button>
          <button
            type="button"
            onClick={() => openCreateModal('item')}
            className="min-h-[36px] px-3 bg-zinc-900 hover:bg-white hover:text-black text-white border border-zinc-600 text-[14px] font-bold cursor-pointer flex items-center gap-1.5 rounded-none transition"
          >
            <Plus className="w-3.5 h-3.5 text-rose-500" />
            <span>Предмет / лор</span>
          </button>
        </div>
      )}

      {/* Category Filter Bubbles (Wrapping, Zero Horizontal Scroll) */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_META.map((cat) => {
          const active = filterType === cat.id;
          const cnt = countsByType[cat.id] || 0;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setFilterType(cat.id)}
              className={`min-h-[36px] px-3 text-[14px] font-bold border transition cursor-pointer rounded-none ${
                active
                  ? 'bg-rose-600 text-white border-rose-500'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-white'
              }`}
            >
              {cat.label} ({cnt})
            </button>
          );
        })}
      </div>

      {/* Entities Selectable List */}
      {filteredEntities.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto pr-1">
          {filteredEntities.map((ent) => {
            const isSelected = selectedSet.has(ent.id);
            return (
              <button
                key={ent.id}
                type="button"
                disabled={readOnly}
                onClick={() => toggleEntity(ent.id)}
                title={ent.description || ent.subtitle_or_role || ent.name}
                className={`min-h-[40px] px-3 py-1.5 text-[14px] border transition cursor-pointer flex items-center gap-1.5 text-left rounded-none max-w-full ${
                  isSelected
                    ? 'bg-white text-black border-white font-bold'
                    : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500'
                }`}
              >
                {renderCategoryIcon(ent.entity_type)}
                <span className={isSelected ? 'text-rose-600 font-bold shrink-0' : 'text-rose-400 shrink-0'}>
                  [{shortTypeName(ent.entity_type)}]
                </span>
                <span className="truncate">{ent.name}</span>
                {ent.subtitle_or_role && (
                  <span className={isSelected ? 'text-zinc-700 hidden sm:inline truncate' : 'text-zinc-500 hidden sm:inline truncate'}>
                    · {ent.subtitle_or_role}
                  </span>
                )}
                {isSelected && <Check className="w-4 h-4 text-rose-600 shrink-0 ml-0.5" />}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="p-3 bg-black/60 border border-zinc-800 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[14px] text-zinc-400">
            В этой категории пока нет сущностей. Создайте новую — она сразу добавится в книгу и в эту главу.
          </p>
          {!readOnly && (
            <button
              type="button"
              onClick={() => openCreateModal(filterType === 'all' ? 'character' : filterType)}
              className="min-h-[36px] px-3 bg-rose-600 hover:bg-rose-500 text-white text-[14px] font-bold cursor-pointer flex items-center gap-1.5 rounded-none"
            >
              <Plus className="w-4 h-4" />
              <span>Создать сейчас</span>
            </button>
          )}
        </div>
      )}

      {/* Inline WorldEntity Constructor Modal */}
      {creatorOpen && (
        <WorldEntityConstructorModal
          isOpen={creatorOpen}
          onClose={() => setCreatorOpen(false)}
          entityToEdit={null}
          defaultType={creatorDefaultType}
          book={book}
          userUid={userUid}
          onSave={async (entityData) => {
            const saved = await saveWorldEntity(entityData, undefined, userUid);
            onEntityCreated(saved);
            if (!selectedSet.has(saved.id)) {
              onChangeSelectedIds([...selectedEntityIds, saved.id]);
            }
          }}
        />
      )}
    </div>
  );
};
