import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { parseEbaySoldHtml } from './ebay.parser.js';
import type { EbayPrice } from '../../types/listing.types.js';
import { extractIdentityFromString } from '../matching/normalizer.js';
import { getLatestPrice, insertPrice, getApiCallCountLast24Hours } from '../../database/repositories/prices.repo.js';
import { getPriceFromPriceCharting } from '../pricing/pricecharting.scraper.js';
import { getCardById } from '../../database/repositories/cards.repo.js';
import { v4 as uuid } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

/**
 * Cliente para interactuar con eBay u otras APIs de precios de referencia.
 * Soporta:
 * 1. Raspado HTML público de eBay Sold (sin API Key, por defecto).
 * 2. API de pokemon-api.com en RapidAPI (si config.PRICE_API_KEY está presente).
 * 3. eBay Browse API oficial (si config.EBAY_APP_ID y otros están configurados).
 */
export class PriceClient {
  private apiCallTimestamps: number[] = [];

  /**
   * Obtiene el precio más reciente de la DB o realiza una llamada API si no existe o ha expirado.
   * Aplica la regla:
   * - Si no está en DB -> Llama a API (si no supera el límite de 100 calls en 24h).
   * - Si está en DB y tiene < 30 días -> Usa caché.
   * - Si tiene >= 7 días -> Usa caché pero lo marca como "stale" (para advertencia).
   * - Si tiene >= 30 días -> Llama a API para actualizar (si no supera el límite).
   *
   * @param pokemonName  Nombre limpio del Pokémon (ej: "Gengar", "Charizard ex"). Pre-parseado desde la DB.
   * @param setName      Nombre del set (ej: "Fossil", "Base Set"). Pre-parseado desde la DB.
   * @param cardNumber   Número de carta (ej: "5/62", "4/102"). Pre-parseado desde la DB.
   */
  async getOrUpdatePrice(
    cardId: string,
    query: string,
    grader: string,
    grade: number,
    forceRefresh?: boolean,
    pokemonName?: string,
    setName?: string | null,
    cardNumber?: string | null,
    cardDisplayName?: string
  ): Promise<EbayPrice | null> {
    if (!cardDisplayName) {
      const cardObj = getCardById(cardId);
      if (cardObj) {
        cardDisplayName = cardObj.display_name;
      }
    }

    const latest = getLatestPrice(cardId);
    
    if (latest && !forceRefresh) {
      const ageMs = Date.now() - new Date(latest.fetched_at).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      
      if (ageDays < 30) {
        logger.debug({ cardId, ageDays: ageDays.toFixed(1) }, '🎯 Usando precio cacheado de la DB');
        return latest;
      }
      
      logger.info({ cardId, ageDays: ageDays.toFixed(1) }, '🔄 El precio cacheado tiene >= 30 días, intentando actualizar con API...');
    } else if (latest && forceRefresh) {
      console.log(`🔍 [BOT] Se detectó un nuevo listing para la carta. Forzando llamado fresco a la API para corroborar precio...`);
      logger.info({ cardId }, '🔍 Se detectó nuevo listing y se forzó refresco. Consultando API para corroborar precio más reciente...');
    } else {
      console.log(`🔍 [BOT] Carta no tiene precio registrado en DB. Consultando API para obtener precio de referencia...`);
      logger.info({ cardId }, '🔍 Carta no tiene precio registrado en DB, intentando obtener con API...');
    }

    // Comprobar si todas nuestras APIs de pago (TCGAPI.dev) están agotadas
    let isTcgApiExhausted = true;
    if (config.TCGAPI_KEYS && config.TCGAPI_KEYS.length > 0) {
      for (let i = 0; i < config.TCGAPI_KEYS.length; i++) {
        const count = getApiCallCountLast24Hours(`tcgapi_${i}`) ?? 0;
        if (count < 100) {
          isTcgApiExhausted = false;
          break;
        }
      }
    }

    if (isTcgApiExhausted) {
      logger.warn('⚠️ Todas las APIs de pago (TCGAPI.dev) han alcanzado sus límites de 100 llamadas diarias.');
      
      // Si tenemos un precio viejo en caché, usarlo como fallback de emergencia
      if (latest) {
        logger.warn('⚠️ Usando precio viejo como fallback de emergencia.');
        return latest;
      }
      
      // Si no hay precio en caché, intentar PriceCharting primero, luego eBay scrape
      try {
        logger.info('📡 APIs agotadas. Intentando PriceCharting.com (gratis, sin límite)...');
        const pcPrice = await getPriceFromPriceCharting(
          cardId,
          pokemonName || query,
          setName ?? null,
          cardNumber ?? null,
          grader,
          grade,
          cardDisplayName
        );
        if (pcPrice) {
          insertPrice(pcPrice);
          return pcPrice;
        }
      } catch (err) {
        logger.error(err, 'Error en PriceCharting.com fallback');
      }

      try {
        logger.info('📡 Cayendo a raspado público de eBay (sin API Key)...');
        const scraped = await this.scrapeEbaySoldListings(cardId, query, grader, grade);
        if (scraped) {
          insertPrice(scraped);
          return scraped;
        }
      } catch (err) {
        logger.error(err, 'Error en fallback de raspado público de eBay');
      }
      
      return null;
    }

    // Realizar llamada a las APIs de precios habilitadas o caída secundaria
    const freshPrice = await this.getReferencePrice(
      cardId,
      query,
      grader,
      grade,
      pokemonName,
      setName,
      cardNumber,
      cardDisplayName
    );
    
    if (freshPrice) {
      insertPrice(freshPrice);
      return freshPrice;
    }

    // Si fallaron las APIs y el scrape, usar caché viejo
    if (latest) {
      logger.warn('⚠️ Fallaron las llamadas frescas a las APIs, usando caché existente.');
      return latest;
    }

    return null;
  }

