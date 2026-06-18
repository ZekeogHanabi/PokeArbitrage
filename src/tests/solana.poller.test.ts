import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SolanaPoller } from '../modules/collector-crypt/solana.poller.js';

// Mock de la configuración
vi.mock('../config/index.js', () => ({
  config: {
    SOLANA_RPC_URL: 'https://test.solana.rpc.com',
    CRYPT_POLL_INTERVAL_MS: 30000,
    LOG_LEVEL: 'info',
  },
}));

// Mock del repositorio de base de datos
const mockPrepare = vi.fn();
vi.mock('../database/connection.js', () => ({
  getDb: () => ({
    prepare: mockPrepare,
  }),
}));

describe('SolanaPoller', () => {
  let poller: SolanaPoller;
  let fetchSpy: any;

  beforeEach(() => {
    poller = new SolanaPoller();
    fetchSpy = vi.spyOn(global, 'fetch');
    mockPrepare.mockReset();
    mockPrepare.mockReturnValue({
      all: () => [] // Devolver base de datos vacía por defecto
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('debe precargar mints conocidos desde la base de datos', () => {
    mockPrepare.mockReturnValue({
      all: () => [
        { mint_address: 'mint_1' },
        { mint_address: 'mint_2' }
      ]
    });

    // Arrancamos para disparar preload
    poller.start();
    poller.stop();

    expect(mockPrepare).toHaveBeenCalledWith('SELECT mint_address FROM crypt_listings');
    expect((poller as any).knownMints.has('mint_1')).toBe(true);
    expect((poller as any).knownMints.has('mint_2')).toBe(true);
    expect((poller as any).knownMints.has('mint_3')).toBe(false);
  });

  it('debe ignorar mints conocidos y registrar nuevos', async () => {
    mockPrepare.mockReturnValue({
      all: () => [{ mint_address: 'mint_seen' }]
    });

    const mockRpcResponse = {
      result: {
        items: [
          {
            id: 'mint_seen',
            content: {
              metadata: {
                name: 'Seen Card Name',
              }
            }
          },
          {
            id: 'mint_new',
            content: {
              metadata: {
                name: '2023 #031 Mewtwo Vstar CGC 10 Go Japanese Pokemon',
                attributes: [
                  { trait_type: 'Insured Value', value: '120.00' },
                  { trait_type: 'Card Name', value: 'Mewtwo Vstar' },
                  { trait_type: 'Set', value: 'Go' },
                  { trait_type: 'Grading Company', value: 'CGC' },
                  { trait_type: 'GradeNum', value: '10' }
                ]
              }
            },
            ownership: {
              owner: 'owner_wallet'
            }
          }
        ]
      }
    };

    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => mockRpcResponse,
    });

    let callbackCalled = false;
    let callbackData: any = null;

    poller.onMint((listing) => {
      callbackCalled = true;
      callbackData = listing;
    });

    // Simulamos primer run como completo (para que alerte en el run del poll)
    (poller as any).isFirstRun = false;
    (poller as any).preloadMintsFromDb();

    // Ejecutar poll manual
    await (poller as any).poll();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://test.solana.rpc.com',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('getAssetsByCreator')
      })
    );

    expect(callbackCalled).toBe(true);
    expect(callbackData).not.toBeNull();
    expect(callbackData.mint_address).toBe('mint_new');
    expect(callbackData.nft_name).toContain('Mewtwo Vstar');
    expect(callbackData.insured_value_usd).toBe(120.00);
    expect(callbackData.status).toBe('minted');
    expect(callbackData.grader).toBe('CGC');
    expect(callbackData.grade).toBe(10);
  });
});
