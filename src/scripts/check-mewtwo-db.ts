import { getDb, closeDb } from '../database/connection.js';

async function main() {
  const db = getDb();
  const cards = db.prepare("SELECT * FROM cards WHERE pokemon_name LIKE '%Mewtwo%'").all();
  console.log('Cards matching Mewtwo:', JSON.stringify(cards, null, 2));

  for (const card of cards as any[]) {
    const prices = db.prepare("SELECT * FROM ebay_prices WHERE card_id = ? ORDER BY fetched_at DESC").all(card.id);
    console.log(`Prices for card ${card.display_name} (${card.id}):`, JSON.stringify(prices, null, 2));
  }
  closeDb();
}

main().catch(console.error);
