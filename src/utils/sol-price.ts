import { logger } from './logger.js';
import { SOL_PRICE_CACHE_TTL_MS, COINGECKO_SOL_PRICE_URL, JUPITER_SOL_PRICE_URL } from '../config/constants.js';

let cachedPrice: { usd: number; fetchedAt: number } | null = null;

/**
 * Obtiene el precio actual de SOL en USD.
 * Usa caché en memoria con TTL configurable.
 * Intenta CoinGecko primero, luego Jupiter como fallback.
 */
export async function getSolUsdPrice(): Promise<number> {
  if (cachedPrice && Date.now() - cachedPrice.fetchedAt < SOL_PRICE_CACHE_TTL_MS) {
    return cachedPrice.usd;
  }

  try {
    // Intentar CoinGecko primero
    const res = await fetch(COINGECKO_SOL_PRICE_URL);
    if (res.ok) {
      const data = (await res.json()) as { solana: { usd: number } };
      const price = data.solana.usd;
      if (typeof price === 'number' && price > 0) {
        cachedPrice = { usd: price, fetchedAt: Date.now() };
        logger.debug({ price }, 'Precio SOL/USD actualizado (CoinGecko)');
        return price;
      }
    }
  } catch (e) {
    logger.warn('CoinGecko falló, intentando Jupiter...');
  }

  try {
    // Fallback: Jupiter
    const res = await fetch(JUPITER_SOL_PRICE_URL);
    if (res.ok) {
      const data = (await res.json()) as { data: { SOL: { price: number } } };
      const price = data.data.SOL.price;
      if (typeof price === 'number' && price > 0) {
        cachedPrice = { usd: price, fetchedAt: Date.now() };
        logger.debug({ price }, 'Precio SOL/USD actualizado (Jupiter)');
        return price;
      }
    }
  } catch (e) {
    logger.error('Jupiter también falló');
  }

  // Si hay cache viejo, usarlo
  if (cachedPrice) {
    logger.warn('Usando precio SOL/USD cacheado (expirado)');
    return cachedPrice.usd;
  }

  // Fallback 1: Base de datos local (última tarifa registrada de SOL/USD)
  try {
    const { getDb } = await import('../database/connection.js');
    const db = getDb();
    const row = db.prepare('SELECT sol_usd_rate FROM crypt_listings WHERE sol_usd_rate IS NOT NULL AND sol_usd_rate > 0 ORDER BY detected_at DESC LIMIT 1').get() as { sol_usd_rate: number } | undefined;
    if (row && typeof row.sol_usd_rate === 'number' && row.sol_usd_rate > 0) {
      const price = row.sol_usd_rate;
      logger.warn({ price }, '⚠️ APIs de precio de SOL/USD caídas. Usando el último precio registrado en la base de datos');
      cachedPrice = { usd: price, fetchedAt: Date.now() };
      return price;
    }
  } catch (dbErr) {
    // Silencioso, cae a default
  }

  // Fallback 2: Valor por defecto de emergencia para evitar crash del bot
  const emergencyDefault = 145.0;
  logger.warn({ default: emergencyDefault }, '🚨 CRÍTICO: No se pudo obtener precio SOL/USD de APIs ni de la DB. Usando valor de emergencia por defecto para evitar la caída del sistema.');
  cachedPrice = { usd: emergencyDefault, fetchedAt: Date.now() };
  return emergencyDefault;
}
