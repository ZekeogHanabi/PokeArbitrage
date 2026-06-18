async function testRaw() {
  try {
    const cgRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    if (cgRes.ok) {
      console.log('CoinGecko Raw:', await cgRes.json());
    } else {
      console.log('CoinGecko failed with status:', cgRes.status);
    }
  } catch (e) {
    console.error('CoinGecko error:', e);
  }

  try {
    const jupRes = await fetch('https://price.jup.ag/v6/price?ids=SOL');
    if (jupRes.ok) {
      console.log('Jupiter Raw:', await jupRes.json());
    } else {
      console.log('Jupiter failed with status:', jupRes.status);
    }
  } catch (e) {
    console.error('Jupiter error:', e);
  }
}

testRaw();
