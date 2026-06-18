import { logger } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import type { ArbitrageOpportunity } from '../../types/alert.types.js';

/**
 * Color del embed según porcentaje de ganancia
 */
function getColor(profitPct: number): number {
  if (profitPct >= 50) return 0x00ff88; // Verde brillante: >50%
  if (profitPct >= 30) return 0x44ff44; // Verde: 30-50%
  if (profitPct >= 20) return 0xffdd00; // Amarillo: 20-30%
  return 0xff8800;                       // Naranja: <20%
}

/**
 * Envía una alerta de arbitraje formateada como embed rico a Discord
 */
export async function sendDiscordAlert(opportunity: ArbitrageOpportunity): Promise<string | null> {
  const webhookUrl = config.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn('DISCORD_WEBHOOK_URL no configurado, alerta no enviada');
    return null;
  }

  const { listing, reference, arbitrage, matchConfidence } = opportunity;
  const profitEmoji =
    arbitrage.profitPercentage >= 50
      ? '🔥🔥🔥'
      : arbitrage.profitPercentage >= 30
        ? '🔥🔥'
        : '🔥';

  const embed: any = {
    title: `${profitEmoji} ARBITRAJE DETECTADO`,
    color: getColor(arbitrage.profitPercentage),
    thumbnail: {
      url: listing.imageUrl,
    },
    fields: [
      {
        name: '📇 Carta',
        value: `**${listing.nftName}**`,
        inline: false,
      },
      {
        name: '🏷️ Collector Crypt',
        value: `$${arbitrage.cryptPriceUsd.toFixed(2)} (${listing.priceSol.toFixed(2)} SOL)`,
        inline: true,
      },
      {
        name: '📊 eBay Referencia',
        value: `$${arbitrage.ebayRefPriceUsd.toFixed(2)} (${reference.source})${reference.isStale ? ' ⚠️ *(Antiguo, >7d)*' : ''}`,
        inline: true,
      },
      {
        name: '💸 Fees Estimados',
        value: [
          `Redención: $${arbitrage.breakdown.redemptionFee.toFixed(2)}`,
          `Envío: $${arbitrage.breakdown.shippingFee.toFixed(2)}`,
          `eBay (${config.EBAY_SELLER_FEE_PERCENT}%): $${arbitrage.breakdown.ebaySellerFee.toFixed(2)}`,
          `**Total: $${arbitrage.estimatedFeesUsd.toFixed(2)}**`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '💰 Ganancia Estimada',
        value: `**$${arbitrage.estimatedProfitUsd.toFixed(2)} (${arbitrage.profitPercentage.toFixed(1)}%)**`,
        inline: true,
      },
      {
        name: '📈 Confianza Match',
        value: `${(matchConfidence * 100).toFixed(1)}%`,
        inline: true,
      },
      {
        name: '🎯 Grado',
        value: `${reference.grader} ${reference.grade}`,
        inline: true,
      },
      {
        name: '🔗 Enlaces',
        value: (() => {
          const links = [
            `[Comprar en Collector Crypt](${listing.listingUrl})`,
            `[Ver en Magic Eden](https://magiceden.io/item-details/${listing.mintAddress})`,
          ];
          if (reference.priceChartingUrl) {
            links.push(`[PriceCharting](${reference.priceChartingUrl})`);
          }
          return links.join(' | ');
        })(),
        inline: false,
      },
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: 'PokeArbitrage Bot v1.0 • Fase 1: Solo Monitoreo • NO es consejo financiero',
    },
  };

  if (reference.isStale) {
    embed.description = '⚠️ **Nota**: El precio de referencia tiene más de una semana de antigüedad y podría haber variado.';
  }

  const payload = {
    username: 'PokeArbitrage Bot',
    avatar_url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/6.png', // Charizard
    embeds: [embed],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, 'Error enviando alerta a Discord');
      return null;
    }

    logger.info(
      { card: listing.nftName, profit: `$${arbitrage.estimatedProfitUsd.toFixed(2)}` },
      '✅ Alerta de Discord enviada',
    );

    // Discord no retorna message_id en webhooks directamente
    return `discord_${Date.now()}`;
  } catch (err) {
    logger.error(err, 'Error de red enviando alerta a Discord');
    return null;
  }
}

/**
 * Envía una alerta cuando cambia el precio de un listing existente en Magic Eden
 */
