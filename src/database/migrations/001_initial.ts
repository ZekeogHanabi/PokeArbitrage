import type Database from 'better-sqlite3';
import { logger } from '../../utils/logger.js';

export function migrate(db: Database.Database): void {
  logger.info('Ejecutando migración 001_initial...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      canonical_name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      set_name TEXT,
      card_number TEXT,
      pokemon_name TEXT NOT NULL,
      grader TEXT NOT NULL,
      grade REAL NOT NULL,
      rarity TEXT,
      ebay_search_query TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ebay_prices (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      avg_price_usd REAL NOT NULL,
      median_price_usd REAL,
      min_price_usd REAL,
      max_price_usd REAL,
      sample_count INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS crypt_listings (
      id TEXT PRIMARY KEY,
      mint_address TEXT UNIQUE NOT NULL,
      nft_name TEXT NOT NULL,
      card_name TEXT,
      set_name TEXT,
      grader TEXT,
      grade REAL,
      year INTEGER,
      insured_value_usd REAL,
      matched_card_id TEXT REFERENCES cards(id) ON DELETE SET NULL,
      match_confidence REAL NOT NULL DEFAULT 0,
      price_sol REAL NOT NULL,
      price_usd REAL NOT NULL,
      sol_usd_rate REAL NOT NULL,
      marketplace TEXT NOT NULL DEFAULT 'magic_eden',
      listing_url TEXT NOT NULL,
      seller_address TEXT NOT NULL,
      detected_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'active',
      description TEXT,
      card_number TEXT,
      parallel TEXT
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL REFERENCES crypt_listings(id) ON DELETE CASCADE,
      card_id TEXT REFERENCES cards(id) ON DELETE SET NULL,
      nft_name TEXT NOT NULL,
      crypt_price_usd REAL NOT NULL,
      ebay_avg_price_usd REAL NOT NULL,
      estimated_fees_usd REAL NOT NULL,
      estimated_profit_usd REAL NOT NULL,
      profit_percentage REAL NOT NULL,
      alert_channel TEXT NOT NULL DEFAULT 'discord',
      message_id TEXT,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Índices para consultas frecuentes
    CREATE INDEX IF NOT EXISTS idx_ebay_prices_card_date
      ON ebay_prices(card_id, fetched_at DESC);
    CREATE INDEX IF NOT EXISTS idx_crypt_listings_status
      ON crypt_listings(status, detected_at DESC);
    CREATE INDEX IF NOT EXISTS idx_crypt_listings_mint
      ON crypt_listings(mint_address);
    CREATE INDEX IF NOT EXISTS idx_crypt_listings_grade
      ON crypt_listings(grader, grade);
    CREATE INDEX IF NOT EXISTS idx_alerts_listing
      ON alerts(listing_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_canonical
      ON cards(canonical_name);
  `);

  logger.info('✅ Migración 001_initial completada');
}
