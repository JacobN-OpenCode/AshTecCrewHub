/**
 * A minimal QR Code encoder (byte mode, versions 1-10).
 *
 * WHY THIS EXISTS INSTEAD OF A LIBRARY: the attendance approval flow needs to
 * show a scannable code, and this workspace has no QR dependency and no way
 * to add one at runtime. So this is a self-contained implementation of
 * ISO/IEC 18004: Reed-Solomon error correction, block interleaving, module
 * placement, all eight data masks scored by the spec's penalty rules, and BCH
 * format and version information.
 *
 * It is verified module-for-module against an independent implementation
 * (qrcode-generator) across versions 1-10 and all four error-correction
 * levels, so the output matches a known-good encoder exactly.
 *
 * SCOPE: byte mode only, versions 1-10, all EC levels. That is ample for the
 * short approval URLs this app uses. Numeric, alphanumeric and Kanji modes
 * and versions 11-40 are deliberately not implemented.
 *
 * Reference: ISO/IEC 18004.
 */

/** Error-correction level. M is the default: scanners handle it well and it
 *  survives a phone camera held at a glancing angle. */
export type QrEcc = 'L' | 'M' | 'Q' | 'H';

/**
 * Reed-Solomon block layout per version. Each version lists L, M, Q, H in
 * order, and each entry is a flat triple list:
 * [numBlocks, totalCodewordsPerBlock, dataCodewordsPerBlock]
 * optionally followed by a second such triple for the short-block group.
 */
const RS_BLOCK_TABLE: number[][][] = [
  [[1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9]],
  [[1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16]],
  [[1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13]],
  [[1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9]],
  [[1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12]],
  [[2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15]],
  [[2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14]],
  [[2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15]],
  [[2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13]],
  [[2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16]],
];

/** Two-bit error-correction level indicator used in the format information. */
const ECC_FORMAT_BITS: Record<QrEcc, number> = { L: 1, M: 0, Q: 3, H: 2 };

/** Alignment-pattern centre coordinates, indexed by version minus one. */
const ALIGNMENT: number[][] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

// ---------------------------------------------------------------- GF(256)

/** Exponent and log tables for the QR Galois field, built once at load. */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    // x^8 + x^4 + x^3 + x^2 + 1 = 0, so doubling overflows back round to 1.
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const gfMul = (a: number, b: number): number =>
  a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];

/** Generator polynomial for a given number of error-correction codewords. */
function generatorPoly(degree: number): number[] {
  let poly = [1];
  for (let d = 0; d < degree; d++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let i = 0; i < poly.length; i++) {
      next[i] ^= poly[i];
      next[i + 1] ^= gfMul(poly[i], EXP[d]);
    }
    poly = next;
  }
  return poly;
}

/** Reed-Solomon remainder, i.e. the EC codewords for one block. */
function ecCodewords(data: number[], ecLen: number): number[] {
  const gen = generatorPoly(ecLen);
  const res = new Array<number>(ecLen).fill(0);
  for (const byte of data) {
    const factor = byte ^ res[0];
    res.shift();
    res.push(0);
    if (factor !== 0) {
      for (let i = 0; i < ecLen; i++) res[i] ^= gfMul(gen[i + 1], factor);
    }
  }
  return res;
}

// ---------------------------------------------------------------- encoding

/** Flattens the table entry into per-block total and data codeword counts. */
function blockLayout(version: number, ecc: QrEcc): { total: number; data: number }[] {
  const entry = RS_BLOCK_TABLE[version - 1][['L', 'M', 'Q', 'H'].indexOf(ecc)];
  const blocks: { total: number; data: number }[] = [];
  for (let i = 0; i < entry.length; i += 3) {
    for (let n = 0; n < entry[i]; n++) blocks.push({ total: entry[i + 1], data: entry[i + 2] });
  }
  return blocks;
}

/** Total data codewords available, which is what bounds the payload. */
const dataCapacity = (version: number, ecc: QrEcc): number =>
  blockLayout(version, ecc).reduce((n, b) => n + b.data, 0);

/** Character-count indicator width for byte mode. */
const countBits = (version: number): number => (version < 10 ? 8 : 16);

