import { getDb, closeDb } from '../../src/database/connection.js';

function main() {
  const db = getDb();
  
  // Buscar listings de Zapdos
  const listings = db.prepare("SELECT * FROM crypt_listings WHERE nft_name LIKE '%Zapdos%'").all();
  console.log(`Found ${listings.length} Zapdos listings:`);
  for (const l of listings) {
    console.log(JSON.stringify(l, null, 2));
    console.log('---------------------------');
  }

  // Buscar cartas de Zapdos
  const cards = db.prepare("SELECT * FROM cards WHERE display_name LIKE '%Zapdos%'").all();
  console.log(`Found ${cards.length} Zapdos cards:`);
  for (const c of cards) {
    console.log(JSON.stringify(c, null, 2));
    console.log('---------------------------');
  }

  closeDb();
}

main();
