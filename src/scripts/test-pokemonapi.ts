/**
 * Script para probar la integración real con la API de Pokémon (pokemon-api.com en RapidAPI).
 * Intenta obtener el precio de una carta utilizando la API Key configurada en tu archivo .env.
 *
 * Uso: npx tsx src/scripts/test-pokemonapi.ts
 */

import 'dotenv/config';
import { PriceClient } from '../modules/ebay/ebay.client.js';

const token = process.env.PRICE_API_KEY as string;

if (!token) {
  console.error('❌ PRICE_API_KEY no está configurado en tu archivo .env');
  console.log('   Por favor, edita tu archivo .env y configura tu RapidAPI Key.');
  process.exit(1);
}

async function main() {
  console.log('🔍 Iniciando prueba de Pokémon TCG Pricing API (RapidAPI)...');
  console.log(`   Token: ${token.substring(0, 10)}... (longitud: ${token.length})`);
  console.log('');

  const client = new PriceClient();
  const cardQuery = 'Charizard Base Set 4/102';

  try {
    console.log(`📡 Consultando precio de referencia para: "${cardQuery}" PSA 10`);
    const pricePsa10 = await client.getReferencePrice(
      'test-card-10',
      `${cardQuery} PSA 10`,
      'PSA',
      10
    );

    if (pricePsa10) {
      console.log('   ✅ ¡Éxito! Respuesta de la API recibida:');
      console.log('   ----------------------------------------');
      console.log(`   Carta:      ${cardQuery}`);
      console.log(`   Grado:      PSA 10`);
      console.log(`   Precio USD: $${pricePsa10.avg_price_usd.toLocaleString()}`);
      console.log(`   Fuente:     ${pricePsa10.source}`);
      console.log(`   Fecha:      ${pricePsa10.fetched_at}`);
      console.log('   ----------------------------------------');
    } else {
      console.log('   ⚠️ La API respondió pero no se pudo determinar un precio para PSA 10 (¿caída al fallback de eBay scrape?).');
    }

    console.log('');
    console.log(`📡 Consultando precio de referencia para: "${cardQuery}" PSA 9`);
    const pricePsa9 = await client.getReferencePrice(
      'test-card-9',
      `${cardQuery} PSA 9`,
      'PSA',
      9
    );

    if (pricePsa9) {
      console.log('   ✅ ¡Éxito! Respuesta de la API recibida:');
      console.log('   ----------------------------------------');
      console.log(`   Carta:      ${cardQuery}`);
      console.log(`   Grado:      PSA 9`);
      console.log(`   Precio USD: $${pricePsa9.avg_price_usd.toLocaleString()}`);
      console.log(`   Fuente:     ${pricePsa9.source}`);
      console.log(`   Fecha:      ${pricePsa9.fetched_at}`);
      console.log('   ----------------------------------------');
    } else {
      console.log('   ⚠️ La API respondió pero no se pudo determinar un precio para PSA 9.');
    }

  } catch (err: any) {
    console.error('❌ Error ejecutando la consulta real a la API:', err.message || err);
  }
}

main().catch(console.error);
