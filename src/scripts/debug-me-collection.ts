import { config } from '../config/index.js';

async function main() {
  const url = `${config.MAGIC_EDEN_API_BASE}/collections/${config.COLLECTOR_CRYPT_COLLECTION_SYMBOL}`;
  console.log(`📡 Fetching collection info from: ${url}`);
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' }
    });
    if (!res.ok) {
      console.log(`❌ Error ${res.status}: ${res.statusText}`);
      return;
    }
    const data = await res.json();
    console.log(`✅ Collection Data:`, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('❌ Failed to fetch collection info:', err);
  }
}

main().catch(console.error);
