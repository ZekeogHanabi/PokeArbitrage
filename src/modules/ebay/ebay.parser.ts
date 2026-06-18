/**
 * Parseador de HTML de eBay para extraer listings vendidos
 */
import { logger } from '../../utils/logger.js';

export interface ScrapedEbayItem {
  title: string;
  priceUsd: number;
  dateSold: string | null;
}

export function parseEbaySoldHtml(html: string): ScrapedEbayItem[] {
  const items: ScrapedEbayItem[] = [];
  
  // Buscar bloques de item. En eBay, cada item de búsqueda está en una etiqueta <li> con clase "s-item"
  // Usamos una regex para encontrar todos los bloques de items en el HTML
  const itemRegex = /<li[^>]*class="[^"]*s-item[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
  let match;
  
  while ((match = itemRegex.exec(html)) !== null) {
    const itemHtml = match[1];
    
    // Ignorar el item "s-item__pl-on-bottom" o items vacíos / placeholders de eBay
    if (itemHtml.includes('s-item__pl-on-bottom') || itemHtml.includes('s-item__help-icon')) {
      continue;
    }
    
    // 1. Extraer título
    // El título suele estar en <div class="s-item__title">...</div> o <span role="heading">...</span>
    const titleMatch = itemHtml.match(/<div[^>]*class="[^"]*s-item__title[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                       itemHtml.match(/<span[^>]*role="heading"[^>]*>([\s\S]*?)<\/span>/i);
    if (!titleMatch) continue;
    
    // Limpiar tags HTML del título (ej: <span>, <span class="LIGHT_HIGHLIGHT">, etc.)
    let title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
    // Quitar prefijos como "New Listing" o "Anuncio nuevo"
    title = title.replace(/^(new listing|anuncio nuevo|nuevo anuncio)\b\s*/i, '');
    
    // 2. Extraer precio
    // En sold listings, el precio está en un span con clase "s-item__price" y a veces dentro un span class="POSITIVE" o similar
    const priceMatch = itemHtml.match(/<span[^>]*class="[^"]*s-item__price[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    if (!priceMatch) continue;
    
    const priceText = priceMatch[1].replace(/<[^>]*>/g, '').trim(); // e.g. "$1,234.56" or "COP 123.456"
    
    // Convertir precio a USD aproximado
    const priceUsd = parsePriceToUsd(priceText);
    if (priceUsd === null || priceUsd <= 0) continue;
    
    // 3. Extraer fecha de venta (opcional)
    // Suele estar en <span class="s-item__title--tag"> o <span class="s-item__sold-date"> o <span class="s-item__completed-info">
    const dateMatch = itemHtml.match(/<span[^>]*class="[^"]*(?:s-item__title--tag|s-item__sold-date|s-item__completed-info)[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    let dateSold: string | null = null;
    if (dateMatch) {
      dateSold = dateMatch[1].replace(/<[^>]*>/g, '').trim();
      // Limpiar texto como "Sold  May 24, 2026" o "Vendido el..."
      dateSold = dateSold.replace(/^(sold|vendido|vendido el)\b\s*/i, '');
    }
    
    items.push({
      title,
      priceUsd,
      dateSold,
    });
  }
  
  logger.debug({ count: items.length }, 'Items parseados de HTML de eBay');
  return items;
}

/**
 * Convierte un string de precio (de eBay) a un número en USD
 */
export function parsePriceToUsd(priceText: string): number | null {
  try {
    // Si es un rango (ej: "$10.00 to $15.00"), tomamos el primer valor o el promedio
    if (priceText.toLowerCase().includes(' to ') || priceText.toLowerCase().includes(' a ')) {
      const parts = priceText.split(/(?:to|a)/i);
      const val1 = parsePriceToUsd(parts[0]);
      const val2 = parsePriceToUsd(parts[1]);
      if (val1 && val2) return (val1 + val2) / 2;
      return val1 || val2 || null;
    }
    
    // Limpiar caracteres no numéricos excepto punto y coma
    // Ejemplos:
    // "$1,234.56" -> "1234.56"
    // "EUR 1.234,56" -> "1234.56"
    // "GBP 45.00" -> "45.00"
    
    let cleaned = priceText.trim();
    
    // Identificar moneda
    let rate = 1.0;
    if (cleaned.includes('EUR') || cleaned.includes('€')) {
      rate = 1.08; // Tasa EUR/USD aproximada
    } else if (cleaned.includes('GBP') || cleaned.includes('£')) {
      rate = 1.27; // Tasa GBP/USD aproximada
    } else if (cleaned.includes('CAD') || cleaned.includes('C$')) {
      rate = 0.73; // Tasa CAD/USD aproximada
    } else if (cleaned.includes('AUD') || cleaned.includes('A$')) {
      rate = 0.66; // Tasa AUD/USD aproximada
    }
    
    // Quitar letras y símbolos de moneda comunes
    cleaned = cleaned.replace(/[A-Z$€£¥C$A$]/gi, '').trim();
    
    // Determinar si usa coma como separador de miles y punto como decimal, o al revés
    // Caso A: "1,234.56" -> quitar comas
    // Caso B: "1.234,56" -> quitar puntos, cambiar coma por punto
    if (cleaned.includes(',') && cleaned.includes('.')) {
      const commaIdx = cleaned.indexOf(',');
      const dotIdx = cleaned.indexOf('.');
      if (commaIdx < dotIdx) {
        // Caso A
        cleaned = cleaned.replace(/,/g, '');
      } else {
        // Caso B
        cleaned = cleaned.replace(/\./g, '').replace(/,/g, '.');
      }
    } else if (cleaned.includes(',')) {
      // Si solo tiene comas, ej: "1234,56" (decimal de Europa) o "1,234" (miles de US)
      // Heurística: si hay exactamente 2 dígitos después de la coma, suele ser decimal
      const parts = cleaned.split(',');
      if (parts[parts.length - 1].length === 2) {
        cleaned = cleaned.replace(/,/g, '.');
      } else {
        cleaned = cleaned.replace(/,/g, '');
      }
    }
    
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed * rate;
  } catch (e) {
    return null;
  }
}
