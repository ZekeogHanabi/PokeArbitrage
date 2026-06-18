/**
 * PokeArbitrage v1.0 — Fase 1: Monitor y Notificador
 *
 * Entry point principal del bot. Inicializa todos los módulos:
 * 1. Configuración y base de datos
 * 2. Magic Eden Poller (detección de nuevos listings)
 * 3. Pipeline de procesamiento (matching + arbitraje + alertas)
 *
 * NO ejecuta transacciones. Solo monitorea, compara y alerta.
 */

import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { getDb, closeDb } from './database/connection.js';
import { runMigrations } from './database/migrate.js';
import { MagicEdenPoller } from './modules/collector-crypt/magiceden.poller.js';
import { extractIdentityFromAttributes } from './modules/matching/normalizer.js';
import { matchCard } from './modules/matching/matcher.js';
import { calculateArbitrage } from './modules/arbitrage/calculator.js';
import { processAlert } from './modules/alerts/alert.manager.js';
import { upsertListing, getListingByMint, getActiveListingsForCard } from './database/repositories/listings.repo.js';
import { getActiveCards, insertCard, getCardByCanonical } from './database/repositories/cards.repo.js';
import { getSolUsdPrice } from './utils/sol-price.js';
import { EbayScheduler } from './modules/ebay/ebay.scheduler.js';
import { PriceClient } from './modules/ebay/ebay.client.js';
import { sendDiscordLocalPriceUpdateAlert, sendDiscordLocalPriceComparisonAlert, sendDiscordMintedCardAlert } from './modules/alerts/discord.notifier.js';
import { buildCanonicalName } from './utils/string.utils.js';
import { v4 as uuid } from 'uuid';
import type { CryptListing } from './types/listing.types.js';
import type { ArbitrageOpportunity } from './types/alert.types.js';
import { calculateMarketMakingOpportunities } from './modules/matching/market-maker.js';
import { SolanaPoller } from './modules/collector-crypt/solana.poller.js';

// Instancia única compartida del cliente de precios
const priceClient = new PriceClient();

// ─── Banner ──────────────────────────────────────────────────
function printBanner(): void {
  console.log(`
  ╔══════════════════════════════════════════════════════════╗
  ║                                                          ║
  ║   ⚡ PokeArbitrage Bot v1.0                              ║
  ║   📊 Fase 1: Monitor y Notificador                      ║
  ║   🔗 Collector Crypt (Solana) ↔ eBay                    ║
  ║                                                          ║
  ║   ⚠️  Este bot NO ejecuta transacciones                  ║
  ║                                                          ║
  ╚══════════════════════════════════════════════════════════╝
  `);
}

