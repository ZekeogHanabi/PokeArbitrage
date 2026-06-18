import { getPriceFromPriceCharting } from '../modules/pricing/pricecharting.scraper.js';
import { getDb, closeDb } from '../database/connection.js';

async function main() {
  getDb();
  
  const cardId = 'test-caitlin-167';
  const pokemonName = 'Caitlin';
  const setName = 'Pokemon Simplified Chinese Cs3b C-Primordial Arts: Torrent';
  const cardNumber = '167';
  const grader = 'PSA';
  const grade = 9;
  const displayName = '2023 #167 Caitlin PSA 9 Simplified Chinese Cs3b C-Primordial Arts: Torrent Pokemon';

  console.log(`📡 Consultando PriceCharting para:`);
  console.log(`  Carta:      "${displayName}"`);
  console.log(`  Pokémon:    ${pokemonName}`);
  console.log(`  Set:        ${setName}`);
  console.log(`  Número:     ${cardNumber}`);
  console.log(`  Grado:      ${grader} ${grade}\n`);

  const priceResult = await getPriceFromPriceCharting(
    cardId,
    pokemonName,
    setName,
    cardNumber,
    grader,
    grade,
    displayName
  );

  console.log('\n==================================================');
  if (priceResult) {
    console.log(`✅ ¡Precio obtenido con éxito!`);
    console.log(`  Precio Promedio: $${priceResult.avg_price_usd.toFixed(2)}`);
    console.log(`  Fuente:          ${priceResult.source}`);
    console.log(`  Fecha:           ${priceResult.fetched_at}`);
  } else {
    console.log(`❌ No se pudo obtener el precio.`);
  }
  console.log('==================================================\n');

  closeDb();
}

main().catch(console.error);
