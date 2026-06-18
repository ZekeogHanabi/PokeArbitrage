/**
 * Parser HTML dedicado para PriceCharting.com
 * Extrae resultados de búsqueda y precios por grado de las páginas de producto.
 */

/** Resultado individual de la página de búsqueda */
export interface PriceChartingSearchResult {
  title: string;
  setName: string;
  productUrl: string;
  /** Precio rápido "Ungraded" visible en la tabla de búsqueda */
  ungradedPriceUsd: number | null;
}

/** Precio por grado extraído de la ficha de producto */
export interface PriceChartingGradedPrice {
  label: string;       // Ej: "PSA 10", "CGC 10", "Grade 9", "Ungraded"
  priceUsd: number;
}

/**
 * Parsea el HTML de la página de resultados de búsqueda de PriceCharting.
 * Extrae título, set, URL del producto y precio "Ungraded" de cada resultado.
 *
 * URL fuente: https://www.pricecharting.com/search-products?q={query}&type=prices
 */
export function parseSearchResults(html: string): PriceChartingSearchResult[] {
  if (
    html.includes('returned 0 results') ||
    html.includes('Search Revised') ||
    html.includes('returned 0 result')
  ) {
    return [];
  }

  const results: PriceChartingSearchResult[] = [];

  // Iterar sobre cada fila <tr> dentro de la tabla #games_table
  const rowRegex = /<tr[^>]*id="product-\d+"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    // 1. Extraer título y URL del enlace dentro de <td class="title">
    const titleCellMatch = rowHtml.match(/<td[^>]*class="title"[^>]*>([\s\S]*?)<\/td>/i);
    if (!titleCellMatch) continue;

    const linkMatch = titleCellMatch[1].match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    let productUrl = linkMatch[1].trim();
    const title = linkMatch[2].replace(/<[^>]*>/g, '').trim();

    // Asegurar URL absoluta
    if (productUrl.startsWith('/')) {
      productUrl = `https://www.pricecharting.com${productUrl}`;
    }

    // 2. Extraer nombre del set desde <td class="console ...">
    let setName = '';
    const consoleCellMatch = rowHtml.match(/<td[^>]*class="[^"]*console[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    if (consoleCellMatch) {
      const setLinkMatch = consoleCellMatch[1].match(/<a[^>]*>([\s\S]*?)<\/a>/i);
      if (setLinkMatch) {
        setName = setLinkMatch[1].replace(/<[^>]*>/g, '').trim();
      }
    }

    // 3. Extraer precio "Ungraded" (primera columna de precio: used_price)
    let ungradedPriceUsd: number | null = null;
    const priceCellMatch = rowHtml.match(/<td[^>]*class="[^"]*used_price[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    if (priceCellMatch) {
      const priceSpanMatch = priceCellMatch[1].match(/<span[^>]*class="js-price"[^>]*>([\s\S]*?)<\/span>/i);
      if (priceSpanMatch) {
        ungradedPriceUsd = parsePriceChartingPrice(priceSpanMatch[1]);
      }
    }

    results.push({ title, setName, productUrl, ungradedPriceUsd });
  }

  return results;
}

/**
 * Parsea el HTML de la ficha de producto de PriceCharting.
 * Extrae TODOS los precios por grado de la sección <div id="full-prices">.
 *
 * URL fuente: https://www.pricecharting.com/game/{set-slug}/{card-slug}
 */
export function parseProductPrices(html: string): PriceChartingGradedPrice[] {
  const prices: PriceChartingGradedPrice[] = [];

  // Localizar la sección <div id="full-prices">...</div>
  const fullPricesMatch = html.match(/<div[^>]*id="full-prices"[^>]*>([\s\S]*?)<\/div>/i);
  if (!fullPricesMatch) return prices;

  const fullPricesHtml = fullPricesMatch[1];

  // Iterar sobre cada fila <tr> dentro de la tabla de precios
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(fullPricesHtml)) !== null) {
    const rowHtml = rowMatch[1];

    // Extraer las dos celdas <td>: [0]=label, [1]=precio
    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (cells.length < 2) continue;

    const label = cells[0][1].replace(/<[^>]*>/g, '').trim();
    const priceText = cells[1][1].replace(/<[^>]*>/g, '').trim();

    const priceUsd = parsePriceChartingPrice(priceText);
    if (priceUsd !== null && priceUsd > 0 && label.length > 0) {
      prices.push({ label, priceUsd });
    }
  }

  return prices;
}

/**
 * Busca el precio para un grado y certificadora específicos en la lista parseada.
 * Usa matching inteligente: "PSA 10" matchea "PSA 10", "Grade 9" matchea grade genérico 9, etc.
 *
 * @param prices Lista de precios parseados de la ficha de producto.
 * @param grader La certificadora (PSA, CGC, BGS, SGC, ACE, TAG).
 * @param grade El grado numérico (10, 9.5, 9, etc.).
 * @returns El precio en USD o null si no se encontró.
 */
export function findGradedPrice(
  prices: PriceChartingGradedPrice[],
  grader: string,
  grade: number,
): number | null {
  const graderUpper = grader.toUpperCase();
  const gradeStr = grade.toString();

  // 1. Intentar match exacto: "PSA 10", "CGC 10", "BGS 10", "SGC 10", etc.
  const exactLabel = `${graderUpper} ${gradeStr}`;
  const exactMatch = prices.find(p => p.label.toUpperCase() === exactLabel.toUpperCase());
  if (exactMatch) return exactMatch.priceUsd;

  // 2. Intentar match con variantes especiales (ej: "BGS 10 Black", "CGC 10 Pristine")
  const specialMatch = prices.find(p => p.label.toUpperCase().startsWith(exactLabel.toUpperCase()));
  if (specialMatch) return specialMatch.priceUsd;

  // 3. Fallback a grado genérico: "Grade 10", "Grade 9", "Grade 9.5"
  const genericLabel = `Grade ${gradeStr}`;
  const genericMatch = prices.find(p => p.label.toUpperCase() === genericLabel.toUpperCase());
  if (genericMatch) return genericMatch.priceUsd;

  // 4. Fallback para grado 10: si buscamos PSA 10 y no existe, probar cualquier "X 10" 
  if (grade === 10) {
    const any10 = prices.find(p => {
      const upper = p.label.toUpperCase();
      return upper.endsWith(' 10') && !upper.includes('BLACK') && !upper.includes('PRISTINE');
    });
    if (any10) return any10.priceUsd;
  }

  return null;
}

/**
 * Convierte un string de precio de PriceCharting a número USD.
 * Formato típico: "$1,425.00" o "$844.74"
 */
export function parsePriceChartingPrice(text: string): number | null {
  try {
    const cleaned = text
      .replace(/<[^>]*>/g, '')    // Quitar HTML
      .replace(/\$/g, '')         // Quitar signo de dólar
      .replace(/,/g, '')          // Quitar separadores de miles
      .trim();
    
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}