// ─── Pipeline de procesamiento por cada nuevo listing ────────
async function handleNewListing(listing: CryptListing): Promise<void> {
  try {
    // 1. Buscar si ya conocemos este listing en la base de datos
    const existing = getListingByMint(listing.mint_address);

    // 2. Extraer identidad del NFT desde sus atributos
    const attrs: Record<string, string> = {};
    if (listing.card_name) attrs['Card Name'] = listing.card_name;
    if (listing.set_name) attrs['Set'] = listing.set_name;
    if (listing.grader) attrs['Grading Company'] = listing.grader;
    if (listing.grade !== null) attrs['GradeNum'] = listing.grade.toString();
    if (listing.year !== null) attrs['Year'] = listing.year.toString();
    if (listing.description) attrs['Description'] = listing.description;
    if (listing.card_number) attrs['Card Number'] = listing.card_number;
    if (listing.parallel) attrs['Parallel'] = listing.parallel;

    const identity = extractIdentityFromAttributes(attrs, listing.nft_name);

    // 3. Intentar emparejar con el catálogo de cartas
    const catalog = getActiveCards();
    const match = matchCard(identity, catalog);
    
    let matchedCard = match.card;

    // Si la carta no está en el catálogo, la creamos dinámicamente para registrarla y poder corroborar su precio
    if (!matchedCard) {
      const canonicalName = buildCanonicalName(
        identity.pokemonName,
        identity.setName,
        identity.cardNumber,
        identity.grader,
        identity.grade
      );

      // Verificar si ya existe por canonical_name en la DB (por si se insertó dinámicamente antes)
      let existingCard = getCardByCanonical(canonicalName);
      
      if (!existingCard) {
        // Construir la consulta de eBay/API optimizada
        const queryTerms = [
          identity.pokemonName,
          identity.setName,
          identity.cardNumber,
          identity.grader,
          identity.grade.toString()
        ].filter(Boolean).join(' ');

        const newCard = {
          id: uuid(),
          canonical_name: canonicalName,
          display_name: listing.nft_name,
          set_name: identity.setName,
          card_number: identity.cardNumber,
          pokemon_name: identity.pokemonName,
          grader: identity.grader,
          grade: identity.grade,
          rarity: attrs['Rarity'] || attrs['Parallel'] || null,
          ebay_search_query: queryTerms,
          is_active: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        insertCard(newCard);
        existingCard = newCard;
        logger.info({ card: newCard.display_name }, '🆕 Nueva carta registrada dinámicamente en el catálogo');
      }

      matchedCard = existingCard;
      listing.matched_card_id = matchedCard.id;
      listing.match_confidence = 1.0; // Confianza máxima ya que la creamos a partir del NFT
    } else {
      listing.matched_card_id = matchedCard.id;
      listing.match_confidence = match.confidence;
    }

    // 5. Si ya existía este listing en DB, verificar si cambió de precio o si le faltaba el matched_card_id
    if (existing) {
      const needsUpdate = existing.price_sol !== listing.price_sol || !existing.matched_card_id;
      
      if (existing.price_sol !== listing.price_sol) {
        logger.info(
          {
            card: listing.nft_name,
            prevSol: existing.price_sol,
            newSol: listing.price_sol,
          },
          '📉 Cambio de precio detectado localmente en Magic Eden'
        );
        
        // Calcular porcentaje de reducción (bajada de precio)
        const dropPct = ((existing.price_sol - listing.price_sol) / existing.price_sol) * 100;
        
        if (dropPct > 15) {
          logger.info({ dropPct: dropPct.toFixed(1) }, '🔥 Reducción de precio mayor al 15% detectada. Enviando alerta a Discord...');
          // Alertar a Discord (Sin llamadas API externas)
          await sendDiscordLocalPriceUpdateAlert(listing, existing.price_sol);
        } else {
          logger.info({ dropPct: dropPct.toFixed(1) }, '📉 Cambio de precio local omitido en Discord (reducción menor al 15% o subida)');
        }
      }

      if (!needsUpdate) {
        return; // Fin del procesamiento (no cambió de precio y ya tiene matched_card_id)
      }
    }

    // 6. Si es un listing totalmente nuevo en Magic Eden:
    // A. Comparativa de precio contra listings activos del mismo tipo en DB
    const siblings = getActiveListingsForCard(matchedCard.id);
    
    if (siblings.length > 0) {
      // Encontrar el listing activo existente más barato
      const cheapestSibling = siblings.reduce(
        (min, s) => s.price_sol < min.price_sol ? s : min,
        siblings[0]
      );
      
      // Comparar precios: solo alertar si el nuevo listing es MÁS BARATO y la reducción supera el 15%
      const diffSol = listing.price_sol - cheapestSibling.price_sol;
      if (diffSol < 0) {
        const dropPct = ((cheapestSibling.price_sol - listing.price_sol) / cheapestSibling.price_sol) * 100;
        if (dropPct > 15) {
          logger.info(
            {
              card: matchedCard.display_name,
              newPrice: listing.price_sol,
              cheapestExisting: cheapestSibling.price_sol,
              dropPct: dropPct.toFixed(1),
            },
            '💎 Nueva oferta >15% más barata detectada — enviando alerta a Discord'
          );
          // Alertar sobre nueva oferta más barata (Sin llamadas API externas)
          await sendDiscordLocalPriceComparisonAlert(listing, cheapestSibling);
        } else {
          logger.info(
            { card: matchedCard.display_name, dropPct: dropPct.toFixed(1) },
            '📊 Nueva oferta más barata encontrada pero reducción < 15%, omitiendo alerta'
          );
        }
      } else {
        logger.debug(
          { card: matchedCard.display_name, diffSol },
          '📊 Nuevo listing igual o más caro que el existente, sin alerta'
        );
      }
    }

    // Guardar listing en DB antes de continuar con la API de eBay/Pokémon
    upsertListing(listing);

    // 7. Obtener precio de referencia externo (con caching de 30 días y límite estricto de 100 llamadas)
    // Pasamos forceRefresh = true para que cada nueva carta enlistada realice un llamado fresco a la API para corroborar precio.
    // Pasamos también los campos pre-parseados del Card para evitar que el parser re-corrompa el nombre (ej: "Gengar Fossil 5/62" → "Gengar 5").
    const refPrice = await priceClient.getOrUpdatePrice(
      matchedCard.id,
      matchedCard.ebay_search_query,
      matchedCard.grader,
      matchedCard.grade,
      true,
      matchedCard.pokemon_name,
      matchedCard.set_name,
      matchedCard.card_number,
      matchedCard.display_name
    );
    
    if (!refPrice) {
      logger.debug({ card: matchedCard.display_name }, 'Sin precio de referencia');
      return;
    }

    // Calcular edad para saber si es stale (>= 7 días)
    const ageMs = Date.now() - new Date(refPrice.fetched_at).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const isStale = ageDays >= 7;

    // 8. Calcular arbitraje
    const arbitrage = calculateArbitrage(
      listing.price_sol,
      listing.sol_usd_rate,
      refPrice.avg_price_usd
    );

    if (arbitrage.isProfitable) {
      // Construir la URL de búsqueda de PriceCharting
      const pcSearchQuery = [
        matchedCard.pokemon_name,
        matchedCard.set_name,
        matchedCard.card_number
      ].filter(Boolean).join(' ');
      const priceChartingUrl = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(pcSearchQuery)}&type=prices`;

      const opportunity: ArbitrageOpportunity = {
        listing: {
          mintAddress: listing.mint_address,
          nftName: listing.nft_name,
          priceSol: listing.price_sol,
          priceUsd: listing.price_usd,
          listingUrl: listing.listing_url,
          imageUrl: '',
        },
        reference: {
          cardName: matchedCard.display_name,
          setName: matchedCard.set_name,
          grader: matchedCard.grader,
          grade: matchedCard.grade,
          ebayAvgPriceUsd: refPrice.avg_price_usd,
          source: refPrice.source,
          isStale,
          priceChartingUrl,
        },
        arbitrage,
        matchConfidence: listing.match_confidence,
      };

      logger.info(
        {
          card: matchedCard.display_name,
          cryptUsd: `$${arbitrage.cryptPriceUsd.toFixed(2)}`,
          ebayUsd: `$${refPrice.avg_price_usd.toFixed(2)}`,
          profit: `$${arbitrage.estimatedProfitUsd.toFixed(2)}`,
          pct: `${arbitrage.profitPercentage.toFixed(1)}%`,
          confidence: `${(listing.match_confidence * 100).toFixed(1)}%`,
        },
        '💰 Oportunidad de arbitraje detectada'
      );

      await processAlert(opportunity);
    } else {
      logger.debug(
        {
          card: matchedCard.display_name,
          profit: `$${arbitrage.estimatedProfitUsd.toFixed(2)}`,
          pct: `${arbitrage.profitPercentage.toFixed(1)}%`,
        },
        '📉 Listing no rentable'
      );
    }
  } catch (err) {
    logger.error(err, `Error procesando listing ${listing.mint_address}`);
  }
}

/**
 * Pipeline de procesamiento por cada nueva carta minteada (acuñada) en Solana
 */
async function handleNewMint(listing: CryptListing): Promise<void> {
  try {
    // 1. Buscar si ya conocemos este listing/token en la base de datos
    const existing = getListingByMint(listing.mint_address);
    if (existing) return; // Si ya existe, no hacemos nada

    // 2. Extraer identidad del NFT desde sus atributos
    const attrs: Record<string, string> = {};
    if (listing.card_name) attrs['Card Name'] = listing.card_name;
    if (listing.set_name) attrs['Set'] = listing.set_name;
    if (listing.grader) attrs['Grading Company'] = listing.grader;
    if (listing.grade !== null) attrs['GradeNum'] = listing.grade.toString();
    if (listing.year !== null) attrs['Year'] = listing.year.toString();
    if (listing.description) attrs['Description'] = listing.description;
    if (listing.card_number) attrs['Card Number'] = listing.card_number;
    if (listing.parallel) attrs['Parallel'] = listing.parallel;

    const identity = extractIdentityFromAttributes(attrs, listing.nft_name);

    // 3. Intentar emparejar con el catálogo de cartas
    const catalog = getActiveCards();
    const match = matchCard(identity, catalog);
    let matchedCard = match.card;

    // Si la carta no está en el catálogo, la creamos dinámicamente
    if (!matchedCard) {
      const canonicalName = buildCanonicalName(
        identity.pokemonName,
        identity.setName,
        identity.cardNumber,
        identity.grader,
        identity.grade
      );

      let existingCard = getCardByCanonical(canonicalName);
      
      if (!existingCard) {
        const queryTerms = [
          identity.pokemonName,
          identity.setName,
          identity.cardNumber,
          identity.grader,
          identity.grade.toString()
        ].filter(Boolean).join(' ');

        const newCard = {
          id: uuid(),
          canonical_name: canonicalName,
          display_name: listing.nft_name,
          set_name: identity.setName,
          card_number: identity.cardNumber,
          pokemon_name: identity.pokemonName,
          grader: identity.grader,
          grade: identity.grade,
          rarity: attrs['Rarity'] || attrs['Parallel'] || null,
          ebay_search_query: queryTerms,
          is_active: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        insertCard(newCard);
        existingCard = newCard;
        logger.info({ card: newCard.display_name }, '🆕 Nueva carta minteada registrada dinámicamente en el catálogo');
      }

      matchedCard = existingCard;
      listing.matched_card_id = matchedCard.id;
      listing.match_confidence = 1.0;
    } else {
      listing.matched_card_id = matchedCard.id;
      listing.match_confidence = match.confidence;
    }

    // Guardar listing con status 'minted' en DB
    upsertListing(listing);

    // 4. Si la carta no tiene Insured Value o es <= 0, no podemos calcular buyback
    if (!listing.insured_value_usd || listing.insured_value_usd <= 0) {
      logger.debug({ card: matchedCard.display_name }, 'Carta minteada no tiene Insured Value asignado');
      return;
    }

    const officialBuyback = listing.insured_value_usd * 0.85;

    // 5. Consultar precio de mercado físico
    const refPrice = await priceClient.getOrUpdatePrice(
      matchedCard.id,
      matchedCard.ebay_search_query,
      matchedCard.grader,
      matchedCard.grade,
      true, // Forzamos refresh para obtener el precio más fresco al ser minteada
      matchedCard.pokemon_name,
      matchedCard.set_name,
      matchedCard.card_number,
      matchedCard.display_name
    );

    if (!refPrice) {
      logger.debug({ card: matchedCard.display_name }, 'Sin precio de referencia para la carta minteada');
      return;
    }

    const physicalMarketUsd = refPrice.avg_price_usd;

    // 6. Comprobar la condición de discrepancia:
    // - P >= 1.30 * B
    // - P - B >= 25 USD
    const ratioIsGood = physicalMarketUsd >= (officialBuyback * 1.30);
    const spreadIsGood = (physicalMarketUsd - officialBuyback) >= 25.0;

    if (ratioIsGood && spreadIsGood) {
      const solPrice = await getSolUsdPrice();
      const recommendedBidUsd = officialBuyback * 1.05; // 5% por encima del buyback
      const estimatedProfitUsd = physicalMarketUsd - recommendedBidUsd;
      const marginPercentage = (estimatedProfitUsd / physicalMarketUsd) * 100;

      const opportunity = {
        cardId: matchedCard.id,
        nftName: listing.nft_name,
        mintAddress: listing.mint_address,
        grader: matchedCard.grader,
        grade: matchedCard.grade,
        insuredValueUsd: listing.insured_value_usd,
        officialBuybackUsd: officialBuyback,
        recommendedBidUsd: recommendedBidUsd,
        recommendedBidSol: recommendedBidUsd / solPrice,
        physicalMarketUsd: physicalMarketUsd,
        estimatedProfitUsd: estimatedProfitUsd,
        marginPercentage: marginPercentage,
      };

      logger.info(
        {
          card: matchedCard.display_name,
          buyback: `$${officialBuyback.toFixed(2)}`,
          physical: `$${physicalMarketUsd.toFixed(2)}`,
          bid: `$${recommendedBidUsd.toFixed(2)}`,
          profit: `$${estimatedProfitUsd.toFixed(2)}`,
        },
        '💼 ¡Oportunidad de Puja / Provisión de Liquidez detectada para nuevo mint!'
      );

      await sendDiscordMintedCardAlert(opportunity);
    }
  } catch (err) {
    logger.error(err, `Error procesando carta minteada ${listing.mint_address}`);
  }
}

// ─── Main ────────────────────────────────────────────────────
async function main(): Promise<void> {
  printBanner();

  // 1. Inicializar base de datos
  logger.info('📦 Inicializando base de datos...');
  getDb();
  runMigrations();

  // 2. Verificar precio SOL/USD
  try {
    const solPrice = await getSolUsdPrice();
    logger.info({ solUsd: `$${solPrice.toFixed(2)}` }, '💲 Precio SOL/USD obtenido');
  } catch (err) {
    logger.error(err, 'No se pudo obtener precio SOL/USD');
    process.exit(1);
  }

  // 3. Mostrar estado del catálogo
  const catalog = getActiveCards();
  logger.info(
    { cardsCount: catalog.length },
    catalog.length > 0
      ? '📚 Catálogo de cartas cargado'
      : '⚠️ Catálogo vacío — usando Insured Value como referencia de precio'
  );

  // 3.5. Buscar oportunidades de Market Making de alta rentabilidad (>40% de margen)
  try {
    const solPrice = await getSolUsdPrice();
    const mmOpportunities = calculateMarketMakingOpportunities(solPrice);
    const highMarginMm = mmOpportunities.filter(o => o.marginPercentage >= 40);
    if (highMarginMm.length > 0) {
      logger.info(
        { count: highMarginMm.length },
        `💼 [MARKET MAKER] ¡Se detectaron ${highMarginMm.length} oportunidades de puja estratégica con >40% de margen! Corre 'npx tsx src/scripts/check-market-making.ts' para verlas.`
      );
    }
  } catch (err) {
    logger.error(err, 'Error al comprobar oportunidades de Market Making al iniciar');
  }

  // 4. Verificar webhook de Discord
  if (config.DISCORD_WEBHOOK_URL) {
    logger.info('🔔 Discord webhook configurado');
  } else {
    logger.warn('⚠️ DISCORD_WEBHOOK_URL no configurado — las alertas solo se mostrarán en logs');
  }

  // 5. Iniciar Ebay Scheduler
  const ebayScheduler = new EbayScheduler();
  ebayScheduler.start();

  // 6. Iniciar Magic Eden Poller
  const poller = new MagicEdenPoller();
  poller.onListing(handleNewListing);
  poller.start();

  // 6.5. Iniciar Solana Poller (Acuñaciones en Blockchain)
  const solanaPoller = new SolanaPoller();
  solanaPoller.onMint(handleNewMint);
  solanaPoller.start();

  // 7. Configurar shutdown graceful
  const shutdown = (): void => {
    logger.info('🛑 Apagando PokeArbitrage...');
    poller.stop();
    solanaPoller.stop();
    ebayScheduler.stop();
    closeDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info('✅ PokeArbitrage está corriendo. Ctrl+C para detener.');
}

// Ejecutar
main().catch((err) => {
  logger.error(err, 'Error fatal');
  process.exit(1);
});
