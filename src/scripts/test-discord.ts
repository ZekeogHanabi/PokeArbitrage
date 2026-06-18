/**
 * Script para probar el webhook de Discord.
 * Envía un mensaje de prueba con un embed formateado como una alerta real.
 *
 * Uso: npm run test:discord
 */

import 'dotenv/config';
import type { ArbitrageOpportunity } from '../types/alert.types.js';
import { sendDiscordAlert } from '../modules/alerts/discord.notifier.js';

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL as string;

if (!WEBHOOK_URL) {
  console.error('❌ DISCORD_WEBHOOK_URL no está configurado en .env');
  console.log('   Pasos para configurarlo:');
  console.log('   1. Abre Discord y ve al canal donde quieres recibir alertas');
  console.log('   2. Click derecho en el canal → Editar Canal → Integraciones → Webhooks');
  console.log('   3. Click "Nuevo Webhook" → Copia la URL');
  console.log('   4. Pega la URL en tu archivo .env como DISCORD_WEBHOOK_URL=<url>');
  process.exit(1);
}

// Simular una oportunidad de arbitraje realista
const mockOpportunity: ArbitrageOpportunity = {
  listing: {
    mintAddress: 'TEST_MINT_ADDRESS_123456789',
    nftName: '2021 #17 UMBREON GOLD STAR PSA 10 POKEMON CELEBRATIONS CLASSIC COLLECTION',
    priceSol: 5.5,
    priceUsd: 990.0,
    listingUrl: 'https://collectorcrypt.com/assets/solana/AntLad9KXjq4KePU2SX1d8HdcRNwEqTW3U6gZPXD927q',
    imageUrl: 'https://arweave.net/ATwiVriSVZ3cW87Mdoy6MlRVQ3q--bgmIJBPv6_3qhU',
  },
  reference: {
    cardName: 'Umbreon Gold Star',
    setName: 'Celebrations Classic Collection',
    grader: 'PSA',
    grade: 10,
    ebayAvgPriceUsd: 1850.0,
    source: 'manual',
  },
  arbitrage: {
    isProfitable: true,
    cryptPriceUsd: 990.0,
    ebayRefPriceUsd: 1850.0,
    estimatedFeesUsd: 280.5,
    estimatedProfitUsd: 579.5,
    profitPercentage: 58.5,
    breakdown: {
      redemptionFee: 25.0,
      shippingFee: 15.0,
      ebaySellerFee: 240.5,
    },
  },
  matchConfidence: 0.95,
};

async function main(): Promise<void> {
  console.log('🧪 Enviando alerta de prueba a Discord...');
  console.log(`   Webhook: ${WEBHOOK_URL.substring(0, 60)}...`);
  console.log('');

  const result = await sendDiscordAlert(mockOpportunity);

  if (result) {
    console.log('✅ ¡Alerta enviada exitosamente! Revisa tu canal de Discord.');
  } else {
    console.log('❌ Error enviando la alerta. Revisa los logs arriba.');
  }
}

main().catch(console.error);
