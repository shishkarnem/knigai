import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  Users,
  Sparkles,
  MapPin,
  Package,
  Shield,
  Scroll,
  Plus,
  Filter,
  X,
  BookOpen,
} from 'lucide-react';
import { Book, Character, WorldEntity, WorldEntityType } from '../../types';
import { NoirButton } from '../../components/common/NoirButton';
import { NoirModal } from '../../components/common/NoirModal';
import { NoirStatus } from '../../components/common/NoirStatus';
import {
  fetchWorldEntities,
  saveWorldEntity,
  deleteWorldEntity,
} from '../../services/db/bookRepository';
import { WorldEntityCard } from '../../components/lore/WorldEntityCard';
import { WorldEntityConstructorModal } from '../../components/lore/WorldEntityConstructorModal';
import { BatchLoreModal } from '../../components/lore/BatchLoreModal';
import { WorldEntityImageModal } from '../../components/lore/WorldEntityImageModal';
import { WorldEntityDetailModal } from '../../components/lore/WorldEntityDetailModal';
import { PricingInfoModalButton } from '../../components/billing/PricingInfoModalButton';
import { BookReadOnlyBanner } from '../../components/book/details/BookReadOnlyBanner';
import { getCurrentUser } from '../../services/auth/authService';
import { getBookPermissions } from '../../services/book/bookPermissions';

interface CharactersPageProps {
  book: Book;
  characters: Character[];
  onCharactersUpdated: (chars: Character[]) => void;
  userUid?: number;
}

