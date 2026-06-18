import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PriceClient } from '../modules/ebay/ebay.client.js';

// Mock de la configuración para TCGAPI.dev
vi.mock('../config/index.js', () => ({
  config: {
    TCGAPI_KEYS: ['test-tcgapi-key-1'],
    EBAY_APP_ID: undefined,
    EBAY_CERT_ID: undefined,
    LOG_LEVEL: 'info',
  },
}));

// Mock del repositorio de base de datos
const mockGetLatestPrice = vi.fn();
const mockInsertPrice = vi.fn();
const mockGetApiCallCountLast24Hours = vi.fn();

vi.mock('../database/repositories/prices.repo.js', () => ({
  getLatestPrice: (...args: any[]) => mockGetLatestPrice(...args),
  insertPrice: (...args: any[]) => mockInsertPrice(...args),
  getApiCallCountLast24Hours: (...args: any[]) => mockGetApiCallCountLast24Hours(...args),
}));

// Mock del scraper de PriceCharting para evitar peticiones curl reales durante los tests
vi.mock('../modules/pricing/pricecharting.scraper.js', () => ({
  getPriceFromPriceCharting: vi.fn().mockResolvedValue(null),
}));

describe('TCGAPI.dev Pricing API Integration (Free)', () => {
  let client: PriceClient;
  let fetchSpy: any;

  beforeEach(() => {
    client = new PriceClient();
    fetchSpy = vi.spyOn(global, 'fetch');
    // Mockear el scraper de eBay para evitar peticiones HTTP reales durante las pruebas unitarias
    vi.spyOn(client as any, 'scrapeEbaySoldListings').mockResolvedValue(null);
    mockGetLatestPrice.mockReset();
    mockInsertPrice.mockReset();
    mockGetApiCallCountLast24Hours.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('debe obtener y mapear correctamente el precio de PSA 10 aplicando multiplicador 2.5x', async () => {
    // Mock de respuesta exitosa de TCGAPI.dev (precio base de $100.00 para la carta raw)
    const mockResponse = {
      data: [{
        name: 'Charizard ex',
        set: 'Obsidian Flames',
        price: 100.00
      }]
    };

    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    mockGetLatestPrice.mockReturnValue(undefined); // Sin caché
    mockGetApiCallCountLast24Hours.mockReturnValue(5); // Dentro del límite de 100

    const result = await client.getReferencePrice(
      'card-123',
      'Charizard ex 11/108 PSA 10',
      'PSA',
      10
    );

    // Verificar que se llamó a la URL correcta del buscador de TCGAPI.dev
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://api.tcgapi.dev/v1/search?q=Charizard%2011%2F108&game=pokemon'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-API-Key': 'test-tcgapi-key-1',
          'accept': 'application/json'
        })
      })
    );

    expect(result).not.toBeNull();
    // Precio base $100.00 * multiplicador PSA 10 (2.5x) = $250.00
    expect(result?.avg_price_usd).toBe(250.00);
    expect(result?.source).toBe('tcgapi_0');
  });

  it('debe obtener y mapear correctamente el precio de PSA 9 aplicando multiplicador 1.3x', async () => {
    const mockResponse = {
      data: [{
        name: 'Charizard ex',
        set: 'Obsidian Flames',
        price: 100.00
      }]
    };

    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    mockGetLatestPrice.mockReturnValue(undefined);
    mockGetApiCallCountLast24Hours.mockReturnValue(5);

    const result = await client.getReferencePrice(
      'card-123',
      'Charizard ex 11/108 PSA 9',
      'PSA',
      9
    );

    expect(result).not.toBeNull();
    // Precio base $100.00 * multiplicador PSA 9 (1.3x) = $130.00
    expect(result?.avg_price_usd).toBe(130.00);
    expect(result?.source).toBe('tcgapi_0');
  });

  it('debe obtener y mapear correctamente el precio de BGS 9.5 aplicando multiplicador 1.8x', async () => {
    const mockResponse = {
      data: [{
        name: 'Charizard',
        set: 'Base Set',
        price: 200.00
      }]
    };

    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    mockGetLatestPrice.mockReturnValue(undefined);
    mockGetApiCallCountLast24Hours.mockReturnValue(5);

    const result = await client.getReferencePrice(
      'card-123',
      'Charizard BGS 9.5',
      'BGS',
      9.5
    );

    expect(result).not.toBeNull();
    // Precio base $200.00 * multiplicador BGS 9.5 (1.8x) = $360.00
    expect(result?.avg_price_usd).toBe(360.00);
    expect(result?.source).toBe('tcgapi_0');
  });

  it('debe devolver null si no encuentra la carta en TCGAPI.dev', async () => {
    const mockResponse = {
      data: []
    };

    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    mockGetLatestPrice.mockReturnValue(undefined);
    mockGetApiCallCountLast24Hours.mockReturnValue(5);

    const result = await client.getReferencePrice(
      'card-123',
      'Charizard PSA 10',
      'PSA',
      10
    );

    expect(result).toBeNull();
  });

  it('debe retornar precio desde caché y NO llamar a la API si el precio tiene menos de 30 días', async () => {
    const freshDate = new Date();
    freshDate.setDate(freshDate.getDate() - 5); // Hace 5 días (menor a 30)

    const cachedPrice = {
      id: 'cache-123',
      card_id: 'card-123',
      avg_price_usd: 500.00,
      median_price_usd: 500.00,
      min_price_usd: 450.00,
      max_price_usd: 550.00,
      sample_count: 1,
      source: 'tcgapi_0',
      fetched_at: freshDate.toISOString(),
    };

    mockGetLatestPrice.mockReturnValue(cachedPrice);

    const result = await client.getOrUpdatePrice(
      'card-123',
      'Charizard Base Set PSA 10',
      'PSA',
      10
    );

    // No debe haber llamadas fetch (llamadas a la API)
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result?.avg_price_usd).toBe(500.00);
    expect(result?.id).toBe('cache-123');
  });

  it('debe llamar a la API si el precio en caché tiene más de 30 días', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 35); // Hace 35 días (mayor a 30)

    const stalePrice = {
      id: 'cache-old',
      card_id: 'card-123',
      avg_price_usd: 500.00,
      median_price_usd: 500.00,
      min_price_usd: 450.00,
      max_price_usd: 550.00,
      sample_count: 1,
      source: 'tcgapi_0',
      fetched_at: oldDate.toISOString(),
    };

    mockGetLatestPrice.mockReturnValue(stalePrice);
    mockGetApiCallCountLast24Hours.mockReturnValue(10); // Menor a 100 calls

    const mockApiResponse = {
      data: [{
        name: 'Charizard',
        set: 'Base Set',
        price: 220.00
      }]
    };

    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });

    const result = await client.getOrUpdatePrice(
      'card-123',
      'Charizard Base Set PSA 10',
      'PSA',
      10
    );

    // Debe haber llamado a la API
    expect(fetchSpy).toHaveBeenCalled();
    expect(result).not.toBeNull();
    // $220.00 * 2.5x = $550.00
    expect(result?.avg_price_usd).toBe(550.00);
    expect(mockInsertPrice).toHaveBeenCalled();
  });

  it('debe bloquear la llamada a la API y retornar el caché si se supera el límite de 100 llamadas', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 35); // Expirado

    const stalePrice = {
      id: 'cache-old',
      card_id: 'card-123',
      avg_price_usd: 500.00,
      median_price_usd: 500.00,
      min_price_usd: 450.00,
      max_price_usd: 550.00,
      sample_count: 1,
      source: 'tcgapi_0',
      fetched_at: oldDate.toISOString(),
    };

    mockGetLatestPrice.mockReturnValue(stalePrice);
    mockGetApiCallCountLast24Hours.mockReturnValue(100); // Límite alcanzado!

    const result = await client.getOrUpdatePrice(
      'card-123',
      'Charizard Base Set PSA 10',
      'PSA',
      10
    );

    // No debe haber llamado a la API
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result?.avg_price_usd).toBe(500.00); // Retorna el precio viejo
  });

  it('debe llamar a la API e ignorar la caché fresca si se especifica forceRefresh = true', async () => {
    const freshDate = new Date();
    freshDate.setDate(freshDate.getDate() - 2); // Solo hace 2 días (caché muy fresca!)

    const cachedPrice = {
      id: 'cache-fresh',
      card_id: 'card-123',
      avg_price_usd: 500.00,
      median_price_usd: 500.00,
      min_price_usd: 450.00,
      max_price_usd: 550.00,
      sample_count: 1,
      source: 'tcgapi_0',
      fetched_at: freshDate.toISOString(),
    };

    mockGetLatestPrice.mockReturnValue(cachedPrice);
    mockGetApiCallCountLast24Hours.mockReturnValue(10); // Menor a 100

    const mockApiResponse = {
      data: [{
        name: 'Charizard',
        set: 'Base Set',
        price: 220.00
      }]
    };

    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });

    const result = await client.getOrUpdatePrice(
      'card-123',
      'Charizard Base Set PSA 10',
      'PSA',
      10,
      true // forceRefresh = true!
    );

    // Debe haber llamado a la API a pesar de tener una caché muy fresca
    expect(fetchSpy).toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result?.avg_price_usd).toBe(550.00); // Retorna el precio de la API fresca ($220.00 * 2.5)
    expect(mockInsertPrice).toHaveBeenCalled();
  });

  it('🐛 REGRESIÓN: debe buscar "Gengar" (no "Gengar 5") en la API al pasar pokemonName pre-parseado', async () => {
    mockGetLatestPrice.mockReturnValue(undefined); // Sin caché
    mockGetApiCallCountLast24Hours.mockReturnValue(5); // Dentro del límite

    const mockResponse = {
      data: [{
        name: 'Gengar',
        price: 30.77
      }]
    };

    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await client.getReferencePrice(
      'card-gengar',
      'Gengar Fossil 5/62 PSA 10',   // ebay_search_query (query original)
      'PSA',
      10,
      'Gengar',                        // pokemon_name (pre-parseado de la DB)
      'Fossil',                        // set_name (pre-parseado de la DB)
      '5/62'                           // card_number (pre-parseado de la DB)
    );

    // Verificar que la URL contiene search=Gengar%205/62
    const fetchCall = fetchSpy.mock.calls[0][0] as string;
    expect(fetchCall).toContain('q=Gengar%205%2F62');
    expect(fetchCall).not.toContain('Gengar%205%205');

    expect(result).not.toBeNull();
    // $30.77 * 2.5 = 76.925
    expect(result?.avg_price_usd).toBeCloseTo(76.925, 2);
  });

  it('debe caer secuencialmente en las etapas 2 y 3 de búsqueda si las anteriores retornan 0 resultados', async () => {
    // Simular fetchSpy retornando vacío para Etapa 1 y Etapa 2, y exitoso para Etapa 3
    fetchSpy
      // Etapa 1
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      })
      // Etapa 2
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      })
      // Etapa 3
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            name: 'Single Strike Urshifu VMAX',
            set: 'Battle Styles',
            price: 50.00
          }]
        }),
      });

    mockGetLatestPrice.mockReturnValue(undefined);
    mockGetApiCallCountLast24Hours.mockReturnValue(5);

    const result = await client.getReferencePrice(
      'card-urshifu',
      'Full Art/Single Strike Urshifu Vmax 086 PSA 10',
      'PSA',
      10,
      'Full Art/Single Strike Urshifu Vmax',
      'Battle Styles',
      '086'
    );

    // Verificar las tres llamadas fetch con sus respectivas URLs
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    
    // Llamada 1: Original
    expect(fetchSpy.mock.calls[0][0]).toContain('q=Full%20Art%2FSingle%20Strike%20Urshifu%20Vmax%20086');
    
    // Llamada 2: Nombre Limpio
    expect(fetchSpy.mock.calls[1][0]).toContain('q=Urshifu%20Vmax%20086');
    
    // Llamada 3: Especie + Número
    expect(fetchSpy.mock.calls[2][0]).toContain('q=Urshifu%20086');

    expect(result).not.toBeNull();
    // $50.00 * 2.5x = $125.00
    expect(result?.avg_price_usd).toBe(125.00);
  });
});
