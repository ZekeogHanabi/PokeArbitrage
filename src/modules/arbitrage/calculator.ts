import { config } from '../../config/index.js';
import type { ArbitrageResult } from '../../types/alert.types.js';

/**
 * Calcula si existe una oportunidad de arbitraje rentable.
 *
 * Fórmula:
 * Ganancia = PrecioEbay - PrecioCrypt_USD - FeesRedención - FeesEnvío - (PrecioEbay * FeesEbay%)
 *
 * Es rentable si:
 * - Ganancia > 0
 * - % Ganancia >= MIN_PROFIT_PERCENT (configurable, default 20%)
 */
export function calculateArbitrage(
  cryptPriceSol: number,
  solUsdRate: number,
  ebayAvgPriceUsd: number,
): ArbitrageResult {
  const cryptPriceUsd = cryptPriceSol * solUsdRate;

  const redemptionFee = config.ESTIMATED_REDEMPTION_FEE_USD;
  const shippingFee = config.ESTIMATED_SHIPPING_FEE_USD;
  const ebaySellerFee = ebayAvgPriceUsd * (config.EBAY_SELLER_FEE_PERCENT / 100);

  const totalFees = redemptionFee + shippingFee + ebaySellerFee;
  const profit = ebayAvgPriceUsd - cryptPriceUsd - totalFees;
  const profitPct = cryptPriceUsd > 0 ? (profit / cryptPriceUsd) * 100 : 0;

  return {
    isProfitable: profit > 0 && profitPct >= config.MIN_PROFIT_PERCENT,
    cryptPriceUsd,
    ebayRefPriceUsd: ebayAvgPriceUsd,
    estimatedFeesUsd: totalFees,
    estimatedProfitUsd: profit,
    profitPercentage: profitPct,
    breakdown: {
      redemptionFee,
      shippingFee,
      ebaySellerFee,
    },
  };
}
