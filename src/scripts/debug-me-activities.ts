import { config } from '../config/index.js';

async function main() {
  const url = `${config.MAGIC_EDEN_API_BASE}/collections/${config.COLLECTOR_CRYPT_COLLECTION_SYMBOL}/activities?offset=0&limit=100`;
  console.log(`📡 Fetching activities from: ${url}`);
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' }
    });
    if (!res.ok) {
      console.log(`❌ Error ${res.status}: ${res.statusText}`);
      return;
    }
    const activities = await res.json() as any[];
    console.log(`✅ Fetched ${activities.length} activities.`);
    
    // Contar tipos de actividades únicos
    const typesCount: Record<string, number> = {};
    for (const act of activities) {
      typesCount[act.type] = (typesCount[act.type] || 0) + 1;
    }
    console.log('\n📊 Unique Activity Types:', typesCount);

    // Mostrar una muestra de cada tipo
    console.log('\n📋 Samples of each type:');
    const seenTypes = new Set<string>();
    for (const act of activities) {
      if (!seenTypes.has(act.type)) {
        seenTypes.add(act.type);
        console.log(`\n🔹 Type: "${act.type}"`);
        console.log(JSON.stringify(act, null, 2));
      }
    }
  } catch (err) {
    console.error('❌ Failed to fetch activities:', err);
  }
}

main().catch(console.error);
