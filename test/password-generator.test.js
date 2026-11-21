import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARSETS,
  LIMITS,
  WORDLIST,
  clampInt,
  randomInt,
  generateRandomPassword,
  generateMemorablePassword,
  generatePin,
  estimateStrength,
  tokenizePassword,
} from '../web/password-generator.js';

test('WORDLIST contains unique lowercase ASCII words', () => {
  assert.ok(WORDLIST.length >= 512, `expected >= 512 words, got ${WORDLIST.length}`);
  assert.equal(new Set(WORDLIST).size, WORDLIST.length, 'wordlist should have no duplicates');
  for (const word of WORDLIST) {
    assert.match(word, /^[a-z]{4,7}$/);
  }
});

test('random password respects defaults, bounds, and toggle guarantees', () => {
  const def = generateRandomPassword();
  assert.equal(def.length, 16);
  assert.match(def, /[a-z]/);
  assert.match(def, /[A-Z]/);
  assert.match(def, /[0-9]/);
  assert.ok([...def].some(ch => CHARSETS.symbols.includes(ch)));

  for (let i = 0; i < 60; i++) {
    const withAll = generateRandomPassword({ length: 8, numbers: true, symbols: true });
    assert.equal(withAll.length, 8);
    assert.match(withAll, /[a-z]/);
    assert.match(withAll, /[A-Z]/);
    assert.match(withAll, /[0-9]/);
    assert.ok([...withAll].some(ch => CHARSETS.symbols.includes(ch)));

    const lettersOnly = generateRandomPassword({ length: 24, numbers: false, symbols: false });
    assert.equal(lettersOnly.length, 24);
    assert.match(lettersOnly, /^[a-zA-Z]+$/);

    const noSym = generateRandomPassword({ length: 20, numbers: true, symbols: false });
    assert.equal(noSym.length, 20);
    assert.match(noSym, /^[a-zA-Z0-9]+$/);
    assert.match(noSym, /[0-9]/);

    const noNum = generateRandomPassword({ length: 20, numbers: false, symbols: true });
    assert.equal(noNum.length, 20);
    assert.doesNotMatch(noNum, /[0-9]/);
    assert.ok([...noNum].some(ch => CHARSETS.symbols.includes(ch)));
  }

  assert.equal(generateRandomPassword({ length: 1 }).length, LIMITS.random.min);
  assert.equal(generateRandomPassword({ length: 999 }).length, LIMITS.random.max);
  assert.equal(generateRandomPassword({ length: 'bad' }).length, LIMITS.random.default);
});

test('memorable password respects word count, capitalization, and separator', () => {
  const def = generateMemorablePassword();
  const parts = def.split('-');
  assert.equal(parts.length, 4);
  for (const part of parts) {
    assert.match(part, /^[A-Z][a-z]+$/);
    assert.ok(WORDLIST.includes(part.toLowerCase()));
  }

  const lowerSpace = generateMemorablePassword({ words: 6, capitalize: false, separator: ' ' });
  const lp = lowerSpace.split(' ');
  assert.equal(lp.length, 6);
  for (const part of lp) {
    assert.match(part, /^[a-z]+$/);
    assert.ok(WORDLIST.includes(part));
  }

  assert.equal(generateMemorablePassword({ words: 1, separator: '.' }).split('.').length, LIMITS.memorable.min);
  assert.equal(generateMemorablePassword({ words: 99, separator: '_' }).split('_').length, LIMITS.memorable.max);
  assert.equal(generateMemorablePassword({ words: 4, separator: 'invalid' }).split('-').length, 4);
});

test('PIN generator produces digits only with bounded lengths', () => {
  const def = generatePin();
  assert.match(def, /^\d{6}$/);
  for (let i = 0; i < 40; i++) {
    assert.match(generatePin({ length: 12 }), /^\d{12}$/);
  }
  assert.match(generatePin({ length: 1 }), new RegExp(`^\\d{${LIMITS.pin.min}}$`));
  assert.match(generatePin({ length: 50 }), new RegExp(`^\\d{${LIMITS.pin.max}}$`));
});

test('clampInt, randomInt, strength estimator, and tokenizer behave as expected', () => {
  assert.equal(clampInt('42', 8, 100, 16), 42);
  assert.equal(clampInt('2', 8, 100, 16), 8);
  assert.equal(clampInt('200', 8, 100, 16), 100);
  assert.equal(clampInt('abc', 8, 100, 16), 16);

  assert.throws(() => randomInt(0), RangeError);
  assert.equal(randomInt(1), 0);

  assert.equal(estimateStrength({ mode: 'random', length: 16, numbers: true, symbols: true }).level, 'very-strong');
  assert.equal(estimateStrength({ mode: 'pin', length: 6 }).level, 'weak');
  assert.equal(estimateStrength({ mode: 'memorable', words: 4 }).level, 'fair');
  assert.equal(estimateStrength({ mode: 'memorable', words: 6 }).level, 'strong');
  assert.equal(estimateStrength({ mode: 'memorable', words: 8 }).level, 'very-strong');

  const randTokens = tokenizePassword('Ab7!', 'random');
  assert.deepEqual(randTokens.map(t => t.cls), ['ch-alpha', 'ch-alpha', 'ch-num', 'ch-sym']);

  const memTokens = tokenizePassword('Acorn-River', 'memorable', '-');
  assert.equal(memTokens[5].cls, 'ch-sep');
  assert.equal(memTokens[0].cls, 'ch-alpha');
});
