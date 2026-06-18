/**
 * Elimina caracteres especiales y normaliza espacios
 */
export function cleanString(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\w\s\/\-#.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Elimina palabras comunes que no aportan al matching
 */
export function removeNoiseWords(input: string): string {
  const noise = [
    'pokemon', 'pokémon', 'tcg', 'trading', 'card', 'game', 'cards',
    'japanese', 'english', 'holo', 'holographic',
  ];
  const words = input.toLowerCase().split(/\s+/);
  return words.filter(w => !noise.includes(w)).join(' ');
}

/**
 * Genera un canonical name a partir de componentes.
 * Formato: pokemonName__setName__cardNumber__grader__grade
 */
export function buildCanonicalName(
  pokemonName: string,
  setName: string | null,
  cardNumber: string | null,
  grader: string,
  grade: number,
): string {
  const parts = [
    pokemonName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    setName ? setName.toLowerCase().replace(/[^a-z0-9]/g, '_') : null,
    cardNumber ? cardNumber.replace(/\//g, '_') : null,
    grader.toLowerCase(),
    grade.toString().replace('.', '_'),
  ].filter(Boolean);
  return parts.join('__');
}
