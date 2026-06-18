import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { getSolUsdPrice } from '../../utils/sol-price.js';
import type { CryptListing } from '../../types/listing.types.js';
import { getDb } from '../../database/connection.js';
import { v4 as uuid } from 'uuid';

type NewMintCallback = (listing: CryptListing) => void | Promise<void>;

export class SolanaPoller {
  private knownMints = new Set<string>();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onNewMint: NewMintCallback | null = null;
  private isFirstRun = true;

  constructor() {}

  /** Registrar callback para nuevas acuñaciones (mints) */
  onMint(callback: NewMintCallback): void {
    this.onNewMint = callback;
  }

  /** Iniciar el poller de Solana */
  start(): void {
    if (!config.SOLANA_RPC_URL) {
      logger.warn('⚠️ SOLANA_RPC_URL no configurada. El monitoreo de nuevas cartas minteadas en Solana está DESHABILITADO.');
      return;
    }

    logger.info(
      { interval: config.CRYPT_POLL_INTERVAL_MS, url: config.SOLANA_RPC_URL },
      '🔍 Iniciando Solana Poller (Acuñaciones en Blockchain)'
    );

    // Cargar mints conocidos de la base de datos al arrancar
    this.preloadMintsFromDb();

    // Ejecutar inmediatamente
    this.poll().catch(err => logger.error(err, 'Error en poll de Solana inicial'));

    // Configurar intervalo
    this.intervalId = setInterval(() => {
      this.poll().catch(err => logger.error(err, 'Error en poll de Solana'));
    }, config.CRYPT_POLL_INTERVAL_MS);
  }

  /** Detener el poller */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Solana Poller detenido');
    }
  }

  /** Cargar direcciones de mint conocidas desde la base de datos local */
  private preloadMintsFromDb(): void {
    try {
      const db = getDb();
      const rows = db.prepare('SELECT mint_address FROM crypt_listings').all() as Array<{ mint_address: string }>;
      for (const row of rows) {
        this.knownMints.add(row.mint_address);
      }
      logger.debug({ count: this.knownMints.size }, '📦 Mints precargados desde la DB');
    } catch (err) {
      logger.error(err, 'Error precargando mints desde la DB');
    }
  }

  /** Poll de la blockchain de Solana usando DAS API */
  private async poll(): Promise<void> {
    if (!config.SOLANA_RPC_URL) return;

    try {
      const res = await fetch(config.SOLANA_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'cc-mints-polling',
          method: 'getAssetsByCreator',
          params: {
            creatorAddress: 'DQPERZ9e86pNJ4mhUnCEP8V75yxZofsipoVrRWT5Wdxd',
            onlyVerified: true,
            page: 1,
            limit: 50,
            sortBy: {
              sortBy: 'created',
              sortDirection: 'desc'
            }
          }
        })
      });

      if (!res.ok) {
        logger.error({ status: res.status, statusText: res.statusText }, 'Error consultando Solana RPC (DAS API)');
        return;
      }

      const responseData = await res.json() as any;
      if (responseData.error) {
        logger.error({ error: responseData.error }, 'Respuesta de error de Solana RPC');
        return;
      }

      const assets = (responseData.result && responseData.result.items) || [];
      const solPrice = await getSolUsdPrice();
      let newCount = 0;

      for (const asset of assets) {
        const mint = asset.id;
        if (!mint) continue;

        // Si ya conocemos este mint, no hacemos nada
        if (this.knownMints.has(mint)) continue;
        this.knownMints.add(mint);

        // Si es la primera ejecución, solo llenamos el conjunto en memoria sin emitir alertas
        if (this.isFirstRun) continue;

        // Extraer atributos y metadatos
        const metadata = asset.content?.metadata;
        const rawAttrs = metadata?.attributes || [];
        const attrs = this.parseAttributes(rawAttrs);

        const gradeNum = attrs.GradeNum ? parseFloat(attrs.GradeNum) : null;
        const grader = attrs['Grading Company'] || null;

        // Crear objeto de listing con estado 'minted'
        const processed: CryptListing = {
          id: uuid(),
          mint_address: mint,
          nft_name: metadata?.name || 'Unknown',
          card_name: attrs['Card Name'] || null,
          set_name: attrs['Set'] || null,
          grader: grader,
          grade: gradeNum,
          year: attrs['Year'] ? parseInt(attrs['Year']) : null,
          insured_value_usd: attrs['Insured Value'] ? parseFloat(attrs['Insured Value']) : null,
          matched_card_id: null,
          match_confidence: 0,
          price_sol: 0, // No está a la venta
          price_usd: 0,
          sol_usd_rate: solPrice,
          marketplace: 'collector_crypt',
          listing_url: `https://magiceden.io/item-details/${mint}`,
          seller_address: asset.ownership?.owner || '',
          detected_at: new Date().toISOString(),
          status: 'minted',
          description: metadata?.description || null,
          card_number: attrs['Card Number'] || attrs['Number'] || null,
          parallel: attrs['Parallel'] || null,
        };

        newCount++;
        logger.info(
          {
            name: processed.nft_name,
            grade: `${processed.grader} ${processed.grade}`,
            insuredValue: processed.insured_value_usd,
            mint,
          },
          '🆕 Nueva carta minteada (acuñada) detectada en Solana'
        );

        if (this.onNewMint) {
          try {
            await this.onNewMint(processed);
          } catch (err) {
            logger.error(err, 'Error procesando nueva carta minteada');
          }
        }
      }

      if (this.isFirstRun) {
        logger.info({ count: this.knownMints.size }, '📋 Mints iniciales de Solana sincronizados');
        this.isFirstRun = false;
      } else if (newCount > 0) {
        logger.info({ newCount }, '📊 Nuevos mints de Solana procesados en este ciclo');
      }

    } catch (err) {
      logger.error(err, 'Error en el ciclo de poll de Solana');
    }
  }

  /** Parsea el array de atributos del DAS API en un mapa key-value */
  private parseAttributes(attrs: Array<{ trait_type: string; value: string }>): Record<string, string> {
    const map: Record<string, string> = {};
    for (const attr of attrs) {
      if (attr.trait_type && attr.value !== undefined) {
        map[attr.trait_type] = String(attr.value);
      }
    }
    return map;
  }
}
