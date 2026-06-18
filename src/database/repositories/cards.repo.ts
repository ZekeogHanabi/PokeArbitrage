import { getDb } from '../connection.js';
import type { Card } from '../../types/card.types.js';
import { logger } from '../../utils/logger.js';

/** Obtener todas las cartas activas */
export function getActiveCards(): Card[] {
  const db = getDb();
  return db.prepare('SELECT * FROM cards WHERE is_active = 1').all() as Card[];
}

/** Obtener cartas activas filtradas por grado */
export function getActiveCardsByGrade(grader: string, grade: number): Card[] {
  const db = getDb();
  return db.prepare('SELECT * FROM cards WHERE is_active = 1 AND grader = ? AND grade = ?').all(grader, grade) as Card[];
}

/** Insertar una carta en el catálogo */
export function insertCard(card: Card): void {
  const db = getDb();
  try {
    db.prepare(`
      INSERT OR IGNORE INTO cards (
        id, canonical_name, display_name, set_name, card_number, pokemon_name,
        grader, grade, rarity, ebay_search_query, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      card.id, card.canonical_name, card.display_name, card.set_name,
      card.card_number, card.pokemon_name, card.grader, card.grade,
      card.rarity, card.ebay_search_query, card.is_active, card.created_at, card.updated_at,
    );
  } catch (err) {
    logger.error(err, 'Error inserting card');
  }
}

/** Buscar carta por canonical name */
export function getCardByCanonical(canonicalName: string): Card | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM cards WHERE canonical_name = ?').get(canonicalName) as Card | undefined;
}

/** Obtener carta por id */
export function getCardById(id: string): Card | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as Card | undefined;
}