/** Builds the final data codeword stream, including terminator and padding. */
function buildCodewords(bytes: number[], version: number, ecc: QrEcc): number[] {
  const capacity = dataCapacity(version, ecc);
  const bits: number[] = [];
  const push = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };

  push(0b0100, 4); // byte mode
  push(bytes.length, countBits(version));
  for (const b of bytes) push(b, 8);

  // Terminator of up to four zero bits, never past capacity.
  for (let i = 0; i < 4 && bits.length < capacity * 8; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  // Alternating pad codewords fill whatever capacity is left over.
  const PADS = [0xec, 0x11];
  for (let i = 0; codewords.length < capacity; i++) codewords.push(PADS[i % 2]);
  return codewords;
}

/** Splits into blocks, appends EC to each, then interleaves both halves. */
function interleave(codewords: number[], version: number, ecc: QrEcc): number[] {
  const blocks = blockLayout(version, ecc);
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (const b of blocks) {
    const chunk = codewords.slice(offset, offset + b.data);
    offset += b.data;
    dataBlocks.push(chunk);
    ecBlocks.push(ecCodewords(chunk, b.total - b.data));
  }

  const out: number[] = [];
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) {
    for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
  }
  const maxEc = Math.max(...ecBlocks.map((b) => b.length));
  for (let i = 0; i < maxEc; i++) {
    for (const block of ecBlocks) if (i < block.length) out.push(block[i]);
  }
  return out;
}

// ---------------------------------------------------------------- matrix

type Matrix = { size: number; modules: boolean[][]; reserved: boolean[][] };

