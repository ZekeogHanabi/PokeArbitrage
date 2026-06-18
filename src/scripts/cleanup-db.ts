import { getDb, closeDb } from '../database/connection.js';
import { runMigrations } from '../database/migrate.js';
import { extractIdentityFromString } from '../modules/matching/normalizer.js';
import { buildCanonicalName } from '../utils/string.utils.js';
import { PriceClient } from '../modules/ebay/ebay.client.js';

const priceClient = new PriceClient();

async function main() {
  console.log('🧹 Iniciando limpieza de Base de Datos PokeArbitrage...');
  getDb();
  runMigrations();
  const db = getDb();

  // 1. Obtener todas las cartas registradas
  const cards = db.prepare('SELECT * FROM cards').all() as any[];
  console.log(`📋 Se encontraron ${cards.length} cartas en la base de datos.`);

  for (const card of cards) {
    // Usamos el display_name para extraer la identidad con el normalizador actual (que soporta #076, etc.)
    const identity = extractIdentityFromString(card.display_name);
    
    const newCanonical = buildCanonicalName(
      identity.pokemonName,
      identity.setName,
      identity.cardNumber,
      identity.grader,
      identity.grade
    );

    const needsUpdate = 
      card.canonical_name !== newCanonical || 
      card.pokemon_name !== identity.pokemonName ||
      card.set_name !== identity.setName ||
      card.card_number !== identity.cardNumber;

    if (needsUpdate) {
      console.log(`\n🔄 Actualizando carta ID ${card.id}:`);
      console.log(`   Display Name: "${card.display_name}"`);
      console.log(`   Viejo -> Canonical: "${card.canonical_name}", Pokemon: "${card.pokemon_name}", Set: "${card.set_name}", Num: "${card.card_number}"`);
      console.log(`   Nuevo -> Canonical: "${newCanonical}", Pokemon: "${identity.pokemonName}", Set: "${identity.setName}", Num: "${identity.cardNumber}"`);

      // Generar query de eBay/API optimizado
      const queryTerms = [
        identity.pokemonName,
        identity.setName,
        identity.cardNumber,
        identity.grader,
        identity.grade.toString()
      ].filter(Boolean).join(' ');

      try {
        // Actualizar los campos en la base de datos
        db.prepare(`
          UPDATE cards 
          SET canonical_name = ?, pokemon_name = ?, set_name = ?, card_number = ?, ebay_search_query = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(newCanonical, identity.pokemonName, identity.setName, identity.cardNumber, queryTerms, card.id);

        console.log(`   ✅ Campos de la carta actualizados con éxito.`);

        // Eliminar precios viejos para forzar al bot a buscar el precio real con el nuevo scraper de PriceCharting
        const deleteRes = db.prepare('DELETE FROM ebay_prices WHERE card_id = ?').run(card.id);
        console.log(`   🗑️ Se eliminaron ${deleteRes.changes} registros de precios anteriores.`);

        // Buscar el precio de inmediato con el nuevo scraper de PriceCharting para dejar la DB en estado correcto
        console.log(`   📡 Consultando precio en vivo con PriceCharting...`);
        const newPrice = await priceClient.getOrUpdatePrice(
          card.id,
          queryTerms,
          identity.grader,
          identity.grade,
          true,
          identity.pokemonName,
          identity.setName,
          identity.cardNumber
        );

        if (newPrice) {
          console.log(`   ✅ Nuevo precio guardado en DB: $${newPrice.avg_price_usd.toFixed(2)} (${newPrice.source})`);
        } else {
          console.log(`   ⚠️ No se pudo obtener precio en vivo para la carta actualizada.`);
        }
      } catch (err: any) {
        console.error(`   ❌ Error actualizando la carta:`, err.message || err);
      }
    }
  }

  console.log('\n✅ Limpieza de base de datos finalizada.');
  closeDb();
}

main().catch(console.error);
