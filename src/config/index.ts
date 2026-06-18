import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  // Collector Crypt
  COLLECTOR_CRYPT_COLLECTION_SYMBOL: z.string().default('collector_crypt'),
  MAGIC_EDEN_API_BASE: z.string().url().default('https://api-mainnet.magiceden.dev/v2'),
  SOLANA_RPC_URL: z.string().url().optional(),

  // Pricing
  EBAY_APP_ID: z.string().optional(),
  EBAY_CERT_ID: z.string().optional(),
  EBAY_OAUTH_TOKEN: z.string().optional(),
  PRICE_API_KEY: z.string().optional(),
  TCGAPI_KEYS: z.string().optional().transform(val => val ? val.split(',').map(s => s.trim()).filter(Boolean) : []),


  // Discord
  DISCORD_WEBHOOK_URL: z.string().url().optional(),

  // Umbrales de arbitraje
  MIN_PROFIT_PERCENT: z.coerce.number().default(20),
  ESTIMATED_REDEMPTION_FEE_USD: z.coerce.number().default(25),
  ESTIMATED_SHIPPING_FEE_USD: z.coerce.number().default(15),
  EBAY_SELLER_FEE_PERCENT: z.coerce.number().default(13),

  // Polling
  EBAY_POLL_CRON: z.string().default('0 8,20 * * *'),
  CRYPT_POLL_INTERVAL_MS: z.coerce.number().default(30000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = z.infer<typeof envSchema>;
