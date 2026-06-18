/**
 * Tests unitarios para el parser de PriceCharting.com
 * Usa HTML embebido como fixtures para no depender de la red.
 */
import { describe, it, expect } from 'vitest';
import {
  parseSearchResults,
  parseProductPrices,
  findGradedPrice,
  parsePriceChartingPrice,
} from '../modules/pricing/pricecharting.parser.js';

// ============================================================================
// FIXTURES: HTML simulado basado en la estructura real de PriceCharting.com
// ============================================================================

const SEARCH_HTML = `
<table id="games_table" class='js-addable hoverable-rows sortable'>
  <thead>
    <tr>
      <th>&nbsp;</th>
      <th><span>Title</span></th>
      <th class="console phone-landscape-hidden"><span>Set</span></th>
      <th class="numeric js-loose"><span>Ungraded</span></th>
      <th class="numeric cib_price"><span>Grade 7</span></th>
      <th class="numeric new_price"><span>Grade 8</span></th>
    </tr>
  </thead>
  <tbody>
    <tr id="product-6277151" data-product="6277151">
      <td class="image"><div><a href="https://www.pricecharting.com/game/pokemon-paldean-fates/mew-ex-232" title="6277151"><img class="photo" src="img.jpg" /></a></div></td>
      <td class="title">
        <a href="https://www.pricecharting.com/game/pokemon-paldean-fates/mew-ex-232" title="6277151">
          Mew ex #232</a>
      </td>
      <td class="console phone-landscape-hidden"><a href="/console/pokemon-paldean-fates">Pokemon Paldean Fates</a></td>
      <td class="price numeric used_price"><span class="js-price">$844.74</span></td>
      <td class="price numeric cib_price"><span class="js-price">$699.50</span></td>
      <td class="price numeric new_price"><span class="js-price">$769.99</span></td>
    </tr>
    <tr id="product-630417" data-product="630417">
      <td class="image"><div><a href="https://www.pricecharting.com/game/pokemon-base-set/charizard-4" title="630417"><img class="photo" src="img2.jpg" /></a></div></td>
      <td class="title">
        <a href="https://www.pricecharting.com/game/pokemon-base-set/charizard-4" title="630417">
          Charizard #4</a>
      </td>
      <td class="console phone-landscape-hidden"><a href="/console/pokemon-base-set">Pokemon Base Set</a></td>
      <td class="price numeric used_price"><span class="js-price">$368.38</span></td>
      <td class="price numeric cib_price"><span class="js-price">$710.00</span></td>
      <td class="price numeric new_price"><span class="js-price">$1,061.89</span></td>
    </tr>
    <tr id="product-715593" data-product="715593">
      <td class="image"><div><a href="/game/pokemon-base-set/charizard-1st-edition-4" title="715593"><img class="photo" src="img3.jpg" /></a></div></td>
      <td class="title">
        <a href="/game/pokemon-base-set/charizard-1st-edition-4" title="715593">
          Charizard [1st Edition] #4</a>
      </td>
      <td class="console phone-landscape-hidden"><a href="/console/pokemon-base-set">Pokemon Base Set</a></td>
      <td class="price numeric used_price"><span class="js-price">$8,351.85</span></td>
      <td class="price numeric cib_price"><span class="js-price">$23,380.48</span></td>
      <td class="price numeric new_price"><span class="js-price">$28,640.00</span></td>
    </tr>
  </tbody>
</table>
`;

const PRODUCT_HTML = `
<div id="full-prices">
  <a name="full-prices"></a>
  <h2>Full Price Guide: Mew ex #232 (Pokemon Paldean Fates)</h2>
  <table>
    <tr><td>Ungraded</td><td class="price js-price">$844.74</td></tr>
    <tr><td>Grade 1</td><td class="price js-price">$896.52</td></tr>
    <tr><td>Grade 2</td><td class="price js-price">$233.00</td></tr>
    <tr><td>Grade 3</td><td class="price js-price">$259.00</td></tr>
    <tr><td>Grade 4</td><td class="price js-price">$305.00</td></tr>
    <tr><td>Grade 5</td><td class="price js-price">$368.00</td></tr>
    <tr><td>Grade 6</td><td class="price js-price">$459.94</td></tr>
    <tr><td>Grade 7</td><td class="price js-price">$699.50</td></tr>
    <tr><td>Grade 8</td><td class="price js-price">$769.99</td></tr>
    <tr><td>Grade 9</td><td class="price js-price">$899.50</td></tr>
    <tr><td>Grade 9.5</td><td class="price js-price">$1,425.00</td></tr>
    <tr><td>TAG 10</td><td class="price js-price">$2,672.23</td></tr>
    <tr><td>ACE 10</td><td class="price js-price">$1,448.02</td></tr>
    <tr><td>SGC 10</td><td class="price js-price">$1,600.00</td></tr>
    <tr><td>CGC 10</td><td class="price js-price">$1,481.60</td></tr>
    <tr><td>PSA 10</td><td class="price js-price">$3,339.00</td></tr>
    <tr><td>BGS 10</td><td class="price js-price">$7,802.50</td></tr>
    <tr><td>BGS 10 Black</td><td class="price js-price">$236,441.81</td></tr>
    <tr><td>CGC 10 Pristine</td><td class="price js-price">$2,709.14</td></tr>
  </table>
</div>
`;

