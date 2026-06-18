import { getDb, closeDb } from '../../src/database/connection.js';

function main() {
  const db = getDb();
  
  // Buscar listings de Caitlin
  const listings = db.prepare("SELECT * FROM crypt_listings WHERE nft_name LIKE '%Caitlin%'").all();
  console.log(`Found ${listings.length} Caitlin listings:`);
  for (const l of listings) {
    console.log(JSON.stringify(l, null, 2));
    console.log('---------------------------');
  }

  // Buscar cartas de Caitlin
  const cards = db.prepare("SELECT * FROM cards WHERE display_name LIKE '%Caitlin%'").all();
  console.log(`Found ${cards.length} Caitlin cards:`);
  for (const c of cards) {
    console.log(JSON.stringify(c, null, 2));
    console.log('---------------------------');
  }

  closeDb();
}

main();
