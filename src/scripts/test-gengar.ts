import { PriceClient } from '../modules/ebay/ebay.client.js';

async function testGengar() {
  const client = new PriceClient();
  try {
    const result = await client.getReferencePrice(
      'test-id',
      'Gengar Fossil 5/62 PSA 10',
      'PSA',
      10
    );
    console.log('Result:', result);
  } catch (err: any) {
    console.error('Error stack:', err.stack || err);
  }
}

testGengar();
