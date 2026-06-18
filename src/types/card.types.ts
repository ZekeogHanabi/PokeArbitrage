/** Identidad estructurada extraída de un nombre de carta */
export interface CardIdentity {
  pokemonName: string;
  setName: string | null;
  cardNumber: string | null;
  grader: 'PSA' | 'BGS' | 'CGC' | 'SGC' | string;
  grade: number;
  variant: string | null; // 'Holo', '1st Edition', 'Shadowless', etc.
  year: number | null;
  language: string;
}

/** Carta en el catálogo maestro de la DB */
export interface Card {
  id: string;
  canonical_name: string;
  display_name: string;
  set_name: string | null;
  card_number: string | null;
  pokemon_name: string;
  grader: string;
  grade: number;
  rarity: string | null;
  ebay_search_query: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

/** Resultado de matching entre un NFT y el catálogo */
export interface MatchResult {
  card: Card | null;
  confidence: number;
  matchedFields: string[];
  unmatchedFields: string[];
}
