// Pixel-art sprites, drawn from small text grids. Each character is a pixel;
// "." is transparent. Adding a sprite is just adding a grid.

export const PALETTE = {
  y: '#ffe27a', o: '#ff9a1f', r: '#e0451b',
  k: '#6b4423', s: '#8d8d94', S: '#c4c4cc',
  h: '#c9a063', H: '#a07a42', d: '#3a2a1a',
  l: '#4aa85a', L: '#6fd07c', D: '#2f7d3d', t: '#6b4423',
  g: '#2f8a45', G: '#1f6232',
  f: '#f09a80', F: '#d96a50',
  b: '#3f9a4e', R: '#e04a48',
  x: '#ffd166', w: '#f4f4f4',
};

export const SPRITES = {
  campfire: [
    [
      '...o...',
      '..oyo..',
      '.oyyyo.',
      '.orryo.',
      'skkkkks',
      '.sksks.',
    ],
    [
      '..o.o..',
      '..oyo..',
      '.oyyyo.',
      '.oyryo.',
      'skkkkks',
      '.sksks.',
    ],
  ],
  shelter: [[
    '.....k.....',
    '....hhh....',
    '...hhhhh...',
    '..hhHhhhh..',
    '.hhhHdhhhh.',
    'hhhhHdhhhhH',
  ]],
  'drying-rack': [[
    'kkkkkkkkk',
    'kf.f.f.fk',
    'kF.F.F.Fk',
    'k.......k',
    'k.......k',
    'S.......S',
  ]],
  oak: [[
    '...l...',
    '..lLl..',
    '.lLlll.',
    '.llLll.',
    'lllllLl',
    '.lDllD.',
    '..lll..',
    '...t...',
    '...t...',
  ]],
  pine: [[
    '...g...',
    '..ggg..',
    '.ggGgg.',
    '..ggg..',
    '.ggggg.',
    'ggGgggg',
    '...t...',
    '...t...',
  ]],
  bush: [[
    '.bbbbb.',
    'bbRbbRb',
    'bbbbbbb',
    'bRbbRbb',
    '.bbbbb.',
  ]],
};

export function spriteSize(name) {
  const rows = SPRITES[name][0];
  return { w: rows[0].length, h: rows.length };
}

// Pre-draws each frame of a sprite onto its own small canvas.
export function makeSprite(name) {
  return SPRITES[name].map((rows) => {
    const c = document.createElement('canvas');
    c.width = rows[0].length; c.height = rows.length;
    const ctx = c.getContext('2d');
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        ctx.fillStyle = PALETTE[ch];
        ctx.fillRect(x, y, 1, 1);
      }
    });
    return c;
  });
}

// A small canvas with one sprite scaled up, for button icons.
export function iconCanvas(name, scale = 3, box = 32) {
  const [frame] = makeSprite(name);
  const c = document.createElement('canvas');
  c.width = box; c.height = box;
  c.className = 'icon';
  c.setAttribute('aria-hidden', 'true');
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const w = frame.width * scale, h = frame.height * scale;
  ctx.drawImage(frame, Math.round((box - w) / 2), Math.round((box - h) / 2), w, h);
  return c;
}
