import { describe, expect, it } from 'vitest';

import { sha256Hex } from './sha256.ts';

// FIPS 180-4 examples, plus two checked against Node's crypto.createHash('sha256').
describe('sha256Hex', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
    ['Nestlé 🍫 ünïcödé', 'e64d37bcbb0171086013a3e698cfb2983c855fdb062cb609716ff8b67e8047f9'],
    ['a'.repeat(1000), '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3'],
  ])('hashes %j', (input, hex) => {
    expect(sha256Hex(input)).toBe(hex);
  });
});
