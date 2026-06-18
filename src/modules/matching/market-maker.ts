import { getDb } from '../../database/connection.js';
import type { MarketMakingOpportunity } from '../../types/listing.types.js';
import { logger } from '../../utils/logger.js';

/**
 * Calcula todas las oportunidades de Market Making (puja estratégica)
 * basándose en la discrepancia entre el Buyback y el precio del mercado físico (eBay/TCGPlayer).
 * 
 * Condición de arbitraje/discrepancia:
 * - El precio físico real P es al menos un 30% superior al buyback B (P >= 1.30 * B).
 * - La brecha de valor es de al menos $25 USD (P - B >= 25).
 * 
 * Puja recomendada (Bid):
 * - Bid = B * 1.05 (un 5% por encima del suelo de recompra oficial).
 * 
 * @param solPriceUsd Precio actual de SOL en USD para la conversión dinámica de la puja.
 * @returns Array de oportunidades ordenadas de mayor a menor beneficio absoluto estimado.
 */
export function calculateMarketMakingOpportunities(solPriceUsd: number): MarketMakingOpportunity[] {
  const db = getDb();
  
  try {
    // Consulta para obtener tokens de crypt_listings con su precio físico más reciente en ebay_prices
    const rows = db.prepare(`
      SELECT 
        l.matched_card_id as cardId,
        l.nft_name as nftName,
        l.mint_address as mintAddress,
        l.grader,
        l.grade,
        l.insured_value_usd as insuredValueUsd,
        p.avg_price_usd as physicalMarketUsd
      FROM crypt_listings l
      JOIN cards c ON l.matched_card_id = c.id
      JOIN ebay_prices p ON c.id = p.card_id
      WHERE l.insured_value_usd IS NOT NULL 
        AND l.insured_value_usd > 0
        AND p.fetched_at = (
          SELECT MAX(fetched_at) 
          FROM ebay_prices 
          WHERE card_id = c.id
        )
    `).all() as Array<{
      cardId: string;
      nftName: string;
      mintAddress: string;
      grader: string;
      grade: number;
      insuredValueUsd: number;
      physicalMarketUsd: number;
    }>;

    const opportunities: MarketMakingOpportunity[] = [];

    for (const row of rows) {
      const insuredValue = row.insuredValueUsd;
      const physicalPrice = row.physicalMarketUsd;

      // 1. Calcular Buyback oficial (85% del Insured Value)
      const officialBuyback = insuredValue * 0.85;

      // 2. Comprobar la condición de discrepancia:
      // - P >= 1.30 * B
      // - P - B >= 25 USD
      const ratioIsGood = physicalPrice >= (officialBuyback * 1.30);
      const spreadIsGood = (physicalPrice - officialBuyback) >= 25.0;

      if (ratioIsGood && spreadIsGood) {
        // 3. Puja recomendada: 5% premium sobre el buyback
        const recommendedBidUsd = officialBuyback * 1.05;
        const recommendedBidSol = recommendedBidUsd / solPriceUsd;

        // 4. Beneficio estimado (P - Bid) y Margen de descuento (%)
        const estimatedProfitUsd = physicalPrice - recommendedBidUsd;
        
        // El porcentaje de margen representa el descuento del Bid frente al precio de mercado físico
        const marginPercentage = physicalPrice > 0 
          ? (estimatedProfitUsd / physicalPrice) * 100 
          : 0;

        opportunities.push({
          cardId: row.cardId,
          nftName: row.nftName,
          mintAddress: row.mintAddress,
          grader: row.grader || 'UNKNOWN',
          grade: row.grade || 0,
          insuredValueUsd: insuredValue,
          officialBuybackUsd: officialBuyback,
          recommendedBidUsd: recommendedBidUsd,
          recommendedBidSol: recommendedBidSol,
          physicalMarketUsd: physicalPrice,
          estimatedProfitUsd: estimatedProfitUsd,
          marginPercentage: marginPercentage,
        });
      }
    }

    // Ordenar de mayor a menor beneficio absoluto estimado (P - Bid)
    return opportunities.sort((a, b) => b.estimatedProfitUsd - a.estimatedProfitUsd);

  } catch (err) {
    logger.error(err, 'Error calculando oportunidades de market making');
    return [];
  }
}
