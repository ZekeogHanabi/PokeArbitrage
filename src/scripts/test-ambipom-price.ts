import { getPriceFromPriceCharting } from '../modules/pricing/pricecharting.scraper.js';
import { getDb, closeDb } from '../database/connection.js';

async function main() {
  getDb();
  
  const cardId = 'test-ambipom-92';
  const pokemonName = 'Ambipom';
  const setName = 'Japanese Mega Inferno X';
  const cardNumber = '92';
  const grader = 'CGC';
  const grade = 10;
  const displayName = '2025 #92 Japanese Mega Inferno X AR Ambipom GEM MINT CGC 10 Pokemon';

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
