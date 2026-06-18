import { getDb } from '../connection.js';
import type { CryptListing } from '../../types/listing.types.js';
import { logger } from '../../utils/logger.js';

/** Insertar o actualizar un listing */
export function upsertListing(listing: CryptListing): void {
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO crypt_listings (
        id, mint_address, nft_name, card_name, set_name, grader, grade, year,
        insured_value_usd, matched_card_id, match_confidence, price_sol, price_usd,
        sol_usd_rate, marketplace, listing_url, seller_address, detected_at, status,
        description, card_number, parallel
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(mint_address) DO UPDATE SET
        price_sol = excluded.price_sol,
        price_usd = excluded.price_usd,
        sol_usd_rate = excluded.sol_usd_rate,
        matched_card_id = excluded.matched_card_id,
        match_confidence = excluded.match_confidence,
        status = excluded.status,
        detected_at = excluded.detected_at,
        description = excluded.description,
        card_number = excluded.card_number,
        parallel = excluded.parallel
    `).run(
      listing.id, listing.mint_address, listing.nft_name, listing.card_name,
      listing.set_name, listing.grader, listing.grade, listing.year,
      listing.insured_value_usd, listing.matched_card_id, listing.match_confidence,
      listing.price_sol, listing.price_usd, listing.sol_usd_rate, listing.marketplace,
      listing.listing_url, listing.seller_address, listing.detected_at, listing.status,
      listing.description || null, listing.card_number || null, listing.parallel || null,
    );
  } catch (err) {
    logger.error(err, 'Error upserting listing');
  }
}

/** Buscar listing por mint address */
export function getListingByMint(mintAddress: string): CryptListing | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM crypt_listings WHERE mint_address = ?').get(mintAddress) as CryptListing | undefined;
}

/** Obtener listings activos */
export function getActiveListings(): CryptListing[] {
  const db = getDb();
  return db.prepare('SELECT * FROM crypt_listings WHERE status = ? ORDER BY detected_at DESC').all('active') as CryptListing[];
}

/** Obtener listings activos para una carta específica */
export function getActiveListingsForCard(cardId: string): CryptListing[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM crypt_listings 
    WHERE matched_card_id = ? 
      AND status = ? 
      AND detected_at >= datetime('now', '-7 days') 
    ORDER BY detected_at DESC
  `).all(cardId, 'active') as CryptListing[];
}


