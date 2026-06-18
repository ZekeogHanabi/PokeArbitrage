import { getDb, closeDb } from '../database/connection.js';
import { extractIdentityFromString } from '../modules/matching/normalizer.js';
import { buildCanonicalName } from '../utils/string.utils.js';

function main() {
  const db = getDb();
  console.log('🔄 Iniciando re-normalización y limpieza de la base de datos...\n');

  // Obtener todas las cartas
  const cards = db.prepare('SELECT * FROM cards').all() as any[];
  console.log(`Total de cartas encontradas: ${cards.length}`);

  let updatedCount = 0;
  let mergedCount = 0;
  let pricesClearedCount = 0;

  // Iniciar una transacción de SQLite para asegurar consistencia
  const transaction = db.transaction(() => {
    for (const card of cards) {
      // 1. Extraer la nueva identidad usando la lógica corregida
      const identity = extractIdentityFromString(card.display_name);
      
      const newCanonical = buildCanonicalName(
        identity.pokemonName,
        card.set_name, // mantenemos el set original por si es más preciso
        identity.cardNumber,
        card.grader,
        card.grade
      );

      const newQuery = [
        identity.pokemonName,
        card.set_name,
        identity.cardNumber,
        card.grader,
        card.grade.toString()
      ].filter(Boolean).join(' ');

      const changed = 
        card.canonical_name !== newCanonical ||
        card.card_number !== identity.cardNumber ||
        card.pokemon_name !== identity.pokemonName ||
        card.ebay_search_query !== newQuery;

      if (changed) {
        console.log(`\n📌 Carta ID: ${card.id}`);
        console.log(`  Anterior:`);
        console.log(`    Canonical: ${card.canonical_name}`);
        console.log(`    Nombre:    ${card.pokemon_name}`);
        console.log(`    Número:    ${card.card_number}`);
        console.log(`    Query:     ${card.ebay_search_query}`);
        console.log(`  Nuevo:`);
        console.log(`    Canonical: ${newCanonical}`);
        console.log(`    Nombre:    ${identity.pokemonName}`);
        console.log(`    Número:    ${identity.cardNumber}`);
        console.log(`    Query:     ${newQuery}`);

        // Verificar si ya existe otra carta con el nuevo canonical name
        const duplicate = db.prepare('SELECT * FROM cards WHERE canonical_name = ? AND id != ?')
          .get(newCanonical, card.id) as any;

        if (duplicate) {
          console.log(`  ⚠️  ¡Colisión detectada! Ya existe una carta válida con canonical: ${newCanonical} (ID: ${duplicate.id})`);
          console.log(`  🔄 Fusionando listings de esta carta con la carta existente y eliminando este duplicado...`);
          
          // Re-vincular los listings de Collector Crypt que apuntaban a esta carta vieja a la correcta
          const updateListingsResult = db.prepare('UPDATE crypt_listings SET matched_card_id = ? WHERE matched_card_id = ?')
            .run(duplicate.id, card.id);
          console.log(`    listings actualizados: ${updateListingsResult.changes}`);

          // Eliminar alertas asociadas a la carta duplicada
          db.prepare('DELETE FROM alerts WHERE card_id = ?').run(card.id);

          // Eliminar la carta vieja duplicada
          db.prepare('DELETE FROM cards WHERE id = ?').run(card.id);
          
          // Limpiar precios obsoletos de la carta duplicada
          const deleteOldPrices = db.prepare('DELETE FROM ebay_prices WHERE card_id = ?').run(card.id);
          pricesClearedCount += deleteOldPrices.changes;

          // Limpiar los precios también de la carta destino para forzar un scrapeo fresco con la query corregida
          const deleteDestPrices = db.prepare('DELETE FROM ebay_prices WHERE card_id = ?').run(duplicate.id);
          pricesClearedCount += deleteDestPrices.changes;

          mergedCount++;
        } else {
          // No hay colisión, actualizar la carta in-place
          db.prepare(`
            UPDATE cards 
            SET canonical_name = ?, 
                pokemon_name = ?, 
                card_number = ?, 
                ebay_search_query = ?,
                updated_at = datetime('now')
            WHERE id = ?
          `).run(newCanonical, identity.pokemonName, identity.cardNumber, newQuery, card.id);

          // Limpiar precios cacheados viejos para forzar scrapeo fresco
          const deletePrices = db.prepare('DELETE FROM ebay_prices WHERE card_id = ?').run(card.id);
          pricesClearedCount += deletePrices.changes;

          updatedCount++;
        }
      }
    }
  });

  transaction();

  console.log('\n==================================================');
  console.log(`🎉 Resumen de limpieza completada:`);
  console.log(`  - Cartas actualizadas: ${updatedCount}`);
  console.log(`  - Cartas duplicadas fusionadas y eliminadas: ${mergedCount}`);
  console.log(`  - Registros de precios incorrectos eliminados de caché: ${pricesClearedCount}`);
  console.log('==================================================\n');

  closeDb();
}

main();
