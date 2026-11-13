import test from 'node:test';
import assert from 'node:assert/strict';
import { SPRITES, PALETTE } from '../js/sprites.js';

test('every sprite frame is a clean rectangle that only uses colors in the palette', () => {
  for (const [name, frames] of Object.entries(SPRITES)) {
    const w = frames[0][0].length, h = frames[0].length;
    for (const rows of frames) {
      assert.equal(rows.length, h, `${name}: frames differ in height`);
      for (const row of rows) {
        assert.equal(row.length, w, `${name}: row "${row}" is ${row.length} wide, expected ${w}`);
        for (const ch of row) assert.ok(ch === '.' || PALETTE[ch], `${name}: unknown color "${ch}"`);
      }
    }
  }
});
