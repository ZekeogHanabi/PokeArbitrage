import { describe, it, expect, vi } from 'vitest';
import { calculateArbitrage } from '../modules/arbitrage/calculator.js';

// Hacer mock de config para controlar los fees en los tests
vi.mock('../../config/index.js', () => ({
  config: {
    MIN_PROFIT_PERCENT: 20,
    ESTIMATED_REDEMPTION_FEE_USD: 25,
    ESTIMATED_SHIPPING_FEE_USD: 15,
    EBAY_SELLER_FEE_PERCENT: 13,
  },
}));

describe('calculator.ts', () => {
  it('debe calcular correctamente un escenario de arbitraje rentable', () => {
    // Escenario:
    // Collector Crypt: 1.5 SOL @ $140 SOL/USD = $210 USD
    // eBay precio de referencia: $500 USD
    // Fees estimados:
    //   Redención: $25
    //   Envío: $15
    //   eBay (13%): $65
    //   Total Fees = $105
    // Ganancia = $500 - $210 - $105 = $185
    // % Ganancia = ($185 / $210) * 100 = 88.10% (>= 20%)
    
    const cryptPriceSol = 1.5;
    const solUsdRate = 140;
    const ebayAvgPriceUsd = 500;

    const result = calculateArbitrage(cryptPriceSol, solUsdRate, ebayAvgPriceUsd);

    expect(result.isProfitable).toBe(true);
    expect(result.cryptPriceUsd).toBe(210);
    expect(result.ebayRefPriceUsd).toBe(500);
    expect(result.estimatedFeesUsd).toBe(105);
    expect(result.estimatedProfitUsd).toBe(185);
    expect(result.profitPercentage).toBeCloseTo(88.10, 2);
    expect(result.breakdown.redemptionFee).toBe(25);
    expect(result.breakdown.shippingFee).toBe(15);
    expect(result.breakdown.ebaySellerFee).toBe(65);
  });

  it('debe catalogar como NO rentable un escenario con ganancia menor al umbral mínimo del 20%', () => {
    // Escenario:
    // Collector Crypt: 2.0 SOL @ $140 = $280 USD
    // eBay precio de referencia: $380 USD
    // Fees estimados:
    //   Redención: $25
    //   Envío: $15
    //   eBay (13% de $380): $49.4
    //   Total Fees = $89.4
    // Ganancia = $380 - $280 - $89.4 = $10.6
    // % Ganancia = ($10.6 / $280) * 100 = 3.79% (< 20%)

    const cryptPriceSol = 2.0;
    const solUsdRate = 140;
    const ebayAvgPriceUsd = 380;

    const result = calculateArbitrage(cryptPriceSol, solUsdRate, ebayAvgPriceUsd);

    expect(result.isProfitable).toBe(false);
    expect(result.estimatedProfitUsd).toBeCloseTo(10.6, 2);
    expect(result.profitPercentage).toBeCloseTo(3.79, 2);
  });

  it('debe manejar ganancias negativas cuando el costo supera el valor de eBay', () => {
    const cryptPriceSol = 3.0;
    const solUsdRate = 150; // $450 USD
    const ebayAvgPriceUsd = 400; // $400 USD (ya es menor de por sí)

    const result = calculateArbitrage(cryptPriceSol, solUsdRate, ebayAvgPriceUsd);

    expect(result.isProfitable).toBe(false);
    expect(result.estimatedProfitUsd).toBeLessThan(0);
  });
});