const PRODUCT_HTML_NO_PRICES = `
<div id="some-other-section">
  <h2>No prices here</h2>
</div>
`;

// ============================================================================
// TESTS
// ============================================================================

describe('PriceCharting Parser', () => {

  // --------------------------------
  // parseSearchResults
  // --------------------------------
  describe('parseSearchResults', () => {
    it('extrae todos los resultados de la tabla de búsqueda', () => {
      const results = parseSearchResults(SEARCH_HTML);
      expect(results).toHaveLength(3);
    });

    it('extrae título correctamente', () => {
      const results = parseSearchResults(SEARCH_HTML);
      expect(results[0].title).toBe('Mew ex #232');
      expect(results[1].title).toBe('Charizard #4');
      expect(results[2].title).toBe('Charizard [1st Edition] #4');
    });

    it('extrae set name correctamente', () => {
      const results = parseSearchResults(SEARCH_HTML);
      expect(results[0].setName).toBe('Pokemon Paldean Fates');
      expect(results[1].setName).toBe('Pokemon Base Set');
    });

    it('extrae URL del producto como URL absoluta', () => {
      const results = parseSearchResults(SEARCH_HTML);
      expect(results[0].productUrl).toBe('https://www.pricecharting.com/game/pokemon-paldean-fates/mew-ex-232');
      // URLs relativas se convierten a absolutas
      expect(results[2].productUrl).toBe('https://www.pricecharting.com/game/pokemon-base-set/charizard-1st-edition-4');
    });

    it('extrae precio Ungraded correctamente', () => {
      const results = parseSearchResults(SEARCH_HTML);
      expect(results[0].ungradedPriceUsd).toBe(844.74);
      expect(results[1].ungradedPriceUsd).toBe(368.38);
      expect(results[2].ungradedPriceUsd).toBe(8351.85);
    });

    it('devuelve array vacío si no hay tabla de resultados', () => {
      const results = parseSearchResults('<div>No results</div>');
      expect(results).toHaveLength(0);
    });

    it('devuelve array vacío si el HTML contiene "returned 0 results"', () => {
      const results = parseSearchResults('<div>returned 0 results for your query</div>');
      expect(results).toHaveLength(0);
    });

    it('devuelve array vacío si el HTML contiene "Search Revised"', () => {
      const results = parseSearchResults('<div>Search Revised: displaying popular items</div>');
      expect(results).toHaveLength(0);
    });
  });

  // --------------------------------
  // parseProductPrices
  // --------------------------------
  describe('parseProductPrices', () => {
    it('extrae todos los grados de la tabla #full-prices', () => {
      const prices = parseProductPrices(PRODUCT_HTML);
      expect(prices.length).toBeGreaterThanOrEqual(15);
    });

    it('extrae precios correctos para grados específicos', () => {
      const prices = parseProductPrices(PRODUCT_HTML);
      
      const psa10 = prices.find(p => p.label === 'PSA 10');
      expect(psa10).toBeDefined();
      expect(psa10!.priceUsd).toBe(3339.00);

      const cgc10 = prices.find(p => p.label === 'CGC 10');
      expect(cgc10).toBeDefined();
      expect(cgc10!.priceUsd).toBe(1481.60);

      const grade9 = prices.find(p => p.label === 'Grade 9');
      expect(grade9).toBeDefined();
      expect(grade9!.priceUsd).toBe(899.50);

      const ungraded = prices.find(p => p.label === 'Ungraded');
      expect(ungraded).toBeDefined();
      expect(ungraded!.priceUsd).toBe(844.74);
    });

    it('extrae precios altos con comas de miles correctamente', () => {
      const prices = parseProductPrices(PRODUCT_HTML);
      
      const bgs10Black = prices.find(p => p.label === 'BGS 10 Black');
      expect(bgs10Black).toBeDefined();
      expect(bgs10Black!.priceUsd).toBe(236441.81);
    });

    it('devuelve array vacío si no hay sección #full-prices', () => {
      const prices = parseProductPrices(PRODUCT_HTML_NO_PRICES);
      expect(prices).toHaveLength(0);
    });
  });

  // --------------------------------
  // findGradedPrice
  // --------------------------------
  describe('findGradedPrice', () => {
    const prices = parseProductPrices(PRODUCT_HTML);

    it('encuentra precio exacto para PSA 10', () => {
      const price = findGradedPrice(prices, 'PSA', 10);
      expect(price).toBe(3339.00);
    });

    it('encuentra precio exacto para CGC 10', () => {
      const price = findGradedPrice(prices, 'CGC', 10);
      expect(price).toBe(1481.60);
    });

    it('encuentra precio exacto para BGS 10', () => {
      const price = findGradedPrice(prices, 'BGS', 10);
      expect(price).toBe(7802.50);
    });

    it('encuentra precio exacto para SGC 10', () => {
      const price = findGradedPrice(prices, 'SGC', 10);
      expect(price).toBe(1600.00);
    });

    it('encuentra precio para grado genérico (Grade 9)', () => {
      const price = findGradedPrice(prices, 'PSA', 9);
      // No existe "PSA 9" como tal, debería caer al genérico "Grade 9"
      expect(price).toBe(899.50);
    });

    it('encuentra precio para grado genérico (Grade 9.5)', () => {
      const price = findGradedPrice(prices, 'BGS', 9.5);
      // No existe "BGS 9.5", debería caer al genérico "Grade 9.5"
      expect(price).toBe(1425.00);
    });

    it('devuelve null para grado inexistente', () => {
      const price = findGradedPrice(prices, 'XYZ', 99);
      expect(price).toBeNull();
    });

    it('es case-insensitive para el grader', () => {
      const price = findGradedPrice(prices, 'psa', 10);
      expect(price).toBe(3339.00);
    });
  });

  // --------------------------------
  // parsePriceChartingPrice
  // --------------------------------
  describe('parsePriceChartingPrice', () => {
    it('parsea precio simple con $', () => {
      expect(parsePriceChartingPrice('$844.74')).toBe(844.74);
    });

    it('parsea precio con comas de miles', () => {
      expect(parsePriceChartingPrice('$3,339.00')).toBe(3339.00);
    });

    it('parsea precio con múltiples comas de miles', () => {
      expect(parsePriceChartingPrice('$236,441.81')).toBe(236441.81);
    });

    it('parsea precio sin signo $', () => {
      expect(parsePriceChartingPrice('899.50')).toBe(899.50);
    });

    it('devuelve null para texto no numérico', () => {
      expect(parsePriceChartingPrice('N/A')).toBeNull();
    });

    it('devuelve null para string vacío', () => {
      expect(parsePriceChartingPrice('')).toBeNull();
    });
  });
});

