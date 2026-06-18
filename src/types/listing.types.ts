/** Listing crudo de Magic Eden API */
export interface MagicEdenListing {
  pdaAddress: string;
  tokenMint: string;
  seller: string;
  price: number; // SOL
  token: {
    mintAddress: string;
    name: string;
    image: string;
    collection: string;
    collectionName: string;
    externalUrl: string;
    attributes: MagicEdenAttribute[];
    properties: {
      files: Array<{ uri: string; type: string }>;
    };
    listStatus: string;
  };
  listingSource: string;
}

export interface MagicEdenAttribute {
  trait_type: string;
  value: string;
}

/** Listing procesado y almacenado en nuestra DB */
export interface CryptListing {
  id: string;
  mint_address: string;
  nft_name: string;
  card_name: string | null;
  set_name: string | null;
  grader: string | null;
  grade: number | null;
  year: number | null;
  insured_value_usd: number | null;
  matched_card_id: string | null;
  match_confidence: number;
  price_sol: number;
  price_usd: number;
  sol_usd_rate: number;
  marketplace: string;
  listing_url: string;
  seller_address: string;
  detected_at: string;
  status: 'active' | 'sold' | 'cancelled' | 'expired' | 'minted';
  description?: string | null;
  card_number?: string | null;
  parallel?: string | null;
}

/** Precio de referencia de eBay/PriceCharting */
export interface EbayPrice {
  id: string;
  card_id: string;
  avg_price_usd: number;
  median_price_usd: number | null;
  min_price_usd: number | null;
  max_price_usd: number | null;
  sample_count: number;
  source: 'ebay_browse' | 'pricecharting' | 'pokemon_api' | 'manual';
  fetched_at: string;
}

/** Oportunidad de provisión de liquidez (Market Making Bid) */
export interface MarketMakingOpportunity {
  cardId: string;
  nftName: string;
  mintAddress: string;
  grader: string;
  grade: number;
  insuredValueUsd: number;
  officialBuybackUsd: number;
  recommendedBidUsd: number;
  recommendedBidSol: number;
  physicalMarketUsd: number;
  estimatedProfitUsd: number;
  marginPercentage: number;
}

