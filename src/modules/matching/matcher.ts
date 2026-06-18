import { distance } from 'fastest-levenshtein';
import type { Card, CardIdentity, MatchResult } from '../../types/card.types.js';
import { MIN_MATCH_CONFIDENCE, EXACT_MATCH_BONUS } from '../../config/constants.js';
import { cleanString } from '../../utils/string.utils.js';
import { logger } from '../../utils/logger.js';

/**
 * Calcula similitud entre 0 y 1 usando distancia de Levenshtein normalizada
 */
function stringSimilarity(a: string, b: string): number {
  const cleanA = cleanString(a);
  const cleanB = cleanString(b);
  if (cleanA === cleanB) return 1.0;
  if (cleanA.length === 0 || cleanB.length === 0) return 0;
  const maxLen = Math.max(cleanA.length, cleanB.length);
  const dist = distance(cleanA, cleanB);
  return 1 - dist / maxLen;
}

/**
 * Calcula Dice coefficient para similitud basada en bigrams
 */
function diceCoefficient(a: string, b: string): number {
  const cleanA = cleanString(a);
  const cleanB = cleanString(b);
  if (cleanA === cleanB) return 1.0;
  if (cleanA.length < 2 || cleanB.length < 2) return 0;

  const bigramsA = new Set<string>();
  const bigramsB = new Set<string>();

  for (let i = 0; i < cleanA.length - 1; i++) bigramsA.add(cleanA.substring(i, i + 2));
  for (let i = 0; i < cleanB.length - 1; i++) bigramsB.add(cleanB.substring(i, i + 2));

  let intersection = 0;
  for (const bigram of bigramsA) {
    if (bigramsB.has(bigram)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/**
 * Intenta emparejar una identidad de NFT con el catálogo de cartas.
 * Usa filtros duros (grader, grade) + scoring suave (nombre, set).
 */
export function matchCard(identity: CardIdentity, catalog: Card[]): MatchResult {
  let bestMatch: Card | null = null;
  let bestScore = 0;
  let matchedFields: string[] = [];
  let unmatchedFields: string[] = [];

  for (const card of catalog) {
    let score = 0;
    let maxScore = 0;
    const matched: string[] = [];
    const unmatched: string[] = [];

    // --- FILTRO DURO: Grader debe coincidir ---
    if (identity.grader.toUpperCase() !== card.grader.toUpperCase()) {
      continue; // Skip: diferente casa certificadora
    }
    matched.push('grader');

    // --- FILTRO DURO: Grade debe coincidir ---
    if (identity.grade !== card.grade) {
      continue; // Skip: diferente grado
    }
    matched.push('grade');

    // --- Score: Pokemon name (peso alto: 40%) ---
    maxScore += 0.40;
    const nameSim = Math.max(
      stringSimilarity(identity.pokemonName, card.pokemon_name),
      diceCoefficient(identity.pokemonName, card.pokemon_name),
    );
    score += nameSim * 0.40;
    if (nameSim >= 0.8) matched.push('pokemon_name');
    else unmatched.push('pokemon_name');

    // --- Score: Set name (peso medio: 25%) ---
    maxScore += 0.25;
    if (identity.setName && card.set_name) {
      const setSim = Math.max(
        stringSimilarity(identity.setName, card.set_name),
        diceCoefficient(identity.setName, card.set_name),
      );
      score += setSim * 0.25;
      if (setSim >= 0.7) matched.push('set_name');
      else unmatched.push('set_name');
    } else if (!identity.setName && !card.set_name) {
      score += 0.15; // Ambos sin set = parcial
    } else {
      unmatched.push('set_name');
    }

    // --- Score: Card number (peso alto si disponible: 20%) ---
    maxScore += 0.20;
    if (identity.cardNumber && card.card_number) {
      if (identity.cardNumber === card.card_number) {
        score += 0.20;
        matched.push('card_number');
      } else {
        unmatched.push('card_number');
      }
    } else {
      score += 0.05; // No disponible = pequeño crédito
    }

    // --- Score: Year (peso bajo: 10%) ---
    maxScore += 0.10;
    if (identity.year && card.set_name) {
      // Extraer año implícito del nombre del set si no hay campo year en card
      // Por ahora, simple check
      score += 0.05; // Crédito parcial
    }

    // --- Bonus: Exact match en nombre limpio ---
    if (cleanString(identity.pokemonName) === cleanString(card.pokemon_name)) {
      score += EXACT_MATCH_BONUS;
    }

    // Normalizar score
    const finalScore = Math.min(score / maxScore, 1.0);

    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestMatch = card;
      matchedFields = matched;
      unmatchedFields = unmatched;
    }
  }

  const confidence = Math.min(bestScore, 1.0);

  if (bestMatch && confidence >= MIN_MATCH_CONFIDENCE) {
    logger.debug(
      { card: bestMatch.display_name, confidence: confidence.toFixed(3), matchedFields },
      'Match encontrado',
    );
    return { card: bestMatch, confidence, matchedFields, unmatchedFields };
  }

  return { card: null, confidence, matchedFields: [], unmatchedFields: [] };
}
