import { getSolUsdPrice } from '../utils/sol-price.js';

async function test() {
  try {
    const price = await getSolUsdPrice();
    console.log('--- SOLANA PRICE TEST ---');
    console.log('Fetched SOL Price:', price);
  } catch (err) {
    console.error('Error fetching price:', err);
  }
}

test();