import { normalizeCardNumberForSearch, cleanSetNameForSearch } from '../modules/pricing/pricecharting.scraper.js';

describe('PriceCharting Scraper Helpers', () => {
  describe('normalizeCardNumberForSearch', () => {
    it('remueve ceros a la izquierda para números de carta puramente numéricos', () => {
      expect(normalizeCardNumberForSearch('080')).toBe('80');
      expect(normalizeCardNumberForSearch('005')).toBe('5');
      expect(normalizeCardNumberForSearch('102')).toBe('102');
      expect(normalizeCardNumberForSearch('080/165')).toBe('80');
    });

    it('preserva ceros a la izquierda para números de carta alfanuméricos', () => {
      expect(normalizeCardNumberForSearch('TG03')).toBe('TG03');
      expect(normalizeCardNumberForSearch('GG41')).toBe('GG41');
      expect(normalizeCardNumberForSearch('SV91')).toBe('SV91');
      expect(normalizeCardNumberForSearch('GG30/GG70')).toBe('GG30');
    });

    it('devuelve null para null o undefined', () => {
      expect(normalizeCardNumberForSearch(null)).toBeNull();
    });
  });

  describe('cleanSetNameForSearch', () => {
    it('remueve prefijos de bloque comunes como "Sword & Shield" o "Scarlet & Violet"', () => {
      expect(cleanSetNameForSearch('Sword & Shield Chilling Reign')).toBe('Chilling Reign');
      expect(cleanSetNameForSearch('Scarlet & Violet 151')).toBe('151');
      expect(cleanSetNameForSearch('Pokemon Chilling Reign')).toBe('Pokemon Chilling Reign');
    });

    it('devuelve null para null', () => {
      expect(cleanSetNameForSearch(null)).toBeNull();
    });
  });
});

