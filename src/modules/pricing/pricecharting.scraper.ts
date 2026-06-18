/**
 * Scraper de PriceCharting.com para obtener precios de mercado por grado exacto.
 * Usa curl del sistema (igual que eBay scraper) para evitar bloqueos TLS de Node.js.
 *
 * Flujo de 2 pasos:
 * 1. Búsqueda: GET /search-products?q={query}&type=prices → parsear primer resultado.
 * 2. Detalle: GET /game/{set-slug}/{card-slug} → parsear tabla #full-prices por grado.
 */

import { logger } from '../../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { v4 as uuid } from 'uuid';
import type { EbayPrice } from '../../types/listing.types.js';
import {
  parseSearchResults,
  parseProductPrices,
  findGradedPrice,
  type PriceChartingSearchResult,
} from './pricecharting.parser.js';

const execPromise = promisify(exec);

/** Throttle mínimo entre peticiones a PriceCharting (en ms) */
const THROTTLE_MS = 1500; // 1.5 segundos entre peticiones

/** Timestamp de la última petición realizada */
let lastRequestTimestamp = 0;

/** Cache simple en memoria para evitar curls consecutivos al mismo URL */
let lastUrl = '';
let lastHtml = '';

/**
 * Espera lo necesario para respetar el throttle entre peticiones.
 */
async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTimestamp;
  if (elapsed < THROTTLE_MS) {
    const waitMs = THROTTLE_MS - elapsed;
    logger.debug({ waitMs }, '⏳ Throttle de PriceCharting: esperando...');
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  lastRequestTimestamp = Date.now();
}

/**
 * Realiza una petición HTTP a PriceCharting usando curl del sistema.
 * Usa User-Agent de Chrome para evitar bloqueos básicos de bot detection.
 */
async function fetchHtml(url: string): Promise<string> {
  if (url === lastUrl && lastHtml) {
    logger.debug({ url }, '🎯 Usando HTML cacheado de PriceCharting');
    return lastHtml;
  }

  await throttle();

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  const command = `curl -s -L -A "${userAgent}" "${url}"`;

  logger.debug({ url }, '📡 PriceCharting curl request');

  const { stdout } = await execPromise(command, { maxBuffer: 10 * 1024 * 1024 });
  
  lastUrl = url;
  lastHtml = stdout;
  
  return stdout;
}

/**
 * Normaliza el número de carta para la búsqueda en PriceCharting.
 * Si es puramente numérico (ej: "080", "005"), remueve los ceros a la izquierda.
 * Si es alfanumérico (ej: "TG03", "GG41"), los preserva intactos.
 */
export function normalizeCardNumberForSearch(cardNumber: string | null): string | null {
  if (!cardNumber) return null;
  
  // Tomar numerador en caso de que sea un slash (ej: "GG30/GG70" -> "GG30")
  let num = cardNumber.split('/')[0].trim();
  
  if (/^\d+$/.test(num)) {
    return parseInt(num, 10).toString();
  }
  
  return num;
}

/**
 * Limpia el nombre del set para búsqueda en PriceCharting.
 * Remueve prefijos de bloque como "Sword & Shield" o "Scarlet & Violet".
 */
