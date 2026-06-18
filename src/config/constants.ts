// Constantes del sistema PokeArbitrage

/** Precio SOL/USD - se actualiza en runtime via CoinGecko */
export const SOL_PRICE_CACHE_TTL_MS = 60_000; // 1 minuto

/** URLs de APIs de precios */
export const COINGECKO_SOL_PRICE_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';
export const JUPITER_SOL_PRICE_URL =
  'https://price.jup.ag/v6/price?ids=SOL';

/** Magic Eden */
export const ME_LISTINGS_PAGE_SIZE = 20;
export const ME_RATE_LIMIT_MS = 500; // 500ms entre requests

/** Matching */
export const MIN_MATCH_CONFIDENCE = 0.85;
export const EXACT_MATCH_BONUS = 0.15;

/** Alertas */
export const ALERT_DEDUP_WINDOW_HOURS = 24;
export const ALERT_RATE_LIMIT_MS = 60_000; // 1 alerta por minuto mínimo

/** Grades que monitoreamos */
export const TARGET_GRADES = [9, 9.5, 10];
export const TARGET_GRADERS = ['PSA', 'BGS', 'CGC'];
