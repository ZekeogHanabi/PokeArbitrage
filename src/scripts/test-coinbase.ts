async function testCoinbase() {
  try {
    const res = await fetch('https://api.coinbase.com/v2/prices/SOL-USD/spot');
    if (res.ok) {
      const data = await res.json() as any;
      console.log('Coinbase Raw:', data);
      console.log('SOL Price:', parseFloat(data.data.amount));
    } else {
      console.log('Coinbase failed with status:', res.status);
    }
  } catch (e) {
    console.error('Coinbase error:', e);
  }
}

testCoinbase();