export function cleanSetNameForSearch(setName: string | null): string | null {
  if (!setName) return null;
  return setName
    .replace(/\b(sword\s*&\s*shield|scarlet\s*&\s*violet)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Busca una carta en PriceCharting y selecciona el mejor resultado usando scoring.
 *
 * @param pokemonName  Nombre del Pokémon (ej: "Mew ex", "Charizard").
 * @param setName      Nombre del set (ej: "Paldean Fates", "Base Set"). Puede ser null.
 * @param cardNumber   Número de carta (ej: "232", "4/102"). Puede ser null.
 * @returns La URL del producto mejor coincidente, o null si no se encontró.
 */
export async function searchPriceCharting(
  pokemonName: string,
  setName: string | null,
  cardNumber: string | null,
  cardDisplayName?: string,
): Promise<PriceChartingSearchResult | null> {
  // Construir query de búsqueda combinando nombre + set (limpio) + número (normalizado)
  const queryParts = [pokemonName];
  
  const cleanedSet = cleanSetNameForSearch(setName);
  if (cleanedSet) queryParts.push(cleanedSet);
  
  const normalizedNum = normalizeCardNumberForSearch(cardNumber);
  if (normalizedNum) queryParts.push(normalizedNum);

  const query = queryParts.join(' ');
  const url = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(query)}&type=prices`;

  logger.info({ query, url }, '🔍 Buscando carta en PriceCharting.com');
  console.log(`📡 [PRICECHARTING] Búsqueda → "${query}"`);

  const html = await fetchHtml(url);
  
  // ─── DETECCIÓN DE REDIRECCIÓN DIRECTA A DETALLE DEL PRODUCTO ───
  if (html.includes('id="full-prices"')) {
    logger.info({ query }, '🎯 PriceCharting: Búsqueda redirigió directamente a la página del producto.');
    
    // Extraer título y set desde el H1
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    let title = pokemonName;
    let resultSetName = setName || '';
    
    if (h1Match) {
      const h1Text = h1Match[1].replace(/<[^>]*>/g, '').trim();
      const parts = h1Text.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
      if (parts[0]) title = parts[0];
      if (parts[1]) resultSetName = parts[1];
    }
    
    // Buscar canonical url en el HTML para tener la URL exacta del producto
    const canonicalMatch = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"[^>]*>/i);
    const productUrl = canonicalMatch ? canonicalMatch[1].trim() : url;
    
    // Extraer precio ungraded rápido
    let ungradedPriceUsd: number | null = null;
    try {
      const parsedPrices = parseProductPrices(html);
      const ungradedMatch = parsedPrices.find(p => p.label.toLowerCase() === 'ungraded');
      if (ungradedMatch) {
        ungradedPriceUsd = ungradedMatch.priceUsd;
      }
    } catch (e) {
      logger.warn('No se pudo parsear precio ungraded de la redirección directa');
    }
    
    return {
      title,
      setName: resultSetName,
      productUrl: url, // Retornamos url para que fetchHtml(searchResult.productUrl) use la caché instantáneamente
      ungradedPriceUsd
    };
  }

  const results = parseSearchResults(html);

  if (results.length === 0) {
    // Intentar búsqueda simplificada (solo nombre del Pokémon + número normalizado) sin el set
    const fallbackQueryParts = [pokemonName];
    if (normalizedNum) fallbackQueryParts.push(normalizedNum);
    const fallbackQuery = fallbackQueryParts.join(' ');
    
    if (setName) {
      const fallbackUrl = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(fallbackQuery)}&type=prices`;
      
      logger.info({ fallbackQuery, fallbackUrl }, '🔄 PriceCharting: 0 resultados. Reintentando con búsqueda simplificada...');
      console.log(`📡 [PRICECHARTING] Búsqueda simplificada → "${fallbackQuery}"`);

      const fallbackHtml = await fetchHtml(fallbackUrl);
      
      // Chequear si el fallback también redirigió directamente
      if (fallbackHtml.includes('id="full-prices"')) {
        logger.info({ fallbackQuery }, '🎯 PriceCharting: Búsqueda simplificada redirigió directamente a la página del producto.');
        const h1Match = fallbackHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        let title = pokemonName;
        let resultSetName = setName || '';
        if (h1Match) {
          const h1Text = h1Match[1].replace(/<[^>]*>/g, '').trim();
          const parts = h1Text.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
          if (parts[0]) title = parts[0];
          if (parts[1]) resultSetName = parts[1];
        }
        let ungradedPriceUsd: number | null = null;
        try {
          const parsedPrices = parseProductPrices(fallbackHtml);
          const ungradedMatch = parsedPrices.find(p => p.label.toLowerCase() === 'ungraded');
          if (ungradedMatch) ungradedPriceUsd = ungradedMatch.priceUsd;
        } catch {}
        
        return {
          title,
          setName: resultSetName,
          productUrl: fallbackUrl,
          ungradedPriceUsd
        };
      }

      const fallbackResults = parseSearchResults(fallbackHtml);
      
      if (fallbackResults.length === 0) {
        logger.warn({ query }, '⚠️ PriceCharting: No se encontraron resultados ni en búsqueda completa ni simplificada.');
        return null;
      }

      return selectBestResult(fallbackResults, pokemonName, setName, normalizedNum, cardDisplayName);
    }

    logger.warn({ query }, '⚠️ PriceCharting: No se encontraron resultados para esta carta.');
    return null;
  }

  return selectBestResult(results, pokemonName, setName, normalizedNum, cardDisplayName);
}

