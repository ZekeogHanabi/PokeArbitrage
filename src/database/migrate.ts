import { getDb } from './connection.js';
import { migrate as initial } from './migrations/001_initial.js';
import { migrate as addListingDetails } from './migrations/002_add_listing_details.js';
import { logger } from '../utils/logger.js';

const migrations = [
  { name: '001_initial', run: initial },
  { name: '002_add_listing_details', run: addListingDetails },
];

export function runMigrations(): void {
  const db = getDb();

  // Tabla para trackear migraciones aplicadas
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map((r: any) => r.name)
  );

  for (const migration of migrations) {
    if (!applied.has(migration.name)) {
      migration.run(db);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration.name);
      logger.info(`Migración ${migration.name} aplicada`);
    }
  }
}
