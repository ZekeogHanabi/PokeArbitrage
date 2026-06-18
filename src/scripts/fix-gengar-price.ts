/**
 * Script de corrección puntual:
 * Actualiza el precio de referencia de Gengar Fossil 5/62 PSA 10 de $2000 a $40
 * en la base de datos SQLite.
 *
 * Uso: npx tsx src/scripts/fix-gengar-price.ts
 */

import { getDb, closeDb } from '../database/connection.js';
import { runMigrations } from '../database/migrate.js';
import { buildCanonicalName } from '../utils/string.utils.js';
import { v4 as uuid } from 'uuid';

async function main(): Promise<void> {
  console.log('🔧 Corrigiendo precio de Gengar Fossil 5/62 PSA 10...\n');

  getDb();
  runMigrations();

  const db = getDb();

  // 1. Buscar la carta por canonical_name
  const canonicalName = buildCanonicalName('Gengar', 'Fossil', '5/62', 'PSA', 10);
  console.log(`🔍 Buscando carta: ${canonicalName}`);

  const card = db.prepare(
    'SELECT * FROM cards WHERE canonical_name = ?'
  ).get(canonicalName) as { id: string; display_name: string } | undefined;

  if (!card) {
    console.error('❌ Carta no encontrada en la base de datos. ¿Corriste npm run seed?');
    closeDb();
    process.exit(1);
  }

  console.log(`✅ Carta encontrada: ${card.display_name} (${card.id})`);

  // 2. Insertar un nuevo registro de precio correcto (source=manual con fecha actual)
  const now = new Date().toISOString();
  const newPrice = {
    id: uuid(),
    card_id: card.id,
    avg_price_usd: 40,
    median_price_usd: 40,
    min_price_usd: 32,   // 80% del precio
    max_price_usd: 48,   // 120% del precio
    sample_count: 1,
    source: 'manual',
    fetched_at: now,
  };

  db.prepare(`
    INSERT INTO ebay_prices (
      id, card_id, avg_price_usd, median_price_usd, min_price_usd, max_price_usd,
      sample_count, source, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newPrice.id, newPrice.card_id, newPrice.avg_price_usd, newPrice.median_price_usd,
    newPrice.min_price_usd, newPrice.max_price_usd, newPrice.sample_count,
    newPrice.source, newPrice.fetched_at,
  );

  console.log(`\n✅ Precio actualizado: Gengar Fossil 5/62 PSA 10 → $40.00 (antes: $2,000.00)`);
  console.log('   El bot usará este precio en el próximo ciclo de polling.\n');

  closeDb();
}

main().catch(console.error);
