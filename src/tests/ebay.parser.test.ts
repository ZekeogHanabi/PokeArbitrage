import { describe, it, expect } from 'vitest';
import { parseEbaySoldHtml, parsePriceToUsd } from '../modules/ebay/ebay.parser.js';

describe('ebay.parser.ts', () => {
  describe('parsePriceToUsd', () => {
    it('debe parsear precios simples en USD', () => {
      expect(parsePriceToUsd('$250.00')).toBe(250.00);
      expect(parsePriceToUsd('$1,250.50')).toBe(1250.50);
    });

    it('debe parsear rangos de precios usando el promedio', () => {
      expect(parsePriceToUsd('$200.00 to $300.00')).toBe(250.00);
      expect(parsePriceToUsd('$100 to $150')).toBe(125.00);
    });

    it('debe manejar monedas extranjeras con tasas de cambio aproximadas', () => {
      // EUR a USD (tasa ~1.08)
      expect(parsePriceToUsd('EUR 100.00')).toBeCloseTo(108.00, 2);
      expect(parsePriceToUsd('100,00 €')).toBeCloseTo(108.00, 2);

      // GBP a USD (tasa ~1.27)
      expect(parsePriceToUsd('GBP 100.00')).toBeCloseTo(127.00, 2);
      expect(parsePriceToUsd('£100.00')).toBeCloseTo(127.00, 2);
    });

    it('debe manejar formatos de miles y decimales europeos y norteamericanos', () => {
      expect(parsePriceToUsd('1,234.56')).toBe(1234.56);
      expect(parsePriceToUsd('1.234,56')).toBe(1234.56);
      expect(parsePriceToUsd('1234,56')).toBe(1234.56);
    });
  });

  describe('parseEbaySoldHtml', () => {
    it('debe parsear correctamente items vendidos de un bloque HTML real-like', () => {
      const mockHtml = `
        <html>
          <body>
            <ul>
              <li class="s-item s-item__pl-on-bottom">
                <!-- Este debe ser ignorado por ser pl-on-bottom -->
              </li>
              <li class="s-item s-item--large">
                <div class="s-item__info">
                  <div class="s-item__title">
                    <span role="heading">Charizard Base Set 4/102 PSA 10 Holo Rare 1999</span>
                  </div>
                  <div class="s-item__details">
                    <span class="s-item__price">$5,200.00</span>
                    <span class="s-item__title--tag">Sold May 20, 2026</span>
                  </div>
                </div>
              </li>
              <li class="s-item s-item--large">
                <div class="s-item__info">
                  <div class="s-item__title">
                    <span role="heading">Umbreon Gold Star Celebrations PSA 9</span>
                  </div>
                  <div class="s-item__details">
                    <span class="s-item__price">EUR 180,00</span>
                    <span class="s-item__completed-info">Vendido 18 May 2026</span>
                  </div>
                </div>
              </li>
            </ul>
          </body>
        </html>
      `;

      const results = parseEbaySoldHtml(mockHtml);

      expect(results).toHaveLength(2);
      
      expect(results[0].title).toBe('Charizard Base Set 4/102 PSA 10 Holo Rare 1999');
      expect(results[0].priceUsd).toBe(5200.00);
      expect(results[0].dateSold).toBe('May 20, 2026');

      expect(results[1].title).toBe('Umbreon Gold Star Celebrations PSA 9');
      expect(results[1].priceUsd).toBeCloseTo(194.40, 2); // 180 EUR * 1.08 = 194.4 USD
      expect(results[1].dateSold).toBe('18 May 2026');
    });
  });
});