export const CharactersPage: React.FC<CharactersPageProps> = ({
  book,
  characters,
  onCharactersUpdated,
  userUid,
}) => {
  const currentUser = getCurrentUser();
  const perms = getBookPermissions(book, currentUser);
  const readOnly = !perms.canEditContent;
  const [entities, setEntities] = useState<WorldEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<WorldEntityType | 'all'>('all');

  // Modals state
  const [isConstructorOpen, setIsConstructorOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<WorldEntity | null>(null);
  const [defaultConstructorType, setDefaultConstructorType] = useState<WorldEntityType>('character');

  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [imageModalEntity, setImageModalEntity] = useState<WorldEntity | null>(null);
  const [detailEntity, setDetailEntity] = useState<WorldEntity | null>(null);
  const [zoomedImage, setZoomedImage] = useState<{ url: string; title: string } | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<number | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  // Load world entities from DB
  const loadEntities = async () => {
    setLoading(true);
    try {
      const list = await fetchWorldEntities(book.id);

      // If database has no world entities yet, but has legacy characters, synchronize them
      if (list.length === 0 && characters && characters.length > 0) {
        const migrated: WorldEntity[] = [];
        for (const c of characters) {
          const saved = await saveWorldEntity(
            {
              book_id: book.id,
              entity_type: 'character',
              name: c.name,
              subtitle_or_role: c.role,
              description: c.description,
              attributes: {
                role: c.role,
                traits: c.traits,
              },
              visual_prompt: c.visual_prompt,
              image_url: c.visual_card_url,
            },
            undefined,
            userUid
          );
          migrated.push(saved);
        }
        setEntities(migrated);
      } else {
        setEntities(list);
      }
    } catch (err) {
      console.error('Failed to load world entities:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntities();
  }, [book.id]);

  // Sync back characters to parent for backwards compatibility
  const syncCharactersToParent = (allEntities: WorldEntity[]) => {
    const charsOnly = allEntities
      .filter((e) => e.entity_type === 'character')
      .map((e) => ({
        id: e.id,
        book_id: e.book_id,
        name: e.name,
        role: (e.subtitle_or_role || 'спутник') as Character['role'],
        traits: Array.isArray(e.attributes?.traits) ? e.attributes.traits : [],
        description: e.description,
        visual_card_url: e.image_url,
        visual_prompt: e.visual_prompt,
      }));
    onCharactersUpdated(charsOnly);
  };

  const handleCreateOpen = (type: WorldEntityType = 'character') => {
    setDefaultConstructorType(type);
    setEditingEntity(null);
    setIsConstructorOpen(true);
  };

  const handleEditOpen = (entity: WorldEntity) => {
    setEditingEntity(entity);
    setDefaultConstructorType(entity.entity_type);
    setIsConstructorOpen(true);
  };

  const handleEntitySaved = async (entityData: Omit<WorldEntity, 'id'>, existingId?: number) => {
    try {
      const saved = await saveWorldEntity(entityData, existingId, userUid);
      setEntities((prev) => {
        const idx = prev.findIndex((e) => e.id === saved.id);
        const updated = idx >= 0 ? prev.map((e) => (e.id === saved.id ? saved : e)) : [saved, ...prev];
        syncCharactersToParent(updated);
        return updated;
      });
      setIsConstructorOpen(false);
      setEditingEntity(null);
    } catch (err) {
      console.error('Ошибка при сохранении сущности в базе данных:', err);
    }
  };

  const handleDeleteEntity = (id: number) => {
    setDeleteCandidateId(id);
  };

  const confirmDeleteEntity = async () => {
    if (deleteCandidateId === null) return;
    const id = deleteCandidateId;
    setDeleteCandidateId(null);
    setPageError(null);
    try {
      await deleteWorldEntity(id);
      setEntities((prev) => {
        const next = prev.filter((e) => e.id !== id);
        syncCharactersToParent(next);
        return next;
      });
    } catch (err) {
      console.error('Ошибка при удалении сущности:', err);
      setPageError('Не удалось удалить запись из Библии мира.');
    }
  };

  const handleBatchCreated = async (newEntities: Omit<WorldEntity, 'id'>[]) => {
    setPageError(null);
    try {
      const savedList: WorldEntity[] = [];
      for (const ent of newEntities) {
        const saved = await saveWorldEntity({ ...ent, book_id: book.id }, undefined, userUid);
        savedList.push(saved);
      }
      setEntities((prev) => {
        const merged = [...savedList, ...prev];
        syncCharactersToParent(merged);
        return merged;
      });
      setIsBatchModalOpen(false);
    } catch {
      setPageError('Ошибка при сохранении комплекта сущностей в базу данных.');
    }
  };

  const handleImageSaved = async (entityId: number, imageUrl: string) => {
    setPageError(null);
    const target = entities.find((e) => e.id === entityId);
    if (target) {
      try {
        const saved = await saveWorldEntity(
          { ...target, image_url: imageUrl },
          entityId,
          userUid
        );
        setEntities((prev) => {
          const updated = prev.map((e) => (e.id === entityId ? saved : e));
          syncCharactersToParent(updated);
          return updated;
        });
      } catch (err) {
        console.error('Ошибка сохранения иллюстрации сущности в БД:', err);
        setPageError('Иллюстрация сгенерирована, но возникла ошибка сохранения в базу данных.');
      }
    } else {
      setEntities((prev) => {
        const updated = prev.map((e) => (e.id === entityId ? { ...e, image_url: imageUrl } : e));
        syncCharactersToParent(updated);
        return updated;
      });
    }
    setImageModalEntity(null);
  };

  const filteredEntities = selectedType === 'all'
    ? entities
    : entities.filter((e) => e.entity_type === selectedType);

  const countsByType = {
    all: entities.length,
    character: entities.filter((e) => e.entity_type === 'character').length,
    location: entities.filter((e) => e.entity_type === 'location').length,
    item: entities.filter((e) => e.entity_type === 'item').length,
    faction: entities.filter((e) => e.entity_type === 'faction').length,
    law: entities.filter((e) => e.entity_type === 'law').length,
  };

  return (
    <div className="w-full flex flex-col gap-6 text-white">
      {/* Top Banner & Control Deck */}
      <BookReadOnlyBanner
        book={book}
        perms={perms}
        currentUser={currentUser}
        sectionLabel="изменение персонажей и Библии мира"
      />

      <div className="noir-container p-4 sm:p-6 border-2 border-white shadow-xl flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-zinc-700">
          <div>
            <h2 className="text-[20px] font-bold text-white tracking-tight flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-rose-500" />
              <span>Библия мира и персонажи</span>
            </h2>
            <p className="text-[14px] text-zinc-400 mt-0.5">
              Персонажи, ключевые локации, артефакты, противоборствующие фракции и законы мироустройства.
              Используются алгоритмом для сохранения логики сюжета и генерации иллюстраций.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <PricingInfoModalButton compact />
            {!readOnly && (
              <>
                <NoirButton
                  variant="outline"
                  onClick={() => setIsBatchModalOpen(true)}
                  icon={<Sparkles className="w-4 h-4 text-rose-500" />}
                >
                  Сгенерировать комплект ИИ
                </NoirButton>
                <NoirButton
                  variant="primary"
                  onClick={() => handleCreateOpen(selectedType === 'all' ? 'character' : selectedType)}
                  icon={<Plus className="w-4 h-4 text-black" />}
                >
                  Создать сущность
                </NoirButton>
              </>
            )}
          </div>
        </div>

        {/* Categories / Entity Type Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {[
            { id: 'all', label: 'Все сущности', icon: Filter, count: countsByType.all },
            { id: 'character', label: 'Персонажи', icon: Users, count: countsByType.character },
            { id: 'location', label: 'Локации', icon: MapPin, count: countsByType.location },
            { id: 'item', label: 'Предметы', icon: Package, count: countsByType.item },
            { id: 'faction', label: 'Фракции', icon: Shield, count: countsByType.faction },
            { id: 'law', label: 'Законы мира', icon: Scroll, count: countsByType.law },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = selectedType === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedType(tab.id as WorldEntityType | 'all')}
                className={`min-h-[44px] px-3.5 text-[14px] font-bold border transition flex items-center gap-2 cursor-pointer ${
                  isSelected
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white hover:border-zinc-500'
                }`}
              >
                <Icon className={`w-4 h-4 ${isSelected ? 'text-black' : 'text-zinc-400'}`} />
                <span>{tab.label}</span>
                <span
                  className={`text-[14px] px-1.5 py-0.2 border font-mono ${
                    isSelected
                      ? 'bg-black text-white border-black'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {pageError && <NoirStatus type="error" message={pageError} />}

      {/* Grid of Entity Cards */}
      {loading ? (
        <div className="noir-container p-12 text-center text-zinc-400 border border-zinc-800">
          <p className="text-[16px] font-bold text-white">Загрузка Библии мира...</p>
        </div>
      ) : filteredEntities.length === 0 ? (
        <div className="noir-container p-12 text-center text-zinc-400 border border-zinc-800 flex flex-col items-center justify-center gap-3">
          <p className="text-[16px] font-bold text-white">
            {selectedType === 'all'
              ? 'В книге пока нет созданных сущностей мира'
              : 'В этой категории пока ничего не создано'}
          </p>
          <p className="text-[14px] text-zinc-400 max-w-md">
            Добавьте ключевых героев, локации, предметы или законы мира, чтобы ИИ органично
            вплетал их в текст глав и создавал выдержанные иллюстрации.
          </p>
          {!readOnly && (
            <div className="flex flex-wrap gap-2 mt-2">
              <NoirButton
                variant="primary"
                onClick={() => handleCreateOpen(selectedType === 'all' ? 'character' : selectedType)}
                icon={<Plus className="w-4 h-4 text-black" />}
              >
                Создать вручную
              </NoirButton>
              <NoirButton
                variant="outline"
                onClick={() => setIsBatchModalOpen(true)}
                icon={<Sparkles className="w-4 h-4 text-rose-500" />}
              >
                Сгенерировать через ИИ
              </NoirButton>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5">
          {filteredEntities.map((entity) => (
            <WorldEntityCard
              key={entity.id}
              entity={entity}
              readOnly={readOnly}
              onEdit={handleEditOpen}
              onDelete={handleDeleteEntity}
              onRequestImage={(e) => setImageModalEntity(e)}
              onViewDetail={(e) => setDetailEntity(e)}
              onViewImage={(url, title) => setZoomedImage({ url, title })}
            />
          ))}
        </div>
      )}

      {/* Constructor Modal (Add / Edit) */}
      {isConstructorOpen && (
        <WorldEntityConstructorModal
          isOpen={isConstructorOpen}
          onClose={() => {
            setIsConstructorOpen(false);
            setEditingEntity(null);
          }}
          onSave={handleEntitySaved}
          book={book}
          userUid={userUid}
          entityToEdit={editingEntity}
          defaultType={defaultConstructorType}
        />
      )}

      {/* Batch Generator Modal */}
      {isBatchModalOpen && (
        <BatchLoreModal
          isOpen={isBatchModalOpen}
          onClose={() => setIsBatchModalOpen(false)}
          book={book}
          userUid={userUid}
          onEntitiesCreated={handleBatchCreated}
        />
      )}

      {/* Manual High-Res Illustration Generation Modal */}
      {imageModalEntity && (
        <WorldEntityImageModal
          isOpen={!!imageModalEntity}
          onClose={() => setImageModalEntity(null)}
          entity={imageModalEntity}
          book={book}
          userUid={userUid}
          onImageSaved={handleImageSaved}
        />
      )}

      {/* Detailed Entity Viewer Modal */}
      {detailEntity && (
        <WorldEntityDetailModal
          isOpen={!!detailEntity}
          onClose={() => setDetailEntity(null)}
          entity={detailEntity}
          readOnly={readOnly}
          onEdit={(ent) => handleEditOpen(ent)}
          onRequestImage={(ent) => setImageModalEntity(ent)}
        />
      )}

      {/* Full-view Zoom Image Modal */}
      {zoomedImage && (
        <NoirModal
          isOpen={!!zoomedImage}
          onClose={() => setZoomedImage(null)}
          title={zoomedImage.title}
          maxWidth="max-w-4xl"
        >
          <div className="flex flex-col items-center gap-3">
            <img
              src={zoomedImage.url}
              alt={zoomedImage.title}
              className="max-h-[75vh] w-auto object-contain border border-zinc-700 shadow-2xl"
              referrerPolicy="no-referrer"
            />
            <div className="flex justify-end w-full pt-2">
              <NoirButton variant="outline" onClick={() => setZoomedImage(null)}>
                Закрыть
              </NoirButton>
            </div>
          </div>
        </NoirModal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteCandidateId !== null && (
        <NoirModal
          isOpen={true}
          onClose={() => setDeleteCandidateId(null)}
          title="Удаление сущности из Библии мира"
          maxWidth="max-w-md"
        >
          <div className="flex flex-col gap-4 text-white">
            <p className="text-[14px] text-zinc-300 leading-relaxed">
              Вы уверены, что хотите удалить эту запись? Она перестанет использоваться в новых главах и обложках.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <NoirButton variant="subtle" onClick={() => setDeleteCandidateId(null)}>
                Отмена
              </NoirButton>
              <NoirButton variant="danger" onClick={confirmDeleteEntity}>
                Удалить запись
              </NoirButton>
            </div>
          </div>
        </NoirModal>
      )}
    </div>
  );
};
