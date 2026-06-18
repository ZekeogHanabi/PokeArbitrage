/**
 * Script para poblar el catálogo inicial de cartas a monitorear.
 *
 * Este catálogo contiene cartas Pokémon de alto valor con grados PSA 9 y PSA 10.
 * Cada entrada tiene un precio de referencia manual que debe actualizarse
 * periódicamente con datos reales de eBay / PriceCharting.
 *
 * Uso: npm run seed
 */

import { getDb, closeDb } from '../database/connection.js';
import { runMigrations } from '../database/migrate.js';
import { insertCard } from '../database/repositories/cards.repo.js';
import { insertPrice } from '../database/repositories/prices.repo.js';
import { buildCanonicalName } from '../utils/string.utils.js';
import { v4 as uuid } from 'uuid';
import type { Card } from '../types/card.types.js';
import type { EbayPrice } from '../types/listing.types.js';

// ─── Catálogo de cartas de alto valor ───────────────────────
// Formato: [pokemonName, setName, cardNumber, grader, grade, rarity, ebaySearchQuery, estimatedPriceUsd]

const SEED_CARDS: Array<[string, string, string | null, string, number, string, string, number]> = [
  // === BASE SET (1999) — Las cartas más icónicas ===
  ['Charizard', 'Base Set', '4/102', 'PSA', 10, 'Holo Rare', 'Charizard Base Set 4/102 PSA 10', 50000],
  ['Charizard', 'Base Set', '4/102', 'PSA', 9, 'Holo Rare', 'Charizard Base Set 4/102 PSA 9', 3500],
  ['Blastoise', 'Base Set', '2/102', 'PSA', 10, 'Holo Rare', 'Blastoise Base Set 2/102 PSA 10', 8000],
  ['Blastoise', 'Base Set', '2/102', 'PSA', 9, 'Holo Rare', 'Blastoise Base Set 2/102 PSA 9', 800],
  ['Venusaur', 'Base Set', '15/102', 'PSA', 10, 'Holo Rare', 'Venusaur Base Set 15/102 PSA 10', 5000],
  ['Venusaur', 'Base Set', '15/102', 'PSA', 9, 'Holo Rare', 'Venusaur Base Set 15/102 PSA 9', 600],
  ['Mewtwo', 'Base Set', '10/102', 'PSA', 10, 'Holo Rare', 'Mewtwo Base Set 10/102 PSA 10', 3500],
  ['Mewtwo', 'Base Set', '10/102', 'PSA', 9, 'Holo Rare', 'Mewtwo Base Set 10/102 PSA 9', 350],
  ['Alakazam', 'Base Set', '1/102', 'PSA', 10, 'Holo Rare', 'Alakazam Base Set 1/102 PSA 10', 3000],
  ['Chansey', 'Base Set', '3/102', 'PSA', 10, 'Holo Rare', 'Chansey Base Set 3/102 PSA 10', 2500],

  // === SHADOWLESS (Ultra raras) ===
  ['Charizard', 'Base Set Shadowless', '4/102', 'PSA', 10, 'Holo Rare', 'Charizard Shadowless 4/102 PSA 10', 420000],
  ['Charizard', 'Base Set Shadowless', '4/102', 'PSA', 9, 'Holo Rare', 'Charizard Shadowless 4/102 PSA 9', 25000],

  // === 1ST EDITION BASE SET (Las más valiosas) ===
  ['Charizard', '1st Edition Base Set', '4/102', 'PSA', 10, 'Holo Rare', 'Charizard 1st Edition Base Set PSA 10', 500000],
  ['Charizard', '1st Edition Base Set', '4/102', 'PSA', 9, 'Holo Rare', 'Charizard 1st Edition Base Set PSA 9', 60000],

  // === JUNGLE (1999) ===
  ['Jolteon', 'Jungle', '4/64', 'PSA', 10, 'Holo Rare', 'Jolteon Jungle 4/64 PSA 10', 1200],
  ['Flareon', 'Jungle', '3/64', 'PSA', 10, 'Holo Rare', 'Flareon Jungle 3/64 PSA 10', 1200],
  ['Vaporeon', 'Jungle', '12/64', 'PSA', 10, 'Holo Rare', 'Vaporeon Jungle 12/64 PSA 10', 1500],

  // === FOSSIL (1999) ===
  ['Gengar', 'Fossil', '5/62', 'PSA', 10, 'Holo Rare', 'Gengar Fossil 5/62 PSA 10', 40],
  ['Dragonite', 'Fossil', '4/62', 'PSA', 10, 'Holo Rare', 'Dragonite Fossil 4/62 PSA 10', 1500],

  // === NEO GENESIS / DISCOVERY (2000-2001) ===
  ['Lugia', 'Neo Genesis', '9/111', 'PSA', 10, 'Holo Rare', 'Lugia Neo Genesis 9/111 PSA 10', 15000],
  ['Lugia', 'Neo Genesis', '9/111', 'PSA', 9, 'Holo Rare', 'Lugia Neo Genesis 9/111 PSA 9', 2000],
  ['Typhlosion', 'Neo Genesis', '17/111', 'PSA', 10, 'Holo Rare', 'Typhlosion Neo Genesis 17/111 PSA 10', 2500],

  // === GOLD STAR CARDS (2004-2007 — Extremadamente raras) ===
  ['Charizard', 'Dragon Frontiers', '100/101', 'PSA', 10, 'Gold Star', 'Charizard Gold Star Dragon Frontiers PSA 10', 50000],
  ['Umbreon', 'Pop Series 5', '17/17', 'PSA', 10, 'Gold Star', 'Umbreon Gold Star Pop Series 5 PSA 10', 20000],
  ['Espeon', 'Pop Series 5', '16/17', 'PSA', 10, 'Gold Star', 'Espeon Gold Star Pop Series 5 PSA 10', 15000],

  // === CELEBRATIONS (2021) ===
  ['Umbreon', 'Celebrations Classic Collection', '17/25', 'PSA', 10, 'Gold Star', 'Umbreon Gold Star Celebrations Classic Collection PSA 10', 400],
  ['Umbreon', 'Celebrations Classic Collection', '17/25', 'PSA', 9, 'Gold Star', 'Umbreon Gold Star Celebrations Classic Collection PSA 9', 200],
  ['Charizard', 'Celebrations', '4/102', 'PSA', 10, 'Holo Rare', 'Charizard Celebrations 4/102 PSA 10', 250],

  // === MODERN SETS (2023-2024) — Alto volumen en Collector Crypt ===
  ['Charizard', 'Obsidian Flames', '234/197', 'PSA', 10, 'Illustration Rare', 'Charizard ex Obsidian Flames 234 PSA 10', 300],
  ['Mew', 'Pokemon 151', '205/165', 'PSA', 10, 'Special Art Rare', 'Mew ex 151 205 PSA 10', 350],
  ['Charizard', 'Pokemon 151', '199/165', 'PSA', 10, 'Illustration Rare', 'Charizard ex 151 199 PSA 10', 500],
  ['Pikachu', 'Crown Zenith', 'GG30/GG70', 'PSA', 10, 'Galarian Gallery', 'Pikachu Crown Zenith GG30 PSA 10', 200],
  ['Eevee', 'Pokemon 151', '204/165', 'PSA', 10, 'Illustration Rare', 'Eevee 151 204 PSA 10', 150],
  ['Mewtwo', 'Pokemon 151', '193/165', 'PSA', 10, 'Special Art Rare', 'Mewtwo ex 151 193 PSA 10', 200],

  // === JAPANESE CARDS (Populares en Collector Crypt) ===
  ['Charizard', 'VSTAR Universe', '212/172', 'PSA', 10, 'Art Rare', 'Charizard VSTAR Universe 212 Japanese PSA 10', 250],
  ['Pikachu', 'VMAX Climax', '265/184', 'PSA', 10, 'Character Secret Rare', 'Pikachu VMAX Climax 265 Japanese PSA 10', 400],
];