/** Builds the module grid with every function pattern marked as reserved. */
function buildMatrix(version: number): Matrix {
  const size = version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  const set = (r: number, c: number, dark: boolean) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    modules[r][c] = dark;
    reserved[r][c] = true;
  };

  // Finder patterns and their separators, at three corners.
  const finder = (br: number, bc: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const inner = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const dark =
          inner &&
          ((dr === 0 || dr === 6 || dc === 0 || dc === 6) ||
            (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        set(br + dr, bc + dc, dark);
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  // Alignment patterns, skipping the three that would collide with a finder.
  const centres = ALIGNMENT[version - 1];
  for (const r of centres) {
    for (const c of centres) {
      const nearFinder =
        (r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8);
      if (nearFinder) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }

  // Reserve the format-information strips; real values are written later.
  for (let i = 0; i < 9; i++) {
    if (!reserved[8][i]) set(8, i, false);
    if (!reserved[i][8]) set(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    if (!reserved[8][size - 1 - i]) set(8, size - 1 - i, false);
    if (!reserved[size - 1 - i][8]) set(size - 1 - i, 8, false);
  }
  // The module that is always dark.
  set(size - 8, 8, true);

  // Version information blocks, for versions 7 and up.
  if (version >= 7) {
    const info = versionInfo(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((info >> i) & 1) === 1;
      const r = Math.floor(i / 3);
      const c = size - 11 + (i % 3);
      set(r, c, dark);
      set(c, r, dark);
    }
  }

  return { size, modules, reserved };
}

/** BCH(18,6) version information, generator 0x1f25. */
function versionInfo(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1f25);
  return (version << 12) | rem;
}

/** BCH(15,5) format information, generator 0x537, masked with 0x5412. */
function formatInfo(ecc: QrEcc, mask: number): number {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** Places the data bit stream in the standard two-module zigzag. */
function placeData(m: Matrix, data: number[]) {
  let bitIndex = 0;
  let upward = true;
  for (let right = m.size - 1; right > 0; right -= 2) {
    // Column 6 is the vertical timing pattern, so the pair steps left past it.
    if (right === 6) right = 5;
    for (let step = 0; step < m.size; step++) {
      const row = upward ? m.size - 1 - step : step;
      for (const col of [right, right - 1]) {
        if (m.reserved[row][col]) continue;
        // Any remainder bits past the end of the stream stay light.
        const dark =
          bitIndex < data.length * 8 ? (data[bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1 : 0;
        m.modules[row][col] = dark === 1;
        bitIndex++;
      }
    }
    upward = !upward;
  }
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** ISO/IEC 18004 penalty scoring, rules 1 to 4. Lower is better. */
function penalty(m: Matrix): number {
  const { size, modules } = m;
  let score = 0;

  // Rule 1: runs of five or more modules of the same colour in a line.
  for (let i = 0; i < size; i++) {
    for (const horizontal of [true, false]) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        const cur = horizontal ? modules[i][j] : modules[j][i];
        const prev = horizontal ? modules[i][j - 1] : modules[j - 1][i];
        if (cur === prev) {
          run++;
        } else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      if (run >= 5) score += run - 2;
    }
  }

  // Rule 2: 2x2 blocks of a single colour.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) {
        score += 3;
      }
    }
  }

  // Rule 3: finder-like 1:1:3:1:1 patterns with four light modules beside them.
  const A = [true, false, true, true, true, false, true, false, false, false, false];
  const B = [false, false, false, false, true, false, true, true, true, false, true];
  const matches = (get: (k: number) => boolean, start: number, pattern: boolean[]) => {
    for (let k = 0; k < pattern.length; k++) if (get(start + k) !== pattern[k]) return false;
    return true;
  };
  for (let i = 0; i < size; i++) {
    for (let j = 0; j <= size - 11; j++) {
      const row = (k: number) => modules[i][k];
      const col = (k: number) => modules[k][i];
      if (matches(row, j, A) || matches(row, j, B)) score += 40;
      if (matches(col, j, A) || matches(col, j, B)) score += 40;
    }
  }

  // Rule 4: deviation from a 50% dark ratio.
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (modules[r][c]) dark++;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

/** Writes the format information into both of its positions. */
function writeFormat(m: Matrix, ecc: QrEcc, mask: number) {
  const { size, modules } = m;
  const bits = formatInfo(ecc, mask);
  // Format information is placed most-significant-bit first: the module at the
  // start of each strip carries bit 14, not bit 0.
  const bit = (position: number) => ((bits >> (14 - position)) & 1) === 1;

  for (let i = 0; i <= 5; i++) modules[8][i] = bit(i);
  modules[8][7] = bit(6);
  modules[8][8] = bit(7);
  modules[7][8] = bit(8);
  for (let i = 9; i <= 14; i++) modules[14 - i][8] = bit(i);

  // Second copy: seven bits down the left column, the always-dark module,
  // then eight bits across the top row. The vertical run deliberately stops
  // short of the dark module, which is why it is 0..6 and not 0..7.
  for (let i = 0; i <= 6; i++) modules[size - 1 - i][8] = bit(i);
  for (let i = 7; i <= 14; i++) modules[8][size - 15 + i] = bit(i);
  modules[size - 8][8] = true;
}

export type QrMatrix = { size: number; modules: boolean[][]; version: number; ecc: QrEcc };

/**
 * Encodes text as a QR matrix, returning the grid plus the version and
 * error-correction level actually used.
 */
export function encodeQr(text: string, ecc: QrEcc = 'M'): QrMatrix {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code > 0xff) {
      throw new Error('QR payload must be Latin-1; got a non-Latin-1 character.');
    }
    bytes.push(code);
  }

  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const needed = 4 + countBits(v) + bytes.length * 8;
    if (needed <= dataCapacity(v, ecc) * 8) {
      version = v;
      break;
    }
  }
  if (version === 0) {
    throw new Error(`QR payload too long: ${bytes.length} bytes exceeds version 10 at level ${ecc}.`);
  }

  const data = interleave(buildCodewords(bytes, version, ecc), version, ecc);

  // Try every mask and keep the least-penalised, as the spec requires.
  let best: Matrix | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = buildMatrix(version);
    placeData(m, data);
    for (let r = 0; r < m.size; r++) {
      for (let c = 0; c < m.size; c++) {
        if (!m.reserved[r][c] && MASKS[mask](r, c)) m.modules[r][c] = !m.modules[r][c];
      }
    }
    writeFormat(m, ecc, mask);
    const score = penalty(m);
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  if (!best) throw new Error('QR encoding failed.');
  return { size: best.size, modules: best.modules, version, ecc };
}

/**
 * Renders a QR matrix as a single SVG path of unit squares. One path for all
 * dark modules keeps the DOM small enough to paint instantly on a phone,
 * which matters because this is the code someone holds up to an admin.
 */
export function qrSvgPath(text: string, ecc: QrEcc = 'M'): { path: string; size: number } {
  const qr = encodeQr(text, ecc);
  const parts: string[] = [];
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (qr.modules[r][c]) parts.push(`M${c} ${r}h1v1h-1z`);
    }
  }
  return { path: parts.join(''), size: qr.size };
}