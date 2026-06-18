import type { CardIdentity } from '../../types/card.types.js';
import { SINGLE_WORD_NAMES, MULTI_WORD_NAMES } from '../../utils/pokemon-names.js';


// Regex patterns para extraer componentes
const GRADE_REGEX = /\b(PSA|BGS|CGC|SGC)\s*[:]?\s*(\d{1,2}(?:\.\d)?)\b/i;
const CARD_NUMBER_REGEX = /\b([a-zA-Z0-9]{0,5}\d[a-zA-Z0-9]{0,2})\s*\/\s*([a-zA-Z0-9]{0,5}\d[a-zA-Z0-9]{0,2})\b/;
const YEAR_REGEX = /\b(19[89]\d|20[0-2]\d)\b/;
const VARIANT_KEYWORDS = [
  '1st edition', 'first edition', 'shadowless',
  'reverse holo', 'holo', 'full art', 'alt art', 'secret rare',
  'gold star', 'ex', 'gx', 'vmax', 'vstar', 'v', 'tag team',
  'rainbow rare', 'shiny', 'promo', 'illustration rare', 'special art',
  'trainer gallery', 'art rare', 'ar', 'sar', 'sir', 'ur',
];

/**
 * Extrae una identidad estructurada de un string de nombre de NFT.
 * Usa los atributos de metadata de Collector Crypt cuando están disponibles.
 */
export function extractIdentityFromAttributes(
  attrs: Record<string, string>,
  nftName: string,
): CardIdentity {
  const fullName = attrs['Description'] || nftName;

  const grader = attrs['Grading Company'] || extractGrader(fullName) || 'UNKNOWN';
  const grade = attrs['GradeNum'] ? parseFloat(attrs['GradeNum']) : extractGrade(fullName);
  
  const setName = attrs['Set'] || extractSetName(fullName);
  const year = attrs['Year'] ? parseInt(attrs['Year']) : extractYear(fullName);

  let pokemonName = attrs['Card Name'];
  if (!pokemonName) {
    let fullNameForPokemon = fullName;
    if (setName) {
      const setEscaped = setName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      fullNameForPokemon = fullName.replace(new RegExp(`\\b${setEscaped}\\b`, 'gi'), '');
    }
    pokemonName = extractPokemonName(fullNameForPokemon);
  }

  const cardNumber = attrs['Card Number'] || attrs['Number'] || extractCardNumber(fullName, pokemonName);
  const variant = detectVariant(fullName);

  return {
    pokemonName,
    setName,
    cardNumber,
    grader: grader.toUpperCase(),
    grade: grade ?? 0,
    variant,
    year,
    language: detectLanguage(fullName, attrs),
  };
}

/**
 * Extrae identidad solo desde un string (para títulos de eBay sin atributos)
 */
export function extractIdentityFromString(title: string): CardIdentity {
  const grader = extractGrader(title) || 'UNKNOWN';
  const grade = extractGrade(title) ?? 0;
  const year = extractYear(title);
  const setName = extractSetName(title);

  // Si hay set name, removerlo para limpiar el nombre del pokemon
  let titleForPokemon = title;
  if (setName) {
    const setEscaped = setName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    titleForPokemon = title.replace(new RegExp(`\\b${setEscaped}\\b`, 'gi'), '');
  }
  
  const pokemonName = extractPokemonName(titleForPokemon);
  const cardNumber = extractCardNumber(title, pokemonName);
  const variant = detectVariant(title);

  return {
    pokemonName,
    setName,
    cardNumber,
    grader: grader.toUpperCase(),
    grade,
    variant,
    year,
    language: 'English', // default
  };
}

function extractGrader(text: string): string | null {
  const match = text.match(GRADE_REGEX);
  return match ? match[1].toUpperCase() : null;
}

function extractGrade(text: string): number | null {
  const match = text.match(GRADE_REGEX);
  return match ? parseFloat(match[2]) : null;
}

