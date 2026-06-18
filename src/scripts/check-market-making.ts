/**
 * Script interactivo de consola para PokeArbitrage.
 * Analiza el catálogo de cartas descubiertas, calcula discrepancias de precio
 * y recomienda bids (pujas) estratégicas en Magic Eden.
 * 
 * Uso: npx tsx src/scripts/check-market-making.ts
 */

import 'dotenv/config';
import { getSolUsdPrice } from '../utils/sol-price.js';
import { calculateMarketMakingOpportunities } from '../modules/matching/market-maker.js';
import { getDb, closeDb } from '../database/connection.js';
import { runMigrations } from '../database/migrate.js';

// Colores ANSI para la consola
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const RED = '\x1b[31m';
const GRAY = '\x1b[90m';

function printHeader(solPrice: number): void {
  console.log(`
  ${BOLD}${CYAN}╔═════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`  ${BOLD}${CYAN}║   💼 PokeArbitrage — Consola de Market Making y Bid Arbitrage          ║${RESET}`);
  console.log(`  ${BOLD}${CYAN}║   💡 Oportunidades de Puja de Liquidez para Cartas No Listadas         ║${RESET}`);
  console.log(`  ${BOLD}${CYAN}╚═════════════════════════════════════════════════════════════════════════╝${RESET}`);
  console.log(`  ${BOLD}💲 Precio de SOL: ${GREEN}$${solPrice.toFixed(2)} USD${RESET}  |  ${GRAY}Tipo de cambio dinámico${RESET}`);
  console.log(`  ${GRAY}-------------------------------------------------------------------------${RESET}`);
}

async function main() {
  // 1. Inicializar base de datos
  getDb();
  runMigrations();

  // 2. Obtener precio actual de SOL
  let solPrice = 145.0;
  try {
    solPrice = await getSolUsdPrice();
  } catch (err) {
    console.log(`⚠️ ${YELLOW}No se pudo obtener precio SOL/USD en tiempo real. Usando fallback de $${solPrice.toFixed(2)}${RESET}`);
  }

  printHeader(solPrice);

  // 3. Calcular oportunidades
  console.log(`  🔍 ${CYAN}Escaneando catálogo local de pNFTs y mapeando contra precios físicos...${RESET}`);
  console.log('');

  const opportunities = calculateMarketMakingOpportunities(solPrice);

  if (opportunities.length === 0) {
    console.log(`  ${YELLOW}ℹ️ No se encontraron oportunidades que cumplan los umbrales de discrepancia:${RESET}`);
    console.log(`  • ${GRAY}El precio físico P debe ser >= 30% superior al buyback B (P >= 1.30 * B)${RESET}`);
    console.log(`  • ${GRAY}La diferencia absoluta (P - B) debe ser >= $25.00 USD${RESET}`);
    console.log('');
    closeDb();
    return;
  }

  console.log(`  🎉 ${GREEN}¡Se encontraron ${opportunities.length} oportunidades lucrativas!${RESET}`);
  console.log('');

  // 4. Imprimir la hermosa tabla
  // Anchos de columna
  const colIndex = 3;
  const colCard = 32;
  const colInsVal = 9;
  const colBuyback = 9;
  const colBid = 18;
  const colPhysical = 9;
  const colProfit = 15;

  // Encabezado
  const header = 
    `  ` +
    `${BOLD}#`.padEnd(colIndex) + ' | ' +
    `Carta (Certificación)`.padEnd(colCard) + ' | ' +
    `Ins.Val`.padEnd(colInsVal) + ' | ' +
    `Buyback`.padEnd(colBuyback) + ' | ' +
    `Recommended Bid`.padEnd(colBid) + ' | ' +
    `Physical`.padEnd(colPhysical) + ' | ' +
    `Profit (Margin)`.padEnd(colProfit);

  console.log(BOLD + header + RESET);
  console.log(`  ` + GRAY + `─`.repeat(colIndex + colCard + colInsVal + colBuyback + colBid + colPhysical + colProfit + 18) + RESET);

  opportunities.forEach((opt, index) => {
    const idxStr = `${index + 1}`.padEnd(colIndex);
    
    // Formatear nombre de carta cortándolo si es demasiado largo
    let cardDisplayName = `${opt.nftName} (${opt.grader} ${opt.grade})`;
    if (cardDisplayName.length > colCard) {
      cardDisplayName = cardDisplayName.substring(0, colCard - 3) + '...';
    }
    const cardStr = cardDisplayName.padEnd(colCard);

    // Formatear precios
    const insValStr = `$${opt.insuredValueUsd.toFixed(1)}`.padEnd(colInsVal);
    const buybackStr = `$${opt.officialBuybackUsd.toFixed(1)}`.padEnd(colBuyback);
    
    // Puja recomendada: USD y SOL
    const bidStr = `$${opt.recommendedBidUsd.toFixed(1)} (${opt.recommendedBidSol.toFixed(2)} SOL)`.padEnd(colBid);
    const physicalStr = `$${opt.physicalMarketUsd.toFixed(1)}`.padEnd(colPhysical);
    
    // Profit
    const profitStr = `${BOLD}${GREEN}+$${opt.estimatedProfitUsd.toFixed(1)}${RESET} ${GRAY}(${opt.marginPercentage.toFixed(0)}%)${RESET}`.padEnd(colProfit + 18); // Ajuste por los escapes de color ANSI

    console.log(
      `  ` +
      `${idxStr} | ` +
      `${cardStr} | ` +
      `${insValStr} | ` +
      `${buybackStr} | ` +
      `${YELLOW}${bidStr}${RESET} | ` +
      `${CYAN}${physicalStr}${RESET} | ` +
      `${profitStr}`
    );
    console.log(`    ${GRAY}└─ ${MAGENTA}Magic Eden Link: ${RESET}${GRAY}${opt.mintAddress ? `https://magiceden.io/item-details/${opt.mintAddress}` : 'N/A'}${RESET}`);
    console.log('');
  });

  console.log(`  ${BOLD}💡 Instrucciones para el operador:${RESET}`);
  console.log(`  1. Copia el enlace de ${MAGENTA}Magic Eden${RESET} de la carta seleccionada.`);
  console.log(`  2. Haz clic en "${BOLD}Place Bid${RESET}" y ofrece el precio recomendado en SOL (${YELLOW}Recommended Bid${RESET}).`);
  console.log(`  3. ¡Si el dueño acepta, obtendrás una carta física Premium a una fracción de su valor real!`);
  console.log('');

  closeDb();
}

main().catch((err) => {
  console.error('❌ Error ejecutando consola de market making:', err);
  closeDb();
});