export async function sendDiscordLocalPriceUpdateAlert(
  listing: any,
  oldPriceSol: number
): Promise<string | null> {
  const webhookUrl = config.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn('DISCORD_WEBHOOK_URL no configurado, alerta de precio no enviada');
    return null;
  }

  const diffSol = listing.price_sol - oldPriceSol;
  const isDrop = diffSol < 0;
  const actionEmoji = isDrop ? '📉 BAJADA DE PRECIO' : '📈 SUBIDA DE PRECIO';
  const embedColor = isDrop ? 0x00ff00 : 0xff4444; // Verde para bajada, rojo para subida

  const embed: any = {
    title: `${actionEmoji} DETECTADA EN MAGIC EDEN`,
    color: embedColor,
    description: `El precio de la carta **${listing.nft_name}** ha cambiado.`,
    fields: [
      {
        name: '📇 Carta',
        value: `**${listing.nft_name}**`,
        inline: false,
      },
      {
        name: 'Precio Anterior',
        value: `${oldPriceSol.toFixed(2)} SOL (~$${(oldPriceSol * listing.sol_usd_rate).toFixed(2)})`,
        inline: true,
      },
      {
        name: 'Precio Nuevo',
        value: `**${listing.price_sol.toFixed(2)} SOL (~$${listing.price_usd.toFixed(2)})**`,
        inline: true,
      },
      {
        name: 'Cambio',
        value: `${isDrop ? '📉' : '📈'} ${isDrop ? '' : '+'}${diffSol.toFixed(2)} SOL (~$${(diffSol * listing.sol_usd_rate).toFixed(2)})`,
        inline: false,
      },
      {
        name: '🔗 Enlaces',
        value: (() => {
          const links = [
            `[Comprar en Collector Crypt](${listing.listing_url})`,
            `[Ver en Magic Eden](https://magiceden.io/item-details/${listing.mint_address})`,
          ];
          const pcQuery = [listing.card_name || listing.nft_name, listing.set_name, listing.card_number]
            .filter(Boolean)
            .join(' ');
          if (pcQuery.length > 0) {
            const pcUrl = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(pcQuery)}&type=prices`;
            links.push(`[PriceCharting](${pcUrl})`);
          }
          return links.join(' | ');
        })(),
        inline: false,
      },
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: 'PokeArbitrage Bot v1.0 • Alerta Local (Sin llamadas API)',
    },
  };

  const payload = {
    username: 'PokeArbitrage Bot',
    avatar_url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/6.png', // Charizard
    embeds: [embed],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, 'Error enviando alerta local a Discord');
      return null;
    }

    logger.info(
      { card: listing.nft_name, diffSol: diffSol.toFixed(2) },
      `📉 Alerta de cambio de precio local enviada a Discord (${diffSol.toFixed(2)} SOL)`
    );
    return `discord_local_${Date.now()}`;
  } catch (err) {
    logger.error(err, 'Error de red enviando alerta local a Discord');
    return null;
  }
}

/**
 * Envía una alerta cuando se publica un listing nuevo de una carta que ya tiene otro listing activo,
 * permitiendo comparar los precios en Magic Eden directamente.
 */
export async function sendDiscordLocalPriceComparisonAlert(
  listing: any,
  cheapestSibling: any
): Promise<string | null> {
  const webhookUrl = config.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn('DISCORD_WEBHOOK_URL no configurado, alerta comparativa no enviada');
    return null;
  }

  const diffSol = listing.price_sol - cheapestSibling.price_sol;
  const isCheaper = diffSol < 0;
  const actionEmoji = isCheaper ? '💎 NUEVA OFERTA MÁS BARATA' : '📊 COMPOSICIÓN DE PRECIOS LOCAL';
  const embedColor = isCheaper ? 0x00ffff : 0x888888; // Turquesa para oferta más barata, gris para normal

  const embed: any = {
    title: `${actionEmoji} DETECTADA EN MAGIC EDEN`,
    color: embedColor,
    description: isCheaper 
      ? `¡Se ha listado una versión de esta carta **más barata** que las existentes en Magic Eden!`
      : `Se ha listado una carta que ya tiene otros listings activos. Comparando precios locales.`,
    fields: [
      {
        name: '📇 Carta',
        value: `**${listing.nft_name}**`,
        inline: false,
      },
      {
        name: 'Nuevo Listing',
        value: `**${listing.price_sol.toFixed(2)} SOL (~$${listing.price_usd.toFixed(2)})**`,
        inline: true,
      },
      {
        name: 'Cheapest Existente',
        value: `${cheapestSibling.price_sol.toFixed(2)} SOL (~$${cheapestSibling.price_usd.toFixed(2)})`,
        inline: true,
      },
      {
        name: 'Diferencia',
        value: `${isCheaper ? '🔥 ¡Ahorras' : 'Diferencia:'} ${isCheaper ? '-' : '+'}${Math.abs(diffSol).toFixed(2)} SOL (~$${Math.abs(diffSol * listing.sol_usd_rate).toFixed(2)})${isCheaper ? '!' : ''}`,
        inline: false,
      },
      {
        name: '🔗 Enlaces',
        value: (() => {
          const links = [
            `[Comprar Nuevo Listing](${listing.listing_url})`,
            `[Ver Listing Existente](${cheapestSibling.listing_url})`,
          ];
          const pcQuery = [listing.card_name || listing.nft_name, listing.set_name, listing.card_number]
            .filter(Boolean)
            .join(' ');
          if (pcQuery.length > 0) {
            const pcUrl = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(pcQuery)}&type=prices`;
            links.push(`[PriceCharting](${pcUrl})`);
          }
          return links.join(' | ');
        })(),
        inline: false,
      },
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: 'PokeArbitrage Bot v1.0 • Alerta Local (Sin llamadas API)',
    },
  };

  const payload = {
    username: 'PokeArbitrage Bot',
    avatar_url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/6.png', // Charizard
    embeds: [embed],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, 'Error enviando alerta local comparativa a Discord');
      return null;
    }

    logger.info(
      { card: listing.nft_name, cheapestExisting: cheapestSibling.price_sol.toFixed(2), newPrice: listing.price_sol.toFixed(2) },
      `💎 Alerta local comparativa enviada a Discord (${listing.price_sol.toFixed(2)} vs ${cheapestSibling.price_sol.toFixed(2)} SOL)`
    );
    return `discord_local_comp_${Date.now()}`;
  } catch (err) {
    logger.error(err, 'Error de red enviando alerta local comparativa a Discord');
    return null;
  }
}

