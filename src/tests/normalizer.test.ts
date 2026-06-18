import { describe, it, expect } from 'vitest';
import { extractIdentityFromString, extractIdentityFromAttributes } from '../modules/matching/normalizer.js';

describe('normalizer.ts', () => {
  describe('extractIdentityFromString', () => {
    it('debe extraer la identidad de un título clásico de Charizard', () => {
      const title = 'Charizard Base Set 4/102 PSA 10 Holo Rare 1999';
      const identity = extractIdentityFromString(title);

      expect(identity.pokemonName).toBe('Charizard');
      expect(identity.setName).toBe('Base Set');
      expect(identity.cardNumber).toBe('4/102');
      expect(identity.grader).toBe('PSA');
      expect(identity.grade).toBe(10);
      expect(identity.variant).toBe('holo');
      expect(identity.year).toBe(1999);
    });

    it('debe manejar títulos en minúsculas y formatos alternativos de grado', () => {
      const title = 'umbreon gold star bgs:9.5 pop series 5';
      const identity = extractIdentityFromString(title);

      expect(identity.pokemonName).toBe('umbreon');
      expect(identity.setName).toBe('Pop Series 5');
      expect(identity.grader).toBe('BGS');
      expect(identity.grade).toBe(9.5);
      expect(identity.variant).toBe('gold star');
    });

    it('debe extraer número de carta y año de forma robusta', () => {
      const title = 'Lugia ex 105/115 2004 cgc 9';
      const identity = extractIdentityFromString(title);

      expect(identity.pokemonName).toBe('Lugia');
      expect(identity.cardNumber).toBe('105/115');
      expect(identity.year).toBe(2004);
      expect(identity.grader).toBe('CGC');
      expect(identity.grade).toBe(9);
    });

    it('debe extraer correctamente nombres complejos de cartas japonesas con numeración y sets no estándar', () => {
      const title = '2025 #072 Shedinja CGC 10 Pristine Mega Symphonia - M1S - Japanese Pokemon';
      const identity = extractIdentityFromString(title);

      expect(identity.pokemonName).toBe('Shedinja');
      expect(identity.grader).toBe('CGC');
      expect(identity.grade).toBe(10);
      expect(identity.setName).toBe('Mega Symphonia');
    });

    it('debe extraer correctamente números de carta alfanuméricos de Trainer Gallery y Galarian Gallery', () => {
      const title1 = '2022 #TG03 Full Art/Charizard PSA 9 Sword & Shield Lost Origin Pokemon';
      const id1 = extractIdentityFromString(title1);
      expect(id1.pokemonName).toBe('Charizard');
      expect(id1.cardNumber).toBe('TG03');
      expect(id1.grader).toBe('PSA');
      expect(id1.grade).toBe(9);

      const title2 = '2023 #GG41 Full Art/Raikou V PSA 9 Sword and Shield Crown Zenith Pokemon';
      const id2 = extractIdentityFromString(title2);
      expect(id2.pokemonName).toBe('Raikou');
      expect(id2.cardNumber).toBe('GG41');
      expect(id2.grader).toBe('PSA');
      expect(id2.grade).toBe(9);

      const title3 = 'Pikachu Crown Zenith GG30/GG70 PSA 10';
      const id3 = extractIdentityFromString(title3);
      expect(id3.pokemonName).toBe('Pikachu');
      expect(id3.cardNumber).toBe('GG30/GG70');
      expect(id3.grader).toBe('PSA');
      expect(id3.grade).toBe(10);
    });

    it('debe extraer correctamente el nombre del pokemon "Ambipom" de un título japonés complejo con set intercalado', () => {
      const title = '2025 #92 Japanese Mega Inferno X AR Ambipom GEM MINT CGC 10 Pokemon';
      const identity = extractIdentityFromString(title);

      expect(identity.pokemonName).toBe('Ambipom');
      expect(identity.cardNumber).toBe('92');
      expect(identity.grader).toBe('CGC');
      expect(identity.grade).toBe(10);
    });

    it('debe extraer correctamente el nombre de entrenadores como Caitlin', () => {
      const title = 'Caitlin #167 Jet-Black Spirit PSA 10 Pokemon';
      const identity = extractIdentityFromString(title);

      expect(identity.pokemonName).toBe('Caitlin');
      expect(identity.cardNumber).toBe('167');
      expect(identity.grader).toBe('PSA');
      expect(identity.grade).toBe(10);
    });
  });

  describe('extractIdentityFromAttributes', () => {
    it('debe usar los atributos estructurados cuando estén disponibles', () => {
      const attrs = {
        'Card Name': 'Charizard ex',
        'Grading Company': 'PSA',
        'GradeNum': '10',
        'Set': 'Obsidian Flames',
        'Year': '2023',
      };
      const nftName = '2023 Charizard ex 234/197 PSA 10';
      const identity = extractIdentityFromAttributes(attrs, nftName);

      expect(identity.pokemonName).toBe('Charizard ex');
      expect(identity.setName).toBe('Obsidian Flames');
      expect(identity.grader).toBe('PSA');
      expect(identity.grade).toBe(10);
      expect(identity.year).toBe(2023);
      expect(identity.cardNumber).toBe('234/197');
    });

    it('debe extraer el número de carta desde la descripción de Collector Crypt para cartas japonesas (ej. Mew EX 076)', () => {
      const attrs = {
        'Card Name': 'Mew EX',
        'Grading Company': 'PSA',
        'GradeNum': '10',
        'Set': 'Pokemon Japanese Sv4a-Shiny Treasure EX',
        'Description': '2023 Pokemon Japanese Sv4a-Shiny Treasure EX Mew EX 076',
        'Year': '2023',
      };
      const nftName = '2023 Mew EX PSA 10 Shiny Treasure';
      const identity = extractIdentityFromAttributes(attrs, nftName);

      expect(identity.pokemonName).toBe('Mew EX');
      expect(identity.setName).toBe('Pokemon Japanese Sv4a-Shiny Treasure EX');
      expect(identity.grader).toBe('PSA');
      expect(identity.grade).toBe(10);
      expect(identity.year).toBe(2023);
      expect(identity.cardNumber).toBe('076');
    });

    it('debe extraer el número de carta desde una descripción con hash (ej. #60 Tapu Lele GX)', () => {
      const attrs = {
        'Card Name': 'Tapu Lele GX',
        'Grading Company': 'PSA',
        'GradeNum': '10',
        'Set': 'Pokemon Celebrations Classic Collection',
        'Description': '2021 #60 Tapu Lele GX PSA 10 Celebrations Classic Collection Pokemon',
        'Year': '2021',
      };
      const nftName = '2021 #60 Tapu Lele GX PSA 10 Ce'; // Nombre truncado de ME
      const identity = extractIdentityFromAttributes(attrs, nftName);

      expect(identity.pokemonName).toBe('Tapu Lele GX');
      expect(identity.setName).toBe('Pokemon Celebrations Classic Collection');
      expect(identity.grader).toBe('PSA');
      expect(identity.grade).toBe(10);
      expect(identity.year).toBe(2021);
      expect(identity.cardNumber).toBe('60');
    });

    it('debe caer en parsing del nombre del NFT si faltan atributos', () => {
      const attrs = {};
      const nftName = 'Charizard Base Set 4/102 PSA 9';
      const identity = extractIdentityFromAttributes(attrs, nftName);

      expect(identity.pokemonName).toBe('Charizard');
      expect(identity.grader).toBe('PSA');
      expect(identity.grade).toBe(9);
      expect(identity.cardNumber).toBe('4/102');
    });
  });
});
