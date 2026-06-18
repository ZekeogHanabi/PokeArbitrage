import cron from 'node-cron';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { PriceClient } from './ebay.client.js';
import { getActiveCards } from '../../database/repositories/cards.repo.js';
import { getActiveListings } from '../../database/repositories/listings.repo.js';

export class EbayScheduler {
  private client: PriceClient;
  private task: cron.ScheduledTask | null = null;

  constructor() {
    this.client = new PriceClient();
  }

  /**
   * Inicializa y arranca el programador cron para actualizar precios de eBay 2 veces al día.
   */
  start(): void {
    logger.info({ cron: config.EBAY_POLL_CRON }, '📅 Programando actualizador de precios de eBay');
    
    this.task = cron.schedule(config.EBAY_POLL_CRON, async () => {
      logger.info('⏰ Iniciando actualización programada de precios de eBay...');
      try {
        await this.syncAllPrices();
      } catch (err) {
        logger.error(err, 'Error en sincronización programada de precios');
      }
    });

    logger.debug('🚀 Sincronización inicial en boot saltada de forma segura para proteger la cuota de la API.');
  }

  /**
   * Detiene el programador cron.
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      logger.info('Ebay price scheduler detenido');
    }
  }

  /**
   * Sincroniza los precios de las cartas activas en el catálogo que tengan listings detectados en Magic Eden.
   */
  async syncAllPrices(): Promise<void> {
    // 1. Obtener listings activos en Magic Eden y mapear sus matched_card_id
    const activeListings = getActiveListings();
    const activeCardIds = new Set<string>();
    
    for (const listing of activeListings) {
      if (listing.matched_card_id) {
        activeCardIds.add(listing.matched_card_id);
      }
    }

    // 2. Filtrar cartas activas del catálogo que tienen un listing activo
    const allCards = getActiveCards();
    const cardsToSync = allCards.filter(card => activeCardIds.has(card.id));

    if (cardsToSync.length === 0) {
      logger.info('📋 No hay cartas con listings activos de Magic Eden en la base de datos. Saltando sincronización de precios.');
      return;
    }

    logger.info(
      { total: cardsToSync.length, totalCatalog: allCards.length },
      '🔄 Iniciando actualización de precios para cartas con listings activos'
    );

    let successCount = 0;
    let failCount = 0;

    for (const card of cardsToSync) {
      try {
        logger.debug({ card: card.display_name }, 'Sincronizando precio...');
        const price = await this.client.getOrUpdatePrice(
          card.id,
          card.ebay_search_query,
          card.grader,
          card.grade,
          undefined,           // forceRefresh: respetar caché en sync programada
          card.pokemon_name,
          card.set_name,
          card.card_number
        );

        if (price) {
          successCount++;
          logger.info({ card: card.display_name, price: `$${price.avg_price_usd.toFixed(2)}` }, '✅ Precio sincronizado');
        } else {
          failCount++;
        }
        
        // Rate limit manual para no saturar la red (esperar 3 segundos entre peticiones)
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (err) {
        failCount++;
        logger.error(err, `Error sincronizando precio para la carta ${card.display_name}`);
      }
    }

    logger.info(
      { total: cardsToSync.length, exitos: successCount, fallidos: failCount },
      '📊 Sincronización de precios finalizada'
    );
  }
}

