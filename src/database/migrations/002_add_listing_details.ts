import type Database from 'better-sqlite3';
import { logger } from '../../utils/logger.js';

export function migrate(db: Database.Database): void {
  logger.info('Ejecutando migración 002_add_listing_details...');

  try {
    // 1. Agregar columna description a crypt_listings si no existe
    db.exec(`
      ALTER TABLE crypt_listings ADD COLUMN description TEXT;
    `);
    logger.info('  • Columna description agregada con éxito');
  } catch (err: any) {
    if (err.message && err.message.includes('duplicate column name')) {
      logger.info('  • Columna description ya existe, omitiendo');
    } else {
      throw err;
    }
  }

  try {
    // 2. Agregar columna card_number a crypt_listings si no existe
    db.exec(`
      ALTER TABLE crypt_listings ADD COLUMN card_number TEXT;
    `);
    logger.info('  • Columna card_number agregada con éxito');
  } catch (err: any) {
    if (err.message && err.message.includes('duplicate column name')) {
      logger.info('  • Columna card_number ya existe, omitiendo');
    } else {
      throw err;
    }
  }

  try {
    // 3. Agregar columna parallel a crypt_listings si no existe
    db.exec(`
      ALTER TABLE crypt_listings ADD COLUMN parallel TEXT;
    `);
    logger.info('  • Columna parallel agregada con éxito');
  } catch (err: any) {
    if (err.message && err.message.includes('duplicate column name')) {
      logger.info('  • Columna parallel ya existe, omitiendo');
    } else {
      throw err;
    }
  }

  logger.info('✅ Migración 002_add_listing_details completada');
}
