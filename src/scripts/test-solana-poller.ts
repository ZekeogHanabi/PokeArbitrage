import { config } from '../config/index.js';
import { getDb, closeDb } from '../database/connection.js';
import { runMigrations } from '../database/migrate.js';
import { getSolUsdPrice } from '../utils/sol-price.js';

async function testSolanaPoller() {
  if (!config.SOLANA_RPC_URL) {
    console.error('❌ Error: SOLANA_RPC_URL no está configurada en el archivo .env');
    console.log('Regístrate gratis en https://dashboard.helius.dev/ y añade tu URL al .env.');
    return;
  }

  console.log('📦 Inicializando base de datos...');
  getDb();
  runMigrations();

  const solPrice = await getSolUsdPrice();
  console.log(`💲 Precio actual de SOL: $${solPrice.toFixed(2)} USD`);

  console.log(`📡 Consultando Solana RPC: ${config.SOLANA_RPC_URL}`);
  console.log('🔍 Obteniendo los últimos mints de Collector Crypt (Authority: DQPERZ9e86...)');

  const res = await fetch(config.SOLANA_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'test-cc-mints',
      method: 'getAssetsByCreator',
      params: {
        creatorAddress: 'DQPERZ9e86pNJ4mhUnCEP8V75yxZofsipoVrRWT5Wdxd',
        onlyVerified: true,
        page: 1,
        limit: 5,
        sortBy: {
          sortBy: 'created',
          sortDirection: 'desc'
        }
      }
    })
  });

  if (!res.ok) {
    console.error(`❌ Error HTTP: ${res.status} - ${res.statusText}`);
    closeDb();
    return;
  }

  const data = await res.json() as any;
  if (data.error) {
    console.error('❌ Error RPC:', data.error);
    closeDb();
    return;
  }

  const items = data.result?.items || [];
  console.log(`\n✅ Se obtuvieron ${items.length} acuñaciones recientes:\n`);

  for (const item of items) {
    const meta = item.content?.metadata;
    const rawAttrs = meta?.attributes || [];
    const attrs: Record<string, string> = {};
    for (const attr of rawAttrs) {
      if (attr.trait_type) attrs[attr.trait_type] = String(attr.value);
    }

    console.log(`🔹 NFT: "${meta?.name || 'Unknown'}"`);
    console.log(`   Mint Address: ${item.id}`);
    console.log(`   Owner: ${item.ownership?.owner || 'Unknown'}`);
    console.log(`   Insured Value: $${attrs['Insured Value'] || 'N/A'}`);
    console.log(`   Grading: ${attrs['Grading Company'] || 'N/A'} ${attrs['GradeNum'] || 'N/A'}`);
    console.log(`   Set: ${attrs['Set'] || 'N/A'}`);
    console.log('   ---------------------------------------------');
  }

  closeDb();
}

testSolanaPoller().catch(console.error);