  /**
   * Obtiene los precios de referencia para una carta usando la mejor estrategia disponible.
   * Cascada de fuentes:
   *   1. PriceCharting.com (PRIMARIA - gratis, precios exactos por grado)
   *   2. eBay Sold Scraping (SECUNDARIA - gratis, raspado público)
   *   3. TCGAPI.dev (TERCIARIA/FALLBACK - limitada a 100 calls/día por key)
   */
  async getReferencePrice(
    cardId: string,
    query: string,
    grader: string,
    grade: number,
    pokemonName?: string,
    setName?: string | null,
    cardNumber?: string | null,
    cardDisplayName?: string
  ): Promise<EbayPrice | null> {
    // 1. Estrategia A (PRIMARIA): PriceCharting.com — precios exactos por grado, sin API key
    try {
      const pcPrice = await getPriceFromPriceCharting(
        cardId,
        pokemonName || query,
        setName ?? null,
        cardNumber ?? null,
        grader,
        grade,
        cardDisplayName
      );
      if (pcPrice) return pcPrice;
      logger.info({ query }, '🔍 PriceCharting.com no encontró la carta. Intentando fallback a eBay scrape...');
    } catch (err: any) {
      console.log(`❌ [PRICECHARTING ERROR] ${err.message || err}`);
      logger.error(err, 'Error consultando PriceCharting.com, intentando fallback...');
    }

    // 2. Estrategia B (SECUNDARIA): Raspado público de sold listings de eBay
    try {
      const scraped = await this.scrapeEbaySoldListings(cardId, query, grader, grade);
      if (scraped) return scraped;
      logger.info({ query }, '🔍 eBay scrape no encontró resultados. Intentando fallback a TCGAPI.dev...');
    } catch (err: any) {
      console.log(`❌ [SCRAPE ERROR] Error en raspado público de eBay: ${err.message || err}`);
      logger.error(err, `Error raspando listings de eBay para query: "${query}"`);
    }

    // 3. Estrategia C (TERCIARIA/FALLBACK): TCGAPI.dev API (Si tiene keys configuradas)
    if (config.TCGAPI_KEYS && config.TCGAPI_KEYS.length > 0) {
      try {
        const res = await this.fetchFromTcgApi(cardId, query, grader, grade, pokemonName, setName, cardNumber);
        if (res) return res;
        logger.info({ query }, '🔍 TCGAPI.dev tampoco encontró la carta.');
      } catch (err: any) {
        console.log(`❌ [API ERROR] Error en TCGAPI.dev: ${err.message || err}`);
        logger.error(err, 'Error consultando TCGAPI.dev (fallback terciario)');
      }
    }

    // 4. eBay Browse API Oficial (rara vez usado, requiere credenciales de desarrollador)
    if (config.EBAY_APP_ID && config.EBAY_CERT_ID) {
      try {
        const res = await this.fetchFromEbayApi(cardId, query, grader, grade);
        if (res) return res;
      } catch (err: any) {
        console.log(`❌ [API ERROR] Error en eBay Browse API: ${err.message || err}`);
        logger.error(err, 'Error consultando eBay Browse API');
      }
    }

    return null;
  }

