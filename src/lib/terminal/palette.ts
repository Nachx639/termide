/**
 * Colour palette for the embedded terminal: the 16 ANSI colours plus the standard
 * xterm 256-colour cube and grey ramp, as [r, g, b] in 0-255.
 */

export type RGB = readonly [number, number, number];

/** ANSI 0-15, tuned for a dark background (One Dark-ish, readable dim/bright pairs). */
export const ANSI_16: readonly RGB[] = [
  [40, 44, 52],    // black
  [224, 108, 117], // red
  [152, 195, 121], // green
  [229, 192, 123], // yellow
  [97, 175, 239],  // blue
  [198, 120, 221], // magenta
  [86, 182, 194],  // cyan
  [200, 204, 212], // white
  [92, 99, 112],   // bright black
  [240, 131, 140], // bright red
  [174, 214, 145], // bright green
  [240, 207, 145], // bright yellow
  [125, 192, 247], // bright blue
  [214, 145, 235], // bright magenta
  [110, 201, 213], // bright cyan
  [240, 242, 245], // bright white
];

export const DEFAULT_FG: RGB = [212, 216, 223];
/** Used as background for inverse cells whose background is the default one. */
export const DEFAULT_BG: RGB = [24, 26, 31];
export const CURSOR_BG: RGB = [212, 168, 0];
export const CURSOR_FG: RGB = [0, 0, 0];

const CUBE_LEVELS = [0, 95, 135, 175, 215, 255];

function build256(): RGB[] {
  const out: RGB[] = [...ANSI_16];
  for (let r = 0; r < 6; r++)
    for (let g = 0; g < 6; g++)
      for (let b = 0; b < 6; b++) out.push([CUBE_LEVELS[r]!, CUBE_LEVELS[g]!, CUBE_LEVELS[b]!]);
  for (let i = 0; i < 24; i++) {
    const v = 8 + i * 10;
    out.push([v, v, v]);
  }
  return out;
}

export const PALETTE_256: readonly RGB[] = build256();

export function paletteColor(index: number): RGB {
  return PALETTE_256[index] ?? DEFAULT_FG;
}

/** xterm packs truecolor as 0xRRGGBB. */
export function unpackRGB(packed: number): RGB {
  return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff];
}