/**
 * Selecciona el mejor resultado de búsqueda usando scoring por similitud.
 */
function selectBestResult(
  results: PriceChartingSearchResult[],
  pokemonName: string,
  setName: string | null,
  cardNumber: string | null,
  cardDisplayName?: string,
): PriceChartingSearchResult {
  const pokemonLower = pokemonName.toLowerCase().trim();
  const setLower = setName?.toLowerCase().trim() ?? '';
  const num = normalizeCardNumberForSearch(cardNumber) ?? '';

  const targetLower = cardDisplayName ? cardDisplayName.toLowerCase() : pokemonLower;
  const isTargetReverseHolo = targetLower.includes('reverse holo') || targetLower.includes('reverse');
  const isTarget1stEdition = targetLower.includes('1st edition') || targetLower.includes('1st');
  const isTargetShadowless = targetLower.includes('shadowless');

  let bestResult = results[0];
  let bestScore = -1;

  for (const result of results) {
    let score = 0;
    const titleLower = result.title.toLowerCase();
    const resultSetLower = result.setName.toLowerCase();

    // 1. Coincidencia de nombre del Pokémon en el título
    const pokemonWords = pokemonLower.split(/\s+/).filter(w => w.length > 1);
    let nameMatches = 0;
    for (const word of pokemonWords) {
      if (titleLower.includes(word)) nameMatches++;
    }
    if (pokemonWords.length > 0) {
      score += (nameMatches / pokemonWords.length) * 20;
    }

    // 2. Coincidencia de número de carta en el título (ej: "#232" o "#4")
    if (num) {
      if (titleLower.includes(`#${num}`)) {
        score += 25; // Mayor peso porque el número es muy específico
      }
    }

    // 3. Coincidencia de nombre del set
    if (setLower) {
      const setWords = setLower.split(/\s+/).filter(w => w.length > 1);
      let setMatches = 0;
      for (const word of setWords) {
        if (resultSetLower.includes(word)) setMatches++;
      }
      if (setWords.length > 0) {
        score += (setMatches / setWords.length) * 15;
      }
    }

    // 4. Scoring de variantes
    // A. Reverse Holo
    const isResultReverseHolo = titleLower.includes('reverse holo') || titleLower.includes('reverse');
    if (isTargetReverseHolo === isResultReverseHolo) {
      score += 15;
    } else {
      score -= 15;
    }

    // B. 1st Edition
    const isResult1stEdition = titleLower.includes('1st edition') || titleLower.includes('1st');
    if (isTarget1stEdition === isResult1stEdition) {
      score += 15;
    } else {
      score -= 15;
    }

    // C. Shadowless
    const isResultShadowless = titleLower.includes('shadowless');
    if (isTargetShadowless === isResultShadowless) {
      score += 15;
    } else {
      score -= 15;
    }

    if (score > bestScore) {
      bestScore = score;
      bestResult = result;
    }
  }

  logger.info(
    { title: bestResult.title, set: bestResult.setName, score: bestScore, url: bestResult.productUrl },
    '🎯 PriceCharting: Mejor resultado seleccionado'
  );

  return bestResult;
}

/**
 * Obtiene el precio de una carta en PriceCharting.com para un grado y certificadora específicos.
 * Implementa el flujo completo de búsqueda + extracción de precio por grado.
 *
 * @param cardId       ID interno de la carta en nuestra DB.
 * @param pokemonName  Nombre del Pokémon (ej: "Mew ex", "Charizard").
 * @param setName      Nombre del set (ej: "Paldean Fates", "Base Set"). Puede ser null.
 * @param cardNumber   Número de carta (ej: "232", "4/102"). Puede ser null.
 * @param grader       Certificadora (PSA, CGC, BGS).
 * @param grade        Grado numérico (10, 9.5, 9, etc.).
 * @returns Un EbayPrice con el precio encontrado, o null si no se encontró.
 */