function extractCardNumber(text: string, pokemonName?: string): string | null {
  // 1. Intentar patrón clásico X/Y (ej. 4/102, 234/197, GG30/GG70)
  const slashMatch = text.match(CARD_NUMBER_REGEX);
  if (slashMatch) {
    return `${slashMatch[1]}/${slashMatch[2]}`;
  }

  // 2. Intentar patrón con hash #X (ej. #60, #TG03, #GG12)
  const hashMatch = text.match(/#([a-zA-Z0-9]+)\b/);
  if (hashMatch) {
    return hashMatch[1];
  }

  // 3. Si tenemos el nombre del pokemon, buscar un número autónomo que lo siga (ej. "Mew EX 076" o "Mew EX 76")
  if (pokemonName) {
    const escapedName = pokemonName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    // Coincidir el nombre del pokemon seguido de espacios y un número de 1 a 4 dígitos
    const nameFollowedByNumRegex = new RegExp(`\\b${escapedName}\\b\\s*(?:ex|gx|vmax|vstar|v|stars)?\\s*(\\d{1,4})\\b`, 'i');
    const followMatch = text.match(nameFollowedByNumRegex);
    if (followMatch) {
      return followMatch[1];
    }
  }

  // 4. Intentar buscar un número al final del nombre o de la descripción antes del grader/año
  // O buscar palabras que sean solo números de 3 dígitos (ej. 076, 060) que suelen ser números de carta en sets modernos/japoneses
  const standaloneMatch = text.match(/\b(\d{3})\b/);
  if (standaloneMatch) {
    return standaloneMatch[1];
  }

  return null;
}

function extractYear(text: string): number | null {
  const match = text.match(YEAR_REGEX);
  return match ? parseInt(match[1]) : null;
}

function extractPokemonName(text: string): string {
  // Limpiar el texto completo de ruidos y componentes conocidos
  let cleanedFull = text
    .replace(GRADE_REGEX, '')
    .replace(CARD_NUMBER_REGEX, '')
    .replace(YEAR_REGEX, '')
    .replace(/\b(pokemon|pokémon|tcg|psa|bgs|cgc|sgc)\b/gi, '')
    .replace(/\b(gem[- ]?mt|gem|mint|nm[- ]?mt|near mint|excellent|pristine)\b/gi, '')
    .replace(/\b(holo|reverse|error|promo|japanese|english)\b/gi, '')
    .replace(/\b(rare|gold star|ex|gx|vmax|vstar|v|1st edition|first edition|shadowless|art rare|secret rare|ultra rare|illustration rare|special art|illustration|gallery|classic|collection|celebrations|full art|alt art|trainer gallery|galarian gallery|shiny|parallel|ar|sar|sir|tg|gg|sv)\b/gi, '')
    .replace(/#[a-zA-Z0-9]+/g, '')
    .replace(/[^a-zA-Z0-9\s\-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanedLower = cleanedFull.toLowerCase();

  // 1. Buscar nombres de múltiples palabras primero en el texto completo
  for (const multiName of MULTI_WORD_NAMES) {
    const escaped = multiName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(cleanedLower)) {
      return multiName.replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  // 2. Buscar palabras individuales en el texto completo
  const words = cleanedFull.split(/\s+/);
  const matchedWords: string[] = [];
  for (const word of words) {
    const wordClean = word.toLowerCase().replace(/[^a-z0-9']/g, '');
    if (SINGLE_WORD_NAMES.includes(wordClean)) {
      matchedWords.push(word);
    }
  }

  if (matchedWords.length > 0) {
    return matchedWords.join(' ');
  }

  // 3. Fallback: Heurística segmentada (comportamiento original)
  const hashMatch = text.match(/#[a-zA-Z0-9]+\s+([^#]+?)(?:\s+(?:PSA|BGS|CGC|SGC|1st\s+Edition|First\s+Edition|Shadowless|Pristine))/i);
  let segment = text;
  
  if (hashMatch) {
    segment = hashMatch[1];
  } else {
    // Heurística B: Si no hay # número, tomar el segmento antes del grader
    const graderMatch = text.match(/^(.+?)(?:\s+(?:PSA|BGS|CGC|SGC)\b)/i);
    if (graderMatch) {
      segment = graderMatch[1];
    }
  }

  let cleanedSegment = segment
    .replace(GRADE_REGEX, '')
    .replace(CARD_NUMBER_REGEX, '')
    .replace(YEAR_REGEX, '')
    .replace(/\b(pokemon|pokémon|tcg|psa|bgs|cgc|sgc)\b/gi, '')
    .replace(/\b(gem[- ]?mt|gem|mint|nm[- ]?mt|near mint|excellent|pristine)\b/gi, '')
    .replace(/\b(holo|reverse|error|promo|japanese|english)\b/gi, '')
    .replace(/\b(rare|gold star|ex|gx|vmax|vstar|v|1st edition|first edition|shadowless|art rare|secret rare|ultra rare|illustration rare|special art|illustration|gallery|classic|collection|celebrations|full art|alt art|trainer gallery|galarian gallery|shiny|parallel|ar|sar|sir|tg|gg|sv)\b/gi, '')
    .replace(/#[a-zA-Z0-9]+/g, '')
    .replace(/[^a-zA-Z0-9\s\-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const fallbackWords = cleanedSegment.split(' ').filter(w => w.length > 1);
  if (fallbackWords.length === 0) return 'Unknown';
  
  if (!hashMatch) {
    return fallbackWords.slice(0, Math.min(3, fallbackWords.length)).join(' ');
  }

  return cleanedSegment;
}

function extractSetName(text: string): string | null {
  // Buscar sets conocidos por keywords
  const setPatterns = [
    /\b(base set|base set 2|jungle|fossil|team rocket|gym heroes|gym challenge)\b/i,
    /\b(neo genesis|neo discovery|neo revelation|neo destiny)\b/i,
    /\b(expedition|aquapolis|skyridge|legendary collection)\b/i,
    /\b(ruby.sapphire|sandstorm|dragon|magma.aqua|hidden legends)\b/i,
    /\b(celebrations|classic collection|evolutions|generations)\b/i,
    /\b(brilliant stars|astral radiance|lost origin|silver tempest|crown zenith)\b/i,
    /\b(scarlet.violet|paldea evolved|obsidian flames|151|paradox rift)\b/i,
    /\b(temporal forces|twilight masquerade|shrouded fable|stellar crown|surging sparks)\b/i,
    /\b(prismatic evolutions|journey together)\b/i,
    /\b(triplet beat|clay burst|151 japanese|vstar universe)\b/i,
    /\b(pop series \d|dragon frontiers)\b/i,
    /\b(mega symphonia|mega dream|shiny treasure|incandescent arcana|expansion pack|strength expansion pack)\b/i,
  ];

  for (const pattern of setPatterns) {
    const match = text.match(pattern);
    if (match) {
      // Capitalizar cada palabra (Title Case)
      return match[1].replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  // Fallback dinámico para extraer el set de la estructura del título de Collector Crypt
  const gradeMatch = text.match(/\b(PSA|BGS|CGC|SGC)\s*[:]?\s*(\d{1,2}(?:\.\d)?)\b/i);
  if (gradeMatch && gradeMatch.index !== undefined) {
    const endGraderIdx = gradeMatch.index + gradeMatch[0].length;
    let afterGrader = text.substring(endGraderIdx).trim();

    // Quitar sufijos comunes
    afterGrader = afterGrader
      .replace(/-?\s*(?:english|japanese)\s*pokemon\b/i, '')
      .replace(/-?\s*(?:english|japanese)\b/i, '')
      .replace(/\bpokemon\b/i, '')
      .trim();

    // Limpiar caracteres sobrantes
    afterGrader = afterGrader.replace(/^[-/\s]+|[-/\s]+$/g, '').trim();

    if (afterGrader.length >= 2 && afterGrader.length <= 40) {
      // Capitalizar las palabras para que quede en Title Case
      return afterGrader.replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  return null;
}

function detectVariant(text: string): string | null {
  const lower = text.toLowerCase();
  for (const variant of VARIANT_KEYWORDS) {
    if (lower.includes(variant)) return variant;
  }
  return null;
}

function detectLanguage(text: string, attrs: Record<string, string>): string {
  const lower = text.toLowerCase();
  if (
    lower.includes('japanese') ||
    lower.includes('japane') ||
    attrs['Set']?.toLowerCase().includes('japanese')
  ) {
    return 'Japanese';
  }
  return 'English';
}
