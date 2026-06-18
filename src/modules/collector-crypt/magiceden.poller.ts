import { config } from '../../config/index.js';
import { ME_LISTINGS_PAGE_SIZE, TARGET_GRADES, TARGET_GRADERS } from '../../config/constants.js';
import { logger } from '../../utils/logger.js';
import { getSolUsdPrice } from '../../utils/sol-price.js';
import type { MagicEdenListing, CryptListing } from '../../types/listing.types.js';
import { v4 as uuid } from 'uuid';

type NewListingCallback = (listing: CryptListing) => void | Promise<void>;

export class MagicEdenPoller {
  private processedSignatures = new Set<string>();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onNewListing: NewListingCallback | null = null;
  private isFirstRun = true;

  constructor() {}

  /** Registrar callback para nuevos listings */
  onListing(callback: NewListingCallback): void {
    this.onNewListing = callback;
  }

  /** Iniciar polling */
  start(): void {
    logger.info(
      { interval: config.CRYPT_POLL_INTERVAL_MS, collection: config.COLLECTOR_CRYPT_COLLECTION_SYMBOL },
      '🔍 Iniciando Magic Eden Poller en tiempo real (vía Activities & Listings API)',
    );

    // 1. Cargar listings activos al arranque para procesar ofertas existentes
    this.fetchActiveListings().catch(err => logger.error(err, 'Error cargando listados activos en boot'));

    // 2. Ejecutar poll en tiempo real inmediatamente
    this.poll().catch(err => logger.error(err, 'Error en poll inicial'));

    // 3. Configurar intervalo
    this.intervalId = setInterval(() => {
      this.poll().catch(err => logger.error(err, 'Error en poll'));
    }, config.CRYPT_POLL_INTERVAL_MS);
  }

