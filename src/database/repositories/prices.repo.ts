import { getDb } from '../connection.js';
import type { EbayPrice } from '../../types/listing.types.js';

/** Obtener el precio más reciente para una carta */
export function getLatestPrice(cardId: string): EbayPrice | undefined {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM ebay_prices WHERE card_id = ? ORDER BY fetched_at DESC LIMIT 1',
  ).get(cardId) as EbayPrice | undefined;
}

/** Insertar un nuevo precio de referencia */
export function insertPrice(price: EbayPrice): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO ebay_prices (
      id, card_id, avg_price_usd, median_price_usd, min_price_usd, max_price_usd,
      sample_count, source, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    price.id, price.card_id, price.avg_price_usd, price.median_price_usd,
    price.min_price_usd, price.max_price_usd, price.sample_count,
    price.source, price.fetched_at,
  );
}

/** Obtener la cantidad de llamadas de API hechas en las últimas 24 horas para una fuente específica */
export function getApiCallCountLast24Hours(source: string = 'pokemon_api'): number {
  const db = getDb();
  const row = db.prepare(
    "SELECT COUNT(*) as count FROM ebay_prices WHERE source = ? AND fetched_at >= datetime('now', '-24 hours')"
  ).get(source) as { count: number } | undefined;
  return row ? row.count : 0;
}


/** Obtener historial de precios de una carta */
export function getPriceHistory(cardId: string, limit: number = 30): EbayPrice[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM ebay_prices WHERE card_id = ? ORDER BY fetched_at DESC LIMIT ?',
  ).all(cardId, limit) as EbayPrice[];
}
