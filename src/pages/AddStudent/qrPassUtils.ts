import QRCode from 'qrcode'

export interface QrMatrix {
  size: number
  isDark(row: number, col: number): boolean
  isFinder(row: number, col: number): boolean
  isCenterHole(row: number, col: number): boolean
}

export const FINDER_SIZE = 7

// A QR code needs a blank "quiet zone" around its modules for a scanner to detect it at all —
// without one, decoding fails outright regardless of how correct the module data is. 4 modules
// is the spec-recommended minimum; callers must reserve this many extra modules of margin on
// every side when sizing/positioning the drawn grid.
export const QUIET_ZONE = 4

// Center hole side length as a fraction of the grid's side length. Verified empirically (see
// generatePassPdf's scan test): a hole covering more than ~22% of the side length (~5% of the
// QR's area) started failing to decode even at error-correction level H, well short of the
// theoretical ~20-25% ceiling — so this is kept well under that observed failure point.
const CENTER_HOLE_FRACTION = 0.18

function isFinderCell(row: number, col: number, size: number): boolean {
  const inCorner = (r: number, c: number) => row >= r && row < r + FINDER_SIZE && col >= c && col < c + FINDER_SIZE
  return inCorner(0, 0) || inCorner(0, size - FINDER_SIZE) || inCorner(size - FINDER_SIZE, 0)
}

/** 0-indexed {row, col} of each finder pattern's top-left cell, for a QR of the given size. */
export function getFinderOrigins(size: number): { row: number; col: number }[] {
  return [
    { row: 0, col: 0 },
    { row: 0, col: size - FINDER_SIZE },
    { row: size - FINDER_SIZE, col: 0 },
  ]
}

/** 0-indexed bounding box of the open square reserved for the center logo mark. */
export function getCenterHoleBounds(size: number): { start: number; size: number } {
  const holeSize = Math.round(size * CENTER_HOLE_FRACTION)
  const start = Math.floor((size - holeSize) / 2)
  return { start, size: holeSize }
}

function isCenterCell(row: number, col: number, size: number): boolean {
  const { start, size: holeSize } = getCenterHoleBounds(size)
  return row >= start && row < start + holeSize && col >= start && col < start + holeSize
}

/**
 * Builds a real, scannable QR code encoding the pass's raw token — never the student number
 * (that used to be the encoded value, which meant anyone who knew or guessed an ID could mint a
 * working pass without any database access) and deliberately never a URL either. A bare token has
 * no scheme, no domain, nothing for a generic camera app or Google Lens to treat as a clickable
 * link — it's just inert text unless read by the Staff Scanner, which looks it up against
 * `passes.token` directly. It also keeps the QR at a lower version (fewer, larger modules), which
 * scans far more reliably at small on-screen/print sizes and after a center logo hole is cut in.
 *
 * Built at error-correction level H (~30% recoverable), which is what makes it safe to obscure
 * the center for a logo. This is a genuine QR symbol from the `qrcode` library, not a decorative
 * approximation — `isDark` reflects the actual (masked) module data a scanner reads.
 */
export function buildPassQr(token: string): QrMatrix {
  const { modules } = QRCode.create(token, { errorCorrectionLevel: 'H' })
  const size = modules.size
  return {
    size,
    isDark: (row, col) => modules.get(row, col) === 1,
    isFinder: (row, col) => isFinderCell(row, col, size),
    isCenterHole: (row, col) => isCenterCell(row, col, size),
  }
}