async function main(): Promise<void> {
  console.log('🌱 Poblando catálogo de cartas...\n');

  // Inicializar DB
  getDb();
  runMigrations();

  let cardCount = 0;
  let priceCount = 0;

  const now = new Date().toISOString();

  for (const [pokemonName, setName, cardNumber, grader, grade, rarity, ebayQuery, estimatedPrice] of SEED_CARDS) {
    const canonicalName = buildCanonicalName(pokemonName, setName, cardNumber, grader, grade);

    const card: Card = {
      id: uuid(),
      canonical_name: canonicalName,
      display_name: `${pokemonName} ${setName}${cardNumber ? ` ${cardNumber}` : ''} ${grader} ${grade}`,
      set_name: setName,
      card_number: cardNumber,
      pokemon_name: pokemonName,
      grader,
      grade,
      rarity,
      ebay_search_query: ebayQuery,
      is_active: 1,
      created_at: now,
      updated_at: now,
    };

    insertCard(card);
    cardCount++;

    // Insertar precio de referencia manual
    const price: EbayPrice = {
      id: uuid(),
      card_id: card.id,
      avg_price_usd: estimatedPrice,
      median_price_usd: estimatedPrice,
      min_price_usd: estimatedPrice * 0.8,
      max_price_usd: estimatedPrice * 1.2,
      sample_count: 1,
      source: 'manual',
      fetched_at: now,
    };

    insertPrice(price);
    priceCount++;

    console.log(`  ✅ ${card.display_name} — $${estimatedPrice.toLocaleString()}`);
  }

  console.log(`\n🎉 Catálogo poblado: ${cardCount} cartas, ${priceCount} precios de referencia.`);
  console.log('\n⚠️  Los precios son estimaciones manuales. Actualiza con datos reales de eBay cuando');
  console.log('   tengas configurada la fuente de precios (eBay API, PriceCharting, o pokemon-api.com).\n');

  closeDb();
}

main().catch(console.error);
