import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

async function checkQuery(q: string) {
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  const url = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(q)}&type=prices`;
  const command = `curl -s -L -A "${userAgent}" "${url}"`;
  
  try {
    const { stdout } = await execPromise(command, { maxBuffer: 10 * 1024 * 1024 });
    console.log(`\n==================================================`);
    console.log(`Query: "${q}"`);
    console.log(`URL: ${url}`);
    
    // Buscar si hay resultados en la tabla #games_table
    const rowRegex = /<tr[^>]*id="product-\d+"[^>]*>([\s\S]*?)<\/tr>/gi;
    let matchCount = 0;
    let match;
    while ((match = rowRegex.exec(stdout)) !== null) {
      matchCount++;
      const rowHtml = match[1];
      const titleCell = rowHtml.match(/<td[^>]*class="title"[^>]*>([\s\S]*?)<\/td>/i)?.[1] || '';
      const title = titleCell.replace(/<[^>]*>/g, '').trim();
      const consoleCell = rowHtml.match(/<td[^>]*class="[^"]*console[^"]*"[^>]*>([\s\S]*?)<\/td>/i)?.[1] || '';
      const consoleName = consoleCell.replace(/<[^>]*>/g, '').trim();
      console.log(`  - [${matchCount}] Title: "${title}", Set/Console: "${consoleName}"`);
      if (matchCount >= 5) {
        console.log(`  ... and more results`);
        break;
      }
    }
    
    if (matchCount === 0) {
      console.log(`  ❌ No items found in #games_table.`);
      // Ver si hay mensaje de "0 results"
      if (stdout.includes('0 results')) {
        console.log('  ⚠️ HTML contains "0 results" message.');
      } else {
        // Tal vez redirigió directamente a la página del producto!
        console.log('  ❓ Maybe it redirected directly to a product page? Checking URL in HTML/Redirect...');
        // Si hay una tabla de precios (#full-prices) o título h1, es una página de detalle de producto!
        const productTitleMatch = stdout.match(/<h1[^>]*class="subject-header"[^>]*>([\s\S]*?)<\/h1>/i);
        if (productTitleMatch) {
          console.log(`  🚀 YES! Redirected directly to product page: "${productTitleMatch[1].replace(/<[^>]*>/g, '').trim()}"`);
        }
      }
    }
  } catch (err: any) {
    console.error(`Error checking query: ${err.message}`);
  }
}

async function main() {
  await checkQuery('Galarian Zapdos Sword & Shield Chilling Reign 80');
  await checkQuery('Galarian Zapdos Chilling Reign 80');
  await checkQuery('Galarian Zapdos 80');
  await checkQuery('Galarian Zapdos V 80');
}

main();
