import { describe, it, expect } from 'vitest';
import { matchCard } from '../modules/matching/matcher.js';
import type { Card, CardIdentity } from '../types/card.types.js';

describe('matcher.ts', () => {
  const catalog: Card[] = [
    {
      id: '1',
      canonical_name: 'charizard__base_set__4_102__psa__10',
      display_name: 'Charizard Base Set 4/102 PSA 10',
      set_name: 'Base Set',
      card_number: '4/102',
      pokemon_name: 'Charizard',
      grader: 'PSA',
      grade: 10,
      rarity: 'Holo Rare',
      ebay_search_query: 'Charizard Base Set 4/102 PSA 10',
      is_active: 1,
      created_at: '',
      updated_at: '',
    },
    {
      id: '2',
      canonical_name: 'charizard__base_set__4_102__psa__9',
      display_name: 'Charizard Base Set 4/102 PSA 9',
      set_name: 'Base Set',
      card_number: '4/102',
      pokemon_name: 'Charizard',
      grader: 'PSA',
      grade: 9,
      rarity: 'Holo Rare',
      ebay_search_query: 'Charizard Base Set 4/102 PSA 9',
      is_active: 1,
      created_at: '',
      updated_at: '',
    },
    {
      id: '3',
      canonical_name: 'umbreon__pop_series_5__17_17__psa__10',
      display_name: 'Umbreon Gold Star Pop Series 5 PSA 10',
      set_name: 'Pop Series 5',
      card_number: '17/17',
      pokemon_name: 'Umbreon',
      grader: 'PSA',
      grade: 10,
      rarity: 'Gold Star',
      ebay_search_query: 'Umbreon Gold Star Pop Series 5 PSA 10',
      is_active: 1,
      created_at: '',
      updated_at: '',
    },
  ];

  it('debe encontrar match perfecto si coincide todo', () => {
    const identity: CardIdentity = {
      pokemonName: 'Charizard',
      setName: 'Base Set',
      cardNumber: '4/102',
      grader: 'PSA',
      grade: 10,
      variant: 'holo',
      year: 1999,
      language: 'English',
    };

    const result = matchCard(identity, catalog);

    expect(result.card).not.toBeNull();
    expect(result.card?.id).toBe('1');
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('debe respetar estrictamente el grado (filtro duro)', () => {
    const identity: CardIdentity = {
      pokemonName: 'Charizard',
      setName: 'Base Set',
      cardNumber: '4/102',
      grader: 'PSA',
      grade: 9, // Queremos PSA 9
      variant: 'holo',
      year: 1999,
      language: 'English',
    };

    const result = matchCard(identity, catalog);

    expect(result.card).not.toBeNull();
    expect(result.card?.id).toBe('2'); // Debe emparejar con el registro PSA 9
    expect(result.card?.grade).toBe(9);
  });

  it('debe respetar estrictamente la casa certificadora (filtro duro)', () => {
    const identity: CardIdentity = {
      pokemonName: 'Charizard',
      setName: 'Base Set',
      cardNumber: '4/102',
      grader: 'BGS', // Queremos BGS
      grade: 10,
      variant: 'holo',
      year: 1999,
      language: 'English',
    };

    const result = matchCard(identity, catalog);

    expect(result.card).toBeNull(); // No hay BGS en el catálogo, debe retornar null
  });

  it('debe tolerar ligeras variaciones en el nombre del Pokémon y del set', () => {
    const identity: CardIdentity = {
      pokemonName: 'Charizrd', // Typo para Charizard
      setName: 'base set', // Variación en el set (casing)
      cardNumber: '4/102',
      grader: 'PSA',
      grade: 10,
      variant: 'holo',
      year: 1999,
      language: 'English',
    };

    const result = matchCard(identity, catalog);

    expect(result.card).not.toBeNull();
    expect(result.card?.id).toBe('1');
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });
});