  /**
   * Obtiene precios desde la API de pokemon-api.com en RapidAPI.
   * Endpoint: GET https://pokemon-tcg-api.p.rapidapi.com/cards?search={pokemon_name}&card_number={number}
   *
   * Usa los campos pre-parseados (pokemonName, setName, cardNumber) cuando estén disponibles
   * para evitar re-parsear el query string y corromper el nombre (ej: "Gengar 5" en vez de "Gengar").
   */
  private async fetchFromPokemonApi(
    cardId: string,
    query: string,
    grader: string,
    grade: number,
    pokemonName?: string,
    setName?: string | null,
    cardNumber?: string | null
  ): Promise<EbayPrice | null> {
    const key = config.PRICE_API_KEY;
    if (!key) throw new Error('PRICE_API_KEY no configurado en config');

    // Límite de tasa por minuto: Máximo 30 llamadas por minuto (60,000 ms) para evitar sobrefacturación
    const now = Date.now();
    this.apiCallTimestamps = this.apiCallTimestamps.filter(t => now - t < 60000);
    
    if (this.apiCallTimestamps.length >= 30) {
      logger.warn({ count: this.apiCallTimestamps.length }, '⚠️ Límite de 30 llamadas API por minuto alcanzado. Esperando un momento para proteger tu cuota...');
      
      const oldest = this.apiCallTimestamps[0];
      const waitMs = 60000 - (now - oldest) + 500; // agregar margen de 500ms
      logger.info({ waitMs }, `⏳ Pausando peticiones durante ${(waitMs / 1000).toFixed(1)} segundos...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      
      const afterWaitNow = Date.now();
      this.apiCallTimestamps = this.apiCallTimestamps.filter(t => afterWaitNow - t < 60000);
    }
    
    this.apiCallTimestamps.push(Date.now());

    // Usar campos pre-parseados si están disponibles; si no, parsear el query como fallback
    // IMPORTANTE: NO re-parsear el query si ya tenemos los campos limpios, porque el parser
    // puede corromper el nombre (ej: "Gengar Fossil 5/62" → pokemonName="Gengar 5" en vez de "Gengar")
    let resolvedPokemonName: string;
    let resolvedCardNumber: string | null;
    let resolvedSetName: string | null;

    if (pokemonName) {
      resolvedPokemonName = pokemonName;
      resolvedCardNumber = cardNumber ?? null;
      resolvedSetName = setName ?? null;
    } else {
      // Fallback: parsear el query solo si no tenemos los campos pre-parseados
      const identity = extractIdentityFromString(query);
      resolvedPokemonName = identity.pokemonName;
      resolvedCardNumber = identity.cardNumber;
      resolvedSetName = identity.setName;
    }
    
    // Construir la URL de búsqueda optimizada usando filtros de número si están disponibles
    let url = `https://pokemon-tcg-api.p.rapidapi.com/cards?search=${encodeURIComponent(resolvedPokemonName)}`;
    if (resolvedCardNumber) {
      const num = resolvedCardNumber.split('/')[0].trim();
      url += `&card_number=${encodeURIComponent(num)}`;
    }
    
    const searchTerms = [resolvedPokemonName, resolvedCardNumber].filter(Boolean).join(' ');
    logger.info({ query, pokemonName: resolvedPokemonName, setName: resolvedSetName, cardNumber: resolvedCardNumber, url }, '🔍 Consultando Pokémon TCG Pricing API');
    console.log(`📡 [API CALL] Pokémon TCG Pricing API → "${resolvedPokemonName}"${resolvedCardNumber ? ` ${resolvedCardNumber}` : ''}${resolvedSetName ? ` (${resolvedSetName})` : ''} ${grader} ${grade}`);

    const res = await fetch(url, {
      headers: {
        'x-rapidapi-key': key,
        'x-rapidapi-host': 'pokemon-tcg-api.p.rapidapi.com',
        'accept': 'application/json'
      }
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Pokémon API retornó código ${res.status}: ${res.statusText} - Detalle: ${errBody}`);
    }

    const data = await res.json() as any;
    
    // Normalizar a una lista de cartas
    let cards: any[] = [];
    if (data && Array.isArray(data.data)) {
      cards = data.data;
    } else if (Array.isArray(data)) {
      cards = data;
    } else if (data && Array.isArray(data.cards)) {
      cards = data.cards;
    } else if (data && Array.isArray(data.results)) {
      cards = data.results;
    } else if (data && typeof data === 'object') {
      if ('prices' in data || 'name' in data) {
        cards = [data];
      }
    }

    if (cards.length === 0) {
      logger.warn({ query, searchTerms }, '⚠️ No se encontraron cartas para esta consulta en la API de Pokémon');
      return null;
    }

    // Buscar precio en la lista de cartas devueltas aplicando scoring suave
    let priceUsd: number | null = null;
    const graderLower = grader.toLowerCase();
    const gradeStr = grade.toString();

    // Función auxiliar para calcular coincidencia de palabras en el set
    const setMatch = (expectedSet: string, apiSet: string): number => {
      const expectedLower = expectedSet.toLowerCase().trim();
      const apiLower = apiSet.toLowerCase().trim();

      // Mapeo especial para el Set Base original
      if (expectedLower === 'base set' && apiLower === 'base') return 1.0;
      if (expectedLower === 'base' && apiLower === 'base set') return 1.0;

      const wordsA = expectedLower.split(/\s+/).filter(Boolean);
      const wordsB = apiLower.split(/\s+/).filter(Boolean);

      // Si uno contiene un número de edición (ej "2" en "Base Set 2") y el otro no, penalizar fuertemente
      const hasNumA = wordsA.some(w => /\d+/.test(w));
      const hasNumB = wordsB.some(w => /\d+/.test(w));
      if (hasNumA !== hasNumB) {
        return 0.05; // Penalización drástica para evitar emparejar "Base Set" con "Base Set 2"
      }

      if (wordsA.length === 0 || wordsB.length === 0) return 0;
      let matches = 0;
      for (const w of wordsA) {
        if (wordsB.includes(w)) matches++;
      }
      return matches / Math.max(wordsA.length, wordsB.length);
    };

    let bestCard = null;
    let bestScore = -1;

    for (const card of cards) {
      let score = 0;

      // 1. Coincidencia de Nombre (e.g. Charizard)
      const cardName = (card.name || '').toLowerCase();
      if (cardName.includes(resolvedPokemonName.toLowerCase())) {
        score += 10;
      }

      // 2. Coincidencia de Número de Carta
      if (resolvedCardNumber && card.card_number !== undefined && card.card_number !== null) {
        const expectedNum = resolvedCardNumber.split('/')[0].trim();
        const apiNum = card.card_number.toString().trim();
        if (apiNum === expectedNum) {
          score += 15;
        }
      }

      // 3. Coincidencia de Set Name
      if (resolvedSetName && card.episode?.name) {
        const setSim = setMatch(resolvedSetName, card.episode.name);
        score += setSim * 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestCard = card;
      }
    }

    if (bestCard) {
      logger.info(
        { card: bestCard.name, episode: bestCard.episode?.name, score: bestScore },
        '🎯 Mejor carta coincidente encontrada en la API'
      );
      
      // 1. Intentar eBay Graded (USD)
      const ebayGraded = bestCard.prices?.ebay?.graded;
      if (ebayGraded && ebayGraded[graderLower]) {
        const p = ebayGraded[graderLower][gradeStr];
        if (typeof p === 'object' && p !== null) {
          if (typeof p.median_price === 'number') priceUsd = p.median_price;
          else if (typeof p.price === 'number') priceUsd = p.price;
          else if (typeof p.avg_price === 'number') priceUsd = p.avg_price;
        } else if (typeof p === 'number') {
          priceUsd = p;
        }
      }

      // 2. Intentar Cardmarket Graded (EUR como fallback)
      if (priceUsd === null) {
        const cardmarketGraded = bestCard.prices?.cardmarket?.graded;
        if (cardmarketGraded && cardmarketGraded[graderLower]) {
          const prefixedKey = `${graderLower}${gradeStr}`.replace('.', ''); // ej "psa10", "cgc95"
          let p = cardmarketGraded[graderLower][prefixedKey];
          if (p === undefined) {
            p = cardmarketGraded[graderLower][gradeStr];
          }

          if (typeof p === 'object' && p !== null) {
            if (typeof p.median_price === 'number') priceUsd = p.median_price;
            else if (typeof p.price === 'number') priceUsd = p.price;
            else if (typeof p.avg_price === 'number') priceUsd = p.avg_price;
          } else if (typeof p === 'number') {
            priceUsd = p;
          }
        }
      }
    }

    if (priceUsd === null || priceUsd <= 0) {
      logger.warn({ query, grade, grader }, '⚠️ El precio esperado de grado no existe en la respuesta de la API de Pokémon');
      return null;
    }

    console.log(`✅ [API RESULT] Precio encontrado para "${query}": $${priceUsd.toFixed(2)}`);

    logger.info(
      {
        query,
        grader,
        grade,
        precioUsd: `$${priceUsd.toFixed(2)}`
      },
      '✅ Precio obtenido exitosamente de Pokémon TCG Pricing API'
    );

    return {
      id: uuid(),
      card_id: cardId,
      avg_price_usd: priceUsd,
      median_price_usd: priceUsd,
      min_price_usd: priceUsd * 0.9, // Variación estimativa
      max_price_usd: priceUsd * 1.1,
      sample_count: 1,
      source: 'pokemon_api',
      fetched_at: new Date().toISOString()
    };
  }

  /**
   * Obtiene precios de la API de eBay oficial
   */
  private async fetchFromEbayApi(
    cardId: string,
    query: string,
    grader: string,
    grade: number
  ): Promise<EbayPrice | null> {
    logger.info({ query, cardId }, 'Obteniendo precios de eBay Browse API');
    // En producción esto obtendría el token OAuth y buscaría items activos/sold
    throw new Error('eBay Browse API no tiene credenciales completas configuradas');
  }

  /**
   * Raspado público de listings vendidos en eBay (Estrategia Resiliente y sin API Keys)
   */
  private async scrapeEbaySoldListings(
    cardId: string,
    query: string,
    grader: string,
    grade: number
  ): Promise<EbayPrice | null> {
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&_ipg=240`;
    logger.info({ query, url }, '🔍 Raspando listings vendidos de eBay');
    console.log(`📡 [SCRAPE CALL] Raspando listings de eBay de forma pública para "${query}"...`);

    // Usar curl del sistema para evadir el fingerprint TLS de Node que causa el 403
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const command = `curl -s -L -A "${userAgent}" "${url}"`;

    const { stdout } = await execPromise(command, { maxBuffer: 10 * 1024 * 1024 }); // 10MB max buffer

    const html = stdout;
    const items = parseEbaySoldHtml(html);

    if (items.length === 0) {
      logger.warn({ query }, '⚠️ No se encontraron listings vendidos para esta consulta en eBay');
      return null;
    }

    // Filtrar items para que tengan nombres coherentes con el grader y grado
    const graderLower = grader.toLowerCase();
    const filteredItems = items.filter(item => {
      const titleLower = item.title.toLowerCase();
      // Asegurarse de que el título mencione la casa certificadora (ej: PSA) y el grado (ej: 10 o 9)
      const hasGrader = titleLower.includes(graderLower);
      const hasGrade = titleLower.includes(` ${grade}`) || titleLower.includes(`:${grade}`) || titleLower.includes(`-${grade}`);
      return hasGrader && hasGrade;
    });

    const activeList = filteredItems.length > 0 ? filteredItems : items;

    // Calcular estadísticas
    const prices = activeList.map(item => item.priceUsd).sort((a, b) => a - b);
    const count = prices.length;
    
    const sum = prices.reduce((acc, p) => acc + p, 0);
    const avg = sum / count;

    // Calcular mediana
    let median = avg;
    if (count > 0) {
      const mid = Math.floor(count / 2);
      median = count % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
    }

    const min = prices[0];
    const max = prices[count - 1];

    console.log(`✅ [SCRAPE RESULT] Precio encontrado para "${query}": promedio $${avg.toFixed(2)} (mediana: $${median.toFixed(2)})`);

    logger.info(
      {
        query,
        muestras: count,
        promedio: `$${avg.toFixed(2)}`,
        mediana: `$${median.toFixed(2)}`,
        rango: `$${min.toFixed(2)} - $${max.toFixed(2)}`
      },
      '✅ Estadísticas de precios de eBay obtenidas con éxito'
    );

    return {
      id: uuid(),
      card_id: cardId,
      avg_price_usd: avg,
      median_price_usd: median,
      min_price_usd: min,
      max_price_usd: max,
      sample_count: count,
      source: 'ebay_browse', // Aunque sea scrape, lo catalogamos en 'ebay_browse'
      fetched_at: new Date().toISOString()
    };
  }

  /**
   * Obtiene precios desde la API de tcgapi.dev con rotación de keys y multiplicadores de grado.
   * Usa los campos pre-parseados para evitar corrupción del nombre del Pokémon.
   */
  private async fetchFromTcgApi(
    cardId: string,
    query: string,
    grader: string,
    grade: number,
    pokemonName?: string,
    setName?: string | null,
    cardNumber?: string | null
  ): Promise<EbayPrice | null> {
    const keys = config.TCGAPI_KEYS;
    if (!keys || keys.length === 0) throw new Error('TCGAPI_KEYS no configurado en config');

    // 1. Encontrar la primera llave disponible que tenga < 100 llamadas en las últimas 24h
    let activeKeyIndex = -1;
    let activeKey = '';
    
    for (let i = 0; i < keys.length; i++) {
      const count = getApiCallCountLast24Hours(`tcgapi_${i}`) ?? 0;
      if (count < 100) {
        activeKeyIndex = i;
        activeKey = keys[i];
        break;
      }
    }
    
    if (activeKeyIndex === -1) {
      throw new Error('Todas las llaves de TCGAPI.dev han alcanzado su límite diario de 100 llamadas');
    }

    // 2. Límite de tasa por minuto: Máximo 30 llamadas por minuto
    const now = Date.now();
    this.apiCallTimestamps = this.apiCallTimestamps.filter(t => now - t < 60000);
    
    if (this.apiCallTimestamps.length >= 30) {
      logger.warn({ count: this.apiCallTimestamps.length }, '⚠️ Límite de 30 llamadas API por minuto alcanzado. Esperando un momento...');
      const oldest = this.apiCallTimestamps[0];
      const waitMs = 60000 - (now - oldest) + 500;
      await new Promise(resolve => setTimeout(resolve, waitMs));
      const afterWaitNow = Date.now();
      this.apiCallTimestamps = this.apiCallTimestamps.filter(t => afterWaitNow - t < 60000);
    }
    
    this.apiCallTimestamps.push(Date.now());

    // 3. Usar campos pre-parseados si están disponibles; si no, parsear el query como fallback
    let resolvedPokemonName: string;
    let resolvedCardNumber: string | null;
    let resolvedSetName: string | null;

    if (pokemonName) {
      resolvedPokemonName = pokemonName;
      resolvedCardNumber = cardNumber ?? null;
      resolvedSetName = setName ?? null;
    } else {
      const identity = extractIdentityFromString(query);
      resolvedPokemonName = identity.pokemonName;
      resolvedCardNumber = identity.cardNumber;
      resolvedSetName = identity.setName;
    }

    const searchTerms = [resolvedPokemonName, resolvedCardNumber].filter(Boolean).join(' ');
    let cards: any[] = [];
    let currentSearchTerms = searchTerms;
    let url = `https://api.tcgapi.dev/v1/search?q=${encodeURIComponent(currentSearchTerms)}&game=pokemon`;

    logger.info({ query, pokemonName: resolvedPokemonName, setName: resolvedSetName, cardNumber: resolvedCardNumber, url, keyIndex: activeKeyIndex }, '🔍 Consultando TCGAPI.dev (Búsqueda Etapa 1)');
    console.log(`📡 [API CALL] TCGAPI.dev (Etapa 1) → "${resolvedPokemonName}"${resolvedCardNumber ? ` ${resolvedCardNumber}` : ''}${resolvedSetName ? ` (${resolvedSetName})` : ''} (Key: ${activeKeyIndex})`);

    let res = await fetch(url, {
      headers: {
        'X-API-Key': activeKey,
        'accept': 'application/json'
      }
    });

    if (res.ok) {
      const data = await res.json() as any;
      cards = data && Array.isArray(data.data) ? data.data : [];
    } else {
      const errBody = await res.text().catch(() => '');
      logger.warn(`TCGAPI.dev retornó código ${res.status} en Etapa 1: ${res.statusText} - Detalle: ${errBody}`);
    }

    // Etapa 2: Nombre Limpio (sin descriptores de Full Art, Single Strike, etc.) si la etapa 1 no dio resultados
    if (cards.length === 0) {
      const stage2Terms = this.cleanToCoreSearchTerms(resolvedPokemonName, resolvedCardNumber);
      if (stage2Terms !== currentSearchTerms) {
        currentSearchTerms = stage2Terms;
        url = `https://api.tcgapi.dev/v1/search?q=${encodeURIComponent(currentSearchTerms)}&game=pokemon`;
        logger.info({ query, searchTerms: currentSearchTerms, url }, '📡 [TCGAPI.dev] 0 resultados. Intentando Búsqueda Etapa 2 (Nombre Limpio)...');
        console.log(`📡 [API CALL] TCGAPI.dev (Etapa 2) → "${currentSearchTerms}" (Key: ${activeKeyIndex})`);

        res = await fetch(url, {
          headers: {
            'X-API-Key': activeKey,
            'accept': 'application/json'
          }
        });

        if (res.ok) {
          const data = await res.json() as any;
          cards = data && Array.isArray(data.data) ? data.data : [];
        }
      }
    }

    // Etapa 3: Especie + Número de carta (Búsqueda ultra-amplia y robusta) si la etapa 2 no dio resultados
    if (cards.length === 0) {
      const stage3Terms = this.extractSpeciesSearchTerms(resolvedPokemonName, resolvedCardNumber);
      if (stage3Terms !== currentSearchTerms) {
        currentSearchTerms = stage3Terms;
        url = `https://api.tcgapi.dev/v1/search?q=${encodeURIComponent(currentSearchTerms)}&game=pokemon`;
        logger.info({ query, searchTerms: currentSearchTerms, url }, '📡 [TCGAPI.dev] 0 resultados. Intentando Búsqueda Etapa 3 (Especie + Número)...');
        console.log(`📡 [API CALL] TCGAPI.dev (Etapa 3) → "${currentSearchTerms}" (Key: ${activeKeyIndex})`);

        res = await fetch(url, {
          headers: {
            'X-API-Key': activeKey,
            'accept': 'application/json'
          }
        });

        if (res.ok) {
          const data = await res.json() as any;
          cards = data && Array.isArray(data.data) ? data.data : [];
        }
      }
    }

    if (cards.length === 0) {
      logger.warn({ query, searchTerms }, '⚠️ No se encontraron cartas en TCGAPI.dev para ninguna de las etapas de consulta');
      return null;
    }

    // 4. Buscar la mejor coincidencia usando los campos pre-parseados
    let bestCard = null;
    let bestScore = -1;

    for (const card of cards) {
      let score = 0;
      const cardName = (card.name || '').toLowerCase();
      
      // Coincidencia de Nombre (tolerante a descriptores de arte/rareza)
      const cleanTargetName = resolvedPokemonName
        .toLowerCase()
        .replace(/\b(full art|alternative art|alt art|secret|rainbow|shiny)\b/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      const wordsTarget = cleanTargetName.split(' ').filter(w => w.length > 2);
      let matchCount = 0;
      for (const w of wordsTarget) {
        if (cardName.includes(w)) matchCount++;
      }

      if (matchCount > 0) {
        score += (matchCount / wordsTarget.length) * 10;
      }

      // Coincidencia de Set Name
      if (resolvedSetName && card.set) {
        const expectedSetLower = resolvedSetName.toLowerCase().trim();
        const apiSetLower = card.set.toLowerCase().trim();
        if (expectedSetLower === apiSetLower || expectedSetLower.includes(apiSetLower) || apiSetLower.includes(expectedSetLower)) {
          score += 5;
        }
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestCard = card;
      }
    }

    if (!bestCard) return null;

    logger.info(
      { card: bestCard.name, set: bestCard.set, score: bestScore },
      '🎯 Mejor carta coincidente encontrada en TCGAPI.dev'
    );

    const rawPrice = bestCard.price;
    if (typeof rawPrice !== 'number' || rawPrice <= 0) {
      logger.warn({ card: bestCard.name }, '⚠️ TCGAPI.dev no retornó un precio válido para esta carta');
      return null;
    }

    // 5. Aplicar multiplicadores de grado conservadores sobre el precio raw de TCGplayer
    let multiplier = 1.0;
    if (grade === 10) multiplier = 2.5;      // PSA 10 / BGS 10
    else if (grade === 9.5) multiplier = 1.8; // BGS 9.5
    else if (grade === 9) multiplier = 1.3;   // PSA 9 / BGS 9

    const priceUsd = rawPrice * multiplier;

    console.log(`✅ [API RESULT] Precio encontrado para "${query}": $${priceUsd.toFixed(2)}`);

    logger.info(
      {
        query,
        grader,
        grade,
        rawPrice: `$${rawPrice.toFixed(2)}`,
        multiplier,
        estimatedPriceUsd: `$${priceUsd.toFixed(2)}`
      },
      '✅ Precio estimado exitosamente de TCGAPI.dev'
    );

    return {
      id: uuid(),
      card_id: cardId,
      avg_price_usd: priceUsd,
      median_price_usd: priceUsd,
      min_price_usd: priceUsd * 0.9,
      max_price_usd: priceUsd * 1.1,
      sample_count: 1,
      source: `tcgapi_${activeKeyIndex}` as any,
      fetched_at: new Date().toISOString()
    };
  }

  /**
   * Elimina descriptores ruidosos de los nombres de pokemon para la búsqueda de TCGAPI
   */
  private cleanToCoreSearchTerms(pokemonName: string, cardNumber: string | null): string {
    let coreName = pokemonName
      .replace(/\b(full art|single strike|rapid strike|secret|shiny|rainbow|alternate art|alt art)\b/gi, '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ') // Reemplazar barras "/" y caracteres especiales por espacios
      .replace(/\s+/g, ' ')
      .trim();

    return [coreName, cardNumber].filter(Boolean).join(' ');
  }

  /**
   * Extrae solo la especie principal (ej: "Urshifu", "Incineroar") + el número de carta
   */
  private extractSpeciesSearchTerms(pokemonName: string, cardNumber: string | null): string {
    let species = pokemonName
      .toLowerCase()
      .replace(/\b(vmax|vstar|v|gx|ex|ex\/gx|mega|tag team|star|gold star|full art|single strike|rapid strike)\b/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const words = species.split(' ').filter(w => w.length > 2);
    const mainSpecies = words.length > 0 ? words[words.length - 1] : pokemonName;
    const formattedSpecies = mainSpecies.charAt(0).toUpperCase() + mainSpecies.slice(1);
    
    return [formattedSpecies, cardNumber].filter(Boolean).join(' ');
  }
}