/**
 * Envía una alerta de Market Making/Bid estratégica para una carta recién minteada
 */
export async function sendDiscordMintedCardAlert(opportunity: any): Promise<string | null> {
  const webhookUrl = config.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn('DISCORD_WEBHOOK_URL no configurado, alerta de nueva carta minteada no enviada');
    return null;
  }

  const opt = opportunity;
  const embed: any = {
    title: `💼 NUEVO MINT — OPORTUNIDAD DE PUJA (MARKET MAKING)`,
    color: 0x9b59b6, // Morado
    description: `Se ha detectado una nueva carta minteada en Solana con una alta discrepancia entre su precio de recompra (buyback) y el mercado físico real.`,
    fields: [
      {
        name: '📇 Carta',
        value: `**${opt.nftName}**`,
        inline: false,
      },
      {
        name: '🛡️ Certificación y Grado',
        value: `${opt.grader} ${opt.grade}`,
        inline: true,
      },
      {
        name: '💰 Valor Asegurado',
        value: `$${opt.insuredValueUsd.toFixed(2)}`,
        inline: true,
      },
      {
        name: '🏦 Suelo de Recompra (Buyback 85%)',
        value: `$${opt.officialBuybackUsd.toFixed(2)}`,
        inline: true,
      },
      {
        name: '⚡ Puja Recomendada (Bid 5% Premium)',
        value: `**$${opt.recommendedBidUsd.toFixed(2)} (${opt.recommendedBidSol.toFixed(2)} SOL)**`,
        inline: true,
      },
      {
        name: '📊 Mercado Físico (PriceCharting)',
        value: `$${opt.physicalMarketUsd.toFixed(2)}`,
        inline: true,
      },
      {
        name: '📈 Margen de Ganancia Estimado',
        value: `**+$${opt.estimatedProfitUsd.toFixed(2)} (${opt.marginPercentage.toFixed(0)}%)**`,
        inline: true,
      },
      {
        name: '🔗 Enlaces',
        value: `[Pujar en Magic Eden](https://magiceden.io/item-details/${opt.mintAddress})`,
        inline: false,
      },
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: 'PokeArbitrage Bot v1.0 • Oportunidad de Puja / Provisión de Liquidez',
    },
  };

  const payload = {
    username: 'PokeArbitrage Bot',
    avatar_url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/6.png', // Charizard
    embeds: [embed],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, 'Error enviando alerta de bid a Discord');
      return null;
    }

    logger.info(
      { card: opt.nftName, profit: `$${opt.estimatedProfitUsd.toFixed(2)}` },
      '✅ Alerta de Discord para nueva carta minteada enviada con éxito'
    );
    return `discord_mint_alert_${Date.now()}`;
  } catch (err) {
    logger.error(err, 'Error de red enviando alerta de bid a Discord');
    return null;
  }
}


