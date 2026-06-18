import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateMarketMakingOpportunities } from '../modules/matching/market-maker.js';
import { getDb } from '../database/connection.js';

// Hacer mock del archivo de conexión a la base de datos
vi.mock('../database/connection.js', () => {
  const mockAll = vi.fn();
  const mockPrepare = vi.fn().mockReturnValue({
    all: mockAll
  });
  return {
    getDb: vi.fn().mockReturnValue({
      prepare: mockPrepare
    }),
    closeDb: vi.fn(),
  };
});

describe('market-maker.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe calcular y filtrar oportunidades de market making correctamente', () => {
    const dbMock = getDb();
    const prepareMock = dbMock.prepare as any;
    const allMock = prepareMock().all as any;

    // Escenarios simulados de la base de datos:
    // 1. Charizard: Oportunidad de oro (cumple todos los criterios)
    //    Insured Value: 100 USD -> Buyback (B) = 85 USD -> Bid (B * 1.05) = 89.25 USD
    //    Physical Price (P): 150 USD
    //    Criterios: P (150) >= 1.30 * B (110.5) (SI) y P - B (65) >= 25 USD (SI)
    //    Profit: 150 - 89.25 = 60.75 USD. Margen: (60.75 / 150) * 100 = 40.5%
    //
    // 2. Gengar: Criterio Ratio no cumplido
    //    Insured Value: 100 USD -> Buyback (B) = 85 USD
    //    Physical Price (P): 105 USD
    //    Criterios: P (105) >= 1.30 * B (110.5) (NO) -> Filtrado.
    //
    // 3. Mew: Criterio Spread no cumplido
    //    Insured Value: 20 USD -> Buyback (B) = 17 USD
    //    Physical Price (P): 23.5 USD
    //    Criterios: P (23.5) >= 1.30 * B (22.1) (SI) pero P - B (6.5) < 25 USD (NO) -> Filtrado.
    //
    // 4. Umbreon: Segunda oportunidad válida
    //    Insured Value: 200 USD -> Buyback (B) = 170 USD -> Bid (B * 1.05) = 178.50 USD
    //    Physical Price (P): 280 USD
    //    Criterios: P (280) >= 1.30 * B (221) (SI) y P - B (110) >= 25 USD (SI)
    //    Profit: 280 - 178.50 = 101.50 USD. Margen: (101.50 / 280) * 100 = 36.25%

    allMock.mockReturnValue([
      {
        cardId: 'card-charizard',
        nftName: 'Charizard Base Set PSA 10',
        mintAddress: 'mint-charizard-1',
        grader: 'PSA',
        grade: 10,
        insuredValueUsd: 100,
        physicalMarketUsd: 150
      },
      {
        cardId: 'card-gengar',
        nftName: 'Gengar Fossil PSA 10',
        mintAddress: 'mint-gengar-1',
        grader: 'PSA',
        grade: 10,
        insuredValueUsd: 100,
        physicalMarketUsd: 105
      },
      {
        cardId: 'card-mew',
        nftName: 'Mew EX PSA 10',
        mintAddress: 'mint-mew-1',
        grader: 'PSA',
        grade: 10,
        insuredValueUsd: 20,
        physicalMarketUsd: 23.5
      },
      {
        cardId: 'card-umbreon',
        nftName: 'Umbreon Gold Star PSA 10',
        mintAddress: 'mint-umbreon-1',
        grader: 'PSA',
        grade: 10,
        insuredValueUsd: 200,
        physicalMarketUsd: 280
      }
    ]);

    const solPriceUsd = 145; // 1 SOL = $145 USD
    const opportunities = calculateMarketMakingOpportunities(solPriceUsd);

    // Debe filtrar y quedarse solo con 2 oportunidades (Umbreon y Charizard)
    expect(opportunities).toHaveLength(2);

    // Debe ordenar de mayor a menor beneficio absoluto estimado (Umbreon primero con 101.50, luego Charizard con 60.75)
    const umbreonOpt = opportunities[0];
    const charizardOpt = opportunities[1];

    expect(umbreonOpt.cardId).toBe('card-umbreon');
    expect(umbreonOpt.officialBuybackUsd).toBe(170);
    expect(umbreonOpt.recommendedBidUsd).toBe(178.50);
    expect(umbreonOpt.recommendedBidSol).toBeCloseTo(178.50 / 145, 4);
    expect(umbreonOpt.estimatedProfitUsd).toBe(101.50);
    expect(umbreonOpt.marginPercentage).toBeCloseTo((101.50 / 280) * 100, 2);

    expect(charizardOpt.cardId).toBe('card-charizard');
    expect(charizardOpt.officialBuybackUsd).toBe(85);
    expect(charizardOpt.recommendedBidUsd).toBe(89.25);
    expect(charizardOpt.recommendedBidSol).toBeCloseTo(89.25 / 145, 4);
    expect(charizardOpt.estimatedProfitUsd).toBe(60.75);
    expect(charizardOpt.marginPercentage).toBeCloseTo((60.75 / 150) * 100, 2);
  });

  it('debe retornar un array vacío si la consulta a la base de datos falla o da error', () => {
    const dbMock = getDb();
    const prepareMock = dbMock.prepare as any;
    const allMock = prepareMock().all as any;

    allMock.mockImplementation(() => {
      throw new Error('Query syntax error');
    });

    const opportunities = calculateMarketMakingOpportunities(145);
    expect(opportunities).toEqual([]);
  });
});
