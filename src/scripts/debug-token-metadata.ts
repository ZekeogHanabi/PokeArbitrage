import { getDb } from '../database/connection.js';
import { config } from '../config/index.js';

async function main() {
  const db = getDb();
  // Obtener un listado activo de la base de datos para usar su mint address
  const listing = db.prepare('SELECT mint_address, nft_name FROM crypt_listings LIMIT 1').get() as { mint_address: string, nft_name: string } | undefined;
  
  if (!listing) {
    console.log('⚠️ No active listings found in database to test.');
    return;
  }

  const mint = listing.mint_address;
  console.log(`🎯 Testing token metadata for: "${listing.nft_name}" (${mint})`);

  const url = `${config.MAGIC_EDEN_API_BASE}/tokens/${mint}`;
  console.log(`📡 Fetching from: ${url}`);
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' }
    });
    if (!res.ok) {
      console.log(`❌ Error ${res.status}: ${res.statusText}`);
      return;
    }
    const data = await res.json();
    console.log(`✅ Token Metadata:`, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('❌ Failed to fetch token metadata:', err);
  }
}

main().catch(console.error);
