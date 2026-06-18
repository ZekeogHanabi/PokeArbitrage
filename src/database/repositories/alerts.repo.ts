import { getDb } from '../connection.js';
import type { Alert } from '../../types/alert.types.js';

/** Obtener alertas recientes */
export function getRecentAlerts(limitHours: number = 24): Alert[] {
  const db = getDb();
  const since = new Date(Date.now() - limitHours * 60 * 60 * 1000).toISOString();
  return db.prepare(
    'SELECT * FROM alerts WHERE sent_at > ? ORDER BY sent_at DESC',
  ).all(since) as Alert[];
}

/** Contar alertas enviadas hoy */
export function countTodayAlerts(): number {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const result = db.prepare(
    'SELECT COUNT(*) as count FROM alerts WHERE sent_at >= ?',
  ).get(`${today}T00:00:00`) as { count: number };
  return result.count;
}
