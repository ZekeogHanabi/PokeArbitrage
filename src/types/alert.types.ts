/** Resultado del cálculo de arbitraje */
export interface ArbitrageResult {
  isProfitable: boolean;
  cryptPriceUsd: number;
  ebayRefPriceUsd: number;
  estimatedFeesUsd: number;
  estimatedProfitUsd: number;
  profitPercentage: number;
  breakdown: {
    redemptionFee: number;
    shippingFee: number;
    ebaySellerFee: number;
  };
}

/** Alerta enviada */
export interface Alert {
  id: string;
  listing_id: string;
  card_id: string | null;
  nft_name: string;
  crypt_price_usd: number;
  ebay_avg_price_usd: number;
  estimated_fees_usd: number;
  estimated_profit_usd: number;
  profit_percentage: number;
  alert_channel: 'discord' | 'telegram';
  message_id: string | null;
  sent_at: string;
}

/** Oportunidad de arbitraje para enviar como alerta */
export interface ArbitrageOpportunity {
  listing: {
    mintAddress: string;
    nftName: string;
    priceSol: number;
    priceUsd: number;
    listingUrl: string;
    imageUrl: string;
  };
  reference: {
    cardName: string;
    setName: string | null;
    grader: string;
    grade: number;
    ebayAvgPriceUsd: number;
    source: string;
    isStale?: boolean;
    priceChartingUrl?: string;
  };
  arbitrage: ArbitrageResult;
  matchConfidence: number;
}
