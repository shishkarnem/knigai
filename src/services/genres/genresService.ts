import { GenreItem, AVAILABLE_GENRES } from './GenrePresets';
import { fetchAllGenresFromDb, createCustomGenreInDb } from '../db/genresRepository';

export async function getAllCombinedGenres(userUid?: number): Promise<GenreItem[]> {
  const dbGenres = await fetchAllGenresFromDb(userUid);
  
  const map = new Map<string, GenreItem>();
  
  // 1. Add preset 100 genres
  for (const g of AVAILABLE_GENRES) {
    map.set(g.name.toLowerCase(), g);
  }

  // 2. Add custom genres from DB
  for (const dg of dbGenres) {
    map.set(dg.name.toLowerCase(), {
      id: `custom_${dg.id}`,
      name: dg.name,
      category: dg.category || 'Авторские',
      description: dg.description || 'Пользовательский жанр',
    });
  }

  return Array.from(map.values());
}

export async function addCustomGenre(name: string, category: string, description: string, userUid?: number): Promise<GenreItem> {
  const created = await createCustomGenreInDb({
    name,
    category: category || 'Авторские',
    description: description || 'Пользовательский жанр',
    user_uid: userUid,
  });

  return {
    id: `custom_${created.id}`,
    name: created.name,
    category: created.category,
    description: created.description,
  };
}
