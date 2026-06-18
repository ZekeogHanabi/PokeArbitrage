import { getDb } from '../../database/connection.js';
import { ALERT_DEDUP_WINDOW_HOURS, ALERT_RATE_LIMIT_MS } from '../../config/constants.js';
import { sendDiscordAlert } from './discord.notifier.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuid } from 'uuid';
import type { ArbitrageOpportunity, Alert } from '../../types/alert.types.js';

let lastAlertTime = 0;

/**
 * Evalúa si debe enviarse una alerta y la envía si procede.
 * - Deduplicación: no repetir alerta para el mismo mint en 24h
 * - Rate limiting: máximo 1 alerta por minuto
 */
export async function processAlert(opportunity: ArbitrageOpportunity): Promise<void> {
  const db = getDb();
  const now = Date.now();

  // Rate limiting
  if (now - lastAlertTime < ALERT_RATE_LIMIT_MS) {
    logger.debug('Rate limit activo, esperando para enviar alerta');
    await new Promise(resolve => setTimeout(resolve, ALERT_RATE_LIMIT_MS - (now - lastAlertTime)));
  }

  // Deduplicación: verificar si ya alertamos sobre este mint recientemente
  const windowStart = new Date(Date.now() - ALERT_DEDUP_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const existing = db.prepare(`
    SELECT id FROM alerts 
    WHERE listing_id IN (
      SELECT id FROM crypt_listings WHERE mint_address = ?
    )
    AND sent_at > ?
  `).get(opportunity.listing.mintAddress, windowStart) as { id: string } | undefined;

  if (existing) {
    logger.debug({ mint: opportunity.listing.mintAddress }, 'Alerta duplicada, saltando');
    return;
  }

  // Enviar alerta
  const messageId = await sendDiscordAlert(opportunity);
  lastAlertTime = Date.now();

  // Obtener el listing_id real y card_id desde la DB a partir del mintAddress
  const listingRow = db.prepare('SELECT id, matched_card_id FROM crypt_listings WHERE mint_address = ?').get(opportunity.listing.mintAddress) as { id: string, matched_card_id: string | null } | undefined;
  
  if (!listingRow) {
    logger.error({ mint: opportunity.listing.mintAddress }, 'No se encontró el listing correspondiente en DB para guardar la alerta');
    return;
  }

  // Guardar en DB
  const alert: Alert = {
    id: uuid(),
    listing_id: listingRow.id,
    card_id: listingRow.matched_card_id,
    nft_name: opportunity.listing.nftName,
    crypt_price_usd: opportunity.arbitrage.cryptPriceUsd,
    ebay_avg_price_usd: opportunity.arbitrage.ebayRefPriceUsd,
    estimated_fees_usd: opportunity.arbitrage.estimatedFeesUsd,
    estimated_profit_usd: opportunity.arbitrage.estimatedProfitUsd,
    profit_percentage: opportunity.arbitrage.profitPercentage,
    alert_channel: 'discord',
    message_id: messageId,
    sent_at: new Date().toISOString(),
  };

  try {
    db.prepare(`
      INSERT INTO alerts (id, listing_id, card_id, nft_name, crypt_price_usd, ebay_avg_price_usd,
        estimated_fees_usd, estimated_profit_usd, profit_percentage, alert_channel, message_id, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      alert.id, alert.listing_id, alert.card_id, alert.nft_name,
      alert.crypt_price_usd, alert.ebay_avg_price_usd, alert.estimated_fees_usd,
      alert.estimated_profit_usd, alert.profit_percentage, alert.alert_channel,
      alert.message_id, alert.sent_at,
    );
    logger.debug({ alertId: alert.id }, 'Alerta guardada en DB');
  } catch (err) {
    logger.error(err, 'Error guardando alerta en DB');
  }
}