export async function getPriceFromPriceCharting(
  cardId: string,
  pokemonName: string,
  setName: string | null,
  cardNumber: string | null,
  grader: string,
  grade: number,
  cardDisplayName?: string,
): Promise<EbayPrice | null> {
  try {
    // Paso 1: Buscar la carta
    const searchResult = await searchPriceCharting(pokemonName, setName, cardNumber, cardDisplayName);
    if (!searchResult) {
      return null;
    }

    // Paso 2: Obtener la ficha de producto y extraer precios por grado
    logger.info({ url: searchResult.productUrl }, '📄 Obteniendo ficha de producto de PriceCharting...');
    console.log(`📡 [PRICECHARTING] Detalle → "${searchResult.title}" (${searchResult.setName})`);

    const productHtml = await fetchHtml(searchResult.productUrl);
    const allPrices = parseProductPrices(productHtml);

    if (allPrices.length === 0) {
      logger.warn({ url: searchResult.productUrl }, '⚠️ PriceCharting: No se encontró la sección de precios en la ficha de producto.');
      
      // Fallback: si la búsqueda devolvió un precio "Ungraded", usarlo como estimación cruda
      if (searchResult.ungradedPriceUsd) {
        logger.info({ ungradedPrice: searchResult.ungradedPriceUsd }, '📌 Usando precio "Ungraded" de la búsqueda como fallback.');
        return {
          id: uuid(),
          card_id: cardId,
          avg_price_usd: searchResult.ungradedPriceUsd,
          median_price_usd: searchResult.ungradedPriceUsd,
          min_price_usd: null,
          max_price_usd: null,
          sample_count: 1,
          source: 'pricecharting',
          fetched_at: new Date().toISOString(),
        };
      }
      return null;
    }

    // Paso 3: Buscar el precio exacto para el grado solicitado
    const priceUsd = findGradedPrice(allPrices, grader, grade);

    if (priceUsd === null) {
      // Fallback: si no encontramos el grado exacto, buscar "Ungraded" como mínimo
      const ungradedPrice = findGradedPrice(allPrices, '', 0) ??
                            allPrices.find(p => p.label.toLowerCase() === 'ungraded')?.priceUsd ??
                            null;
      
      if (ungradedPrice) {
        logger.warn(
          { grader, grade, availableGrades: allPrices.map(p => p.label) },
          '⚠️ PriceCharting: Grado exacto no encontrado. Usando precio "Ungraded" como fallback.'
        );
        return {
          id: uuid(),
          card_id: cardId,
          avg_price_usd: ungradedPrice,
          median_price_usd: ungradedPrice,
          min_price_usd: null,
          max_price_usd: null,
          sample_count: 1,
          source: 'pricecharting',
          fetched_at: new Date().toISOString(),
        };
      }

      logger.warn(
        { grader, grade, availableGrades: allPrices.map(p => p.label) },
        '⚠️ PriceCharting: No se encontró ni el grado exacto ni "Ungraded".'
      );
      return null;
    }

    console.log(`✅ [PRICECHARTING] Precio encontrado: "${searchResult.title}" ${grader} ${grade} → $${priceUsd.toFixed(2)}`);

    logger.info(
      {
        card: searchResult.title,
        set: searchResult.setName,
        grader,
        grade,
        priceUsd: `$${priceUsd.toFixed(2)}`,
        allGrades: allPrices.map(p => `${p.label}: $${p.priceUsd.toFixed(2)}`),
      },
      '✅ Precio obtenido exitosamente de PriceCharting.com'
    );

    return {
      id: uuid(),
      card_id: cardId,
      avg_price_usd: priceUsd,
      median_price_usd: priceUsd,
      min_price_usd: null,    // PriceCharting da un precio único por grado
      max_price_usd: null,
      sample_count: 1,
      source: 'pricecharting',
      fetched_at: new Date().toISOString(),
    };
  } catch (err: any) {
    logger.error(err, `Error en scraping de PriceCharting para carta "${pokemonName}"`);
    console.log(`❌ [PRICECHARTING ERROR] ${err.message || err}`);
    return null;
  }
}