  /** Detener polling */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Magic Eden Poller detenido');
    }
  }

  /** Poll la lista de actividades para capturar listados en tiempo real con cero cache latency */
  private async poll(): Promise<void> {
    try {
      const url = `${config.MAGIC_EDEN_API_BASE}/collections/${config.COLLECTOR_CRYPT_COLLECTION_SYMBOL}/activities?offset=0&limit=20`;

      const res = await fetch(url, {
        headers: { accept: 'application/json' },
      });

      if (!res.ok) {
        logger.error({ status: res.status, statusText: res.statusText }, 'Magic Eden Activities API error');
        return;
      }

      const activities = (await res.json()) as any[];
      const listEvents = activities.filter(act => act.type === 'list');

      // 1. Mostrar en consola las actividades de listado vistas en este ciclo
      logger.info(`🔍 [Magic Eden Poller] Sintonizando eventos de listado en tiempo real (Total: ${listEvents.length}):`);

      for (const act of listEvents) {
        const signature = act.signature;
        const mint = act.tokenMint;
        const price = act.price;
        
        if (!signature || !mint) continue;

        // Evitar procesar el mismo evento duplicado
        if (this.processedSignatures.has(signature)) continue;
        this.processedSignatures.add(signature);

        // Fetch de los metadatos completos del token en tiempo real
        let tokenData: any = null;
        try {
          const tokenUrl = `${config.MAGIC_EDEN_API_BASE}/tokens/${mint}`;
          const tokenRes = await fetch(tokenUrl, {
            headers: { accept: 'application/json' }
          });
          if (tokenRes.ok) {
            tokenData = await tokenRes.json();
          }
        } catch (err) {
          logger.error(err, `Error obteniendo metadatos para token ${mint}`);
        }

        const title = tokenData?.name || 'Unknown Card';
        console.log(`   • Vista en tiempo real: "${title}" por ${price} SOL`);

        if (!tokenData) continue;

        // Extraer atributos del NFT
        const attrs = this.parseAttributes(tokenData.attributes || []);
        const gradeNum = attrs.GradeNum ? parseFloat(attrs.GradeNum) : null;
        const grader = attrs['Grading Company'] || null;

        // Filtrar: solo PSA/BGS/CGC grado 9, 9.5 o 10
        if (!grader || !TARGET_GRADERS.includes(grader.toUpperCase())) continue;
        if (gradeNum === null || !TARGET_GRADES.includes(gradeNum)) continue;

        const solPrice = await getSolUsdPrice();

        // Construir listing procesado
        const processed: CryptListing = {
          id: uuid(),
          mint_address: mint,
          nft_name: tokenData.name || 'Unknown',
          card_name: attrs['Card Name'] || null,
          set_name: attrs['Set'] || null,
          grader: grader,
          grade: gradeNum,
          year: attrs['Year'] ? parseInt(attrs['Year']) : null,
          insured_value_usd: attrs['Insured Value'] ? parseFloat(attrs['Insured Value']) : null,
          matched_card_id: null,
          match_confidence: 0,
          price_sol: price,
          price_usd: price * solPrice,
          sol_usd_rate: solPrice,
          marketplace: 'magic_eden',
          listing_url: tokenData.externalUrl || `https://magiceden.io/item-details/${mint}`,
          seller_address: tokenData.owner || act.seller || '',
          detected_at: new Date().toISOString(),
          status: 'active',
          description: attrs['Description'] || null,
          card_number: attrs['Card Number'] || attrs['Number'] || null,
          parallel: attrs['Parallel'] || null,
        };

        if (this.onNewListing) {
          try {
            await this.onNewListing(processed);
          } catch (err) {
            logger.error(err, 'Error procesando listing');
          }
        }
      }

      if (this.isFirstRun) {
        logger.info('📋 Carga inicial de listings completada en base de datos. Procesando nuevos listings.');
        this.isFirstRun = false;
      }
    } catch (err) {
      logger.error(err, 'Error en Magic Eden poll');
    }
  }

  /** Parsea el array de atributos de Magic Eden en un mapa key-value */
  private parseAttributes(attrs: Array<{ trait_type: string; value: string }>): Record<string, string> {
    const map: Record<string, string> = {};
    for (const attr of attrs) {
      map[attr.trait_type] = attr.value;
    }
    return map;
  }

  /** Fetch de listings activos actuales en el arranque */
  private async fetchActiveListings(): Promise<void> {
    try {
      logger.info('📦 [Magic Eden Poller] Cargando listados activos en el mercado...');
      const url = `${config.MAGIC_EDEN_API_BASE}/collections/${config.COLLECTOR_CRYPT_COLLECTION_SYMBOL}/listings?offset=0&limit=20`;
      
      const res = await fetch(url, {
        headers: { accept: 'application/json' },
      });

      if (!res.ok) {
        logger.error({ status: res.status, statusText: res.statusText }, 'Error cargando listados activos desde Magic Eden');
        return;
      }

      const listings = (await res.json()) as MagicEdenListing[];
      logger.info(`📦 [Magic Eden Poller] Se encontraron ${listings.length} listados activos en Magic Eden.`);

      const solPrice = await getSolUsdPrice();

      for (const raw of listings) {
        const mint = raw.tokenMint || raw.token?.mintAddress;
        if (!mint) continue;

        // Extraer atributos del NFT
        const attrs = this.parseAttributes(raw.token?.attributes || []);
        const gradeNum = attrs.GradeNum ? parseFloat(attrs.GradeNum) : null;
        const grader = attrs['Grading Company'] || null;

        // Filtrar: solo PSA/BGS/CGC grado 9, 9.5 o 10
        if (!grader || !TARGET_GRADERS.includes(grader.toUpperCase())) continue;
        if (gradeNum === null || !TARGET_GRADES.includes(gradeNum)) continue;

        // Construir listing procesado
        const processed: CryptListing = {
          id: uuid(),
          mint_address: mint,
          nft_name: raw.token?.name || 'Unknown',
          card_name: attrs['Card Name'] || null,
          set_name: attrs['Set'] || null,
          grader: grader,
          grade: gradeNum,
          year: attrs['Year'] ? parseInt(attrs['Year']) : null,
          insured_value_usd: attrs['Insured Value'] ? parseFloat(attrs['Insured Value']) : null,
          matched_card_id: null,
          match_confidence: 0,
          price_sol: raw.price,
          price_usd: raw.price * solPrice,
          sol_usd_rate: solPrice,
          marketplace: 'magic_eden',
          listing_url: raw.token?.externalUrl || `https://magiceden.io/item-details/${mint}`,
          seller_address: raw.seller || '',
          detected_at: new Date().toISOString(),
          status: 'active',
          description: attrs['Description'] || null,
          card_number: attrs['Card Number'] || attrs['Number'] || null,
          parallel: attrs['Parallel'] || null,
        };

        // Procesar nuevo listing (si no existe en DB, disparará la llamada de API)
        if (this.onNewListing) {
          try {
            await this.onNewListing(processed);
          } catch (err) {
            logger.error(err, 'Error procesando listing activo');
          }
        }
      }
    } catch (err) {
      logger.error(err, 'Error obteniendo listados activos en boot');
    }
  }

  /** Obtener número de firmas procesadas */
  get knownMintsCount(): number {
    return this.processedSignatures.size;
  }
}
