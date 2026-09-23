import type jsPDF from 'jspdf'
import fusionLogoUrl from '../../assets/fusion_logo_exact_transparent.png'
import { buildPassQr, getFinderOrigins, getCenterHoleBounds, FINDER_SIZE, QUIET_ZONE } from '../AddStudent/qrPassUtils'
import type { Student } from '../StudentDirectory/studentDirectoryData'

interface LoadedImage {
  dataUrl: string
  aspect: number
}

// Downscales to `maxWidthPx` before encoding — the source logo is a high-res 1850x600 PNG, but
// every placement in this PDF prints under 100pt wide, so embedding it at native resolution
// (three times over) would bloat the file for no visible gain.
function loadImage(src: string, maxWidthPx = 360): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidthPx / img.naturalWidth)
      const width = Math.round(img.naturalWidth * scale)
      const height = Math.round(img.naturalHeight * scale)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      resolve({ dataUrl: canvas.toDataURL('image/png'), aspect: img.naturalWidth / img.naturalHeight })
    }
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}

type Rgb = [number, number, number]

const NAVY: Rgb = [18, 40, 74]
const TEAL: Rgb = [13, 148, 136]
const AMBER: Rgb = [244, 180, 0]
const AMBER_BG: Rgb = [255, 243, 214]
const AMBER_BORDER: Rgb = [250, 214, 137]
const AMBER_TEXT: Rgb = [179, 121, 10]
const GREEN_BG: Rgb = [225, 248, 236]
const GREEN_TEXT: Rgb = [21, 154, 86]
const RED_BG: Rgb = [253, 232, 232]
const RED_TEXT: Rgb = [209, 69, 61]
const GRAY: Rgb = [107, 122, 148]
const GRAY_LIGHT: Rgb = [154, 166, 186]
const BORDER: Rgb = [238, 246, 245]
const WHITE: Rgb = [255, 255, 255]

const PAGE_W = 420
const PAGE_H = 640
const MARGIN = 36

/**
 * Generates and downloads a Fusion Pass PDF for the given student. The QR encodes the pass's
 * real random token from the `passes` table, which the caller supplies — never the student's
 * ID number, which would be trivially forgeable.
 */
export async function generatePassPdf(student: Student, passToken: string): Promise<void> {
  // Loaded on demand so jsPDF (and its optional plugins) don't weigh down every other page —
  // only the moment an admin actually clicks Download pulls this in.
  const [{ default: JsPDF }, logo] = await Promise.all([import('jspdf'), loadImage(fusionLogoUrl)])
  const doc = new JsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H] })

  drawPassPage(doc, student, passToken, logo)
  doc.addPage([PAGE_W, PAGE_H])
  drawInstructionsPage(doc, logo)

  doc.save(`${student.id}-fusion-pass.pdf`)
}

function drawPassPage(doc: jsPDF, student: Student, passToken: string, logo: LoadedImage) {
  doc.setFillColor(...WHITE)
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F')

  // Header: logo left, "How to use" link right (jumps to the instructions page)
  const logoW = 92
  const logoH = logoW / logo.aspect
  doc.addImage(logo.dataUrl, 'PNG', MARGIN, MARGIN, logoW, logoH)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(...TEAL)
  const linkLabel = 'How to use your Fusion Pass?'
  const linkY = MARGIN + logoH / 2 + 3
  doc.text(linkLabel, PAGE_W - MARGIN, linkY, { align: 'right' })
  const linkW = doc.getTextWidth(linkLabel)
  doc.link(PAGE_W - MARGIN - linkW, linkY - 9, linkW, 12, { pageNumber: 2 })

  // Welcome heading
  let y = MARGIN + logoH + 28
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19)
  doc.setTextColor(...NAVY)
  doc.text(`Welcome, ${student.fullName}!`, MARGIN, y)

  // Card
  y += 24
  const cardX = MARGIN
  const cardW = PAGE_W - MARGIN * 2
  const cardH = 152
  doc.setDrawColor(...BORDER)
  doc.setFillColor(...WHITE)
  doc.roundedRect(cardX, y, cardW, cardH, 12, 12, 'FD')

  const pad = 20
  const qrSize = 108
  const qrX = cardX + pad
  const qrY = y + pad
  drawQr(doc, qrX, qrY, qrSize, passToken, logo)

  const colX = qrX + qrSize + 20
  let cy = qrY + 4

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...NAVY)
  doc.text('Fusion Pass', colX, cy)
  cy += 15

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  doc.text('Personal event check-in pass', colX, cy)
  cy += 20

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12.5)
  doc.setTextColor(...NAVY)
  doc.text(student.fullName, colX, cy)
  cy += 15

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(...GRAY)
  doc.text(student.id, colX, cy)
  cy += 14

  doc.setFontSize(9)
  doc.setTextColor(...GRAY_LIGHT)
  doc.text('Student • University of Windsor', colX, cy)
  cy += 16

  const revoked = student.passStatus === 'Revoked'
  const badgeBg = revoked ? RED_BG : GREEN_BG
  const badgeText = revoked ? RED_TEXT : GREEN_TEXT
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  const badgeLabel = student.passStatus
  const badgeW = doc.getTextWidth(badgeLabel) + 16
  const badgeH = 16
  doc.setFillColor(...badgeBg)
  doc.roundedRect(colX, cy - 11, badgeW, badgeH, 8, 8, 'F')
  doc.setTextColor(...badgeText)
  doc.text(badgeLabel, colX + badgeW / 2, cy, { align: 'center' })

  // Below the card
  y += cardH + 26
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  const needHelpPrefix = 'Need help using your pass? '
  const needHelpLink = 'View the instructions.'
  doc.text(needHelpPrefix, MARGIN, y)
  const prefixW = doc.getTextWidth(needHelpPrefix)
  doc.setTextColor(...TEAL)
  doc.setFont('helvetica', 'bold')
  doc.text(needHelpLink, MARGIN + prefixW, y)
  const helpLinkW = doc.getTextWidth(needHelpLink)
  doc.link(MARGIN + prefixW, y - 9, helpLinkW, 12, { pageNumber: 2 })

  // Callout
  y += 20
  const calloutH = 56
  doc.setFillColor(...AMBER_BG)
  doc.setDrawColor(...AMBER_BORDER)
  doc.roundedRect(MARGIN, y, cardW, calloutH, 10, 10, 'FD')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...AMBER_TEXT)
  const calloutText = doc.splitTextToSize(
    'Keep your Fusion Pass safe — if you lose it, contact the Fusion team to have your pass reissued.',
    cardW - 28,
  )
  doc.text(calloutText, MARGIN + 14, y + 18)

  // Footer
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...GRAY_LIGHT)
  const generatedOn = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
  doc.text(`Generated ${generatedOn} · Fusion Check-In`, PAGE_W / 2, PAGE_H - 24, { align: 'center' })
}

function drawQr(doc: jsPDF, x: number, y: number, size: number, passToken: string, logo: LoadedImage) {
  const qr = buildPassQr(passToken)
  // A QR code needs a blank quiet-zone margin around its modules to be detected at all, so the
  // module grid is sized to leave QUIET_ZONE modules of margin on every side within `size`.
  const cellSize = size / (qr.size + QUIET_ZONE * 2)
  const originX = x + QUIET_ZONE * cellSize
  const originY = y + QUIET_ZONE * cellSize

  doc.setDrawColor(...BORDER)
  doc.setFillColor(...WHITE)
  doc.roundedRect(x, y, size, size, 6, 6, 'FD')

  // Ordinary modules — the three finder corners are skipped here and drawn as concentric rounded
  // rings below instead of sharp-cornered cells, and the center hole is left blank for the logo.
  doc.setFillColor(...NAVY)
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (qr.isFinder(row, col) || qr.isCenterHole(row, col)) continue
      if (!qr.isDark(row, col)) continue
      doc.rect(originX + col * cellSize, originY + row * cellSize, cellSize - 0.4, cellSize - 0.4, 'F')
    }
  }

  // Rounded, branded finder "eye" markers — navy ring, white gap, yellow center — one per corner.
  // The 1:1:3:1:1 dark/light/dark proportions of a real finder pattern are preserved; only the
  // corner rounding and center color are decorative.
  for (const origin of getFinderOrigins(qr.size)) {
    const ox = originX + origin.col * cellSize
    const oy = originY + origin.row * cellSize
    const ring = (insetCells: number, spanCells: number, color: Rgb) => {
      const s = cellSize * spanCells
      doc.setFillColor(...color)
      doc.roundedRect(ox + cellSize * insetCells, oy + cellSize * insetCells, s, s, s * 0.22, s * 0.22, 'F')
    }
    ring(0, FINDER_SIZE, NAVY)
    ring(1, FINDER_SIZE - 2, WHITE)
    ring(2, FINDER_SIZE - 4, AMBER)
  }

  // Center logo mark, sized to the same open square the module grid leaves blank.
  const hole = getCenterHoleBounds(qr.size)
  const holePx = hole.size * cellSize
  const markSize = holePx * 0.82
  const markH = markSize / logo.aspect
  const holeCenterX = originX + (hole.start + hole.size / 2) * cellSize
  const holeCenterY = originY + (hole.start + hole.size / 2) * cellSize
  doc.addImage(logo.dataUrl, 'PNG', holeCenterX - markSize / 2, holeCenterY - markH / 2, markSize, markH)
}

function drawInstructionsPage(doc: jsPDF, logo: LoadedImage) {
  doc.setFillColor(...WHITE)
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F')

  const logoW = 76
  const logoH = logoW / logo.aspect
  doc.addImage(logo.dataUrl, 'PNG', MARGIN, MARGIN, logoW, logoH)

  let y = MARGIN + logoH + 30
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.setTextColor(...NAVY)
  doc.text('How to use your Fusion Pass', MARGIN, y)

  y += 26
  const bullets = [
    "This QR code is your one Fusion Pass — the same code works for check-in at every eligible Fusion event you're registered for, not just one.",
    'At the event, show this PDF (or the QR code on it) to check-in staff so they can scan you in.',
    "Don't generate a new pass for each event — always use this same code.",
    'Lost, stolen, or damaged your pass? Contact the Fusion team and ask them to reissue it — this deactivates the old code and issues you a fresh one.',
  ]

  const bodyWidth = PAGE_W - MARGIN * 2 - 18
  for (const bullet of bullets) {
    doc.setFillColor(...TEAL)
    doc.circle(MARGIN + 3, y - 3.5, 2.4, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...NAVY)
    const lines: string[] = doc.splitTextToSize(bullet, bodyWidth)
    doc.text(lines, MARGIN + 16, y)
    y += lines.length * 14 + 14
  }

  y += 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(...TEAL)
  // jsPDF's standard fonts only support WinAnsi encoding, which has no left-arrow glyph —
  // use the WinAnsi-safe left angle quote instead of a true Unicode arrow.
  const backLabel = '« Back to your pass'
  doc.text(backLabel, MARGIN, y)
  const backW = doc.getTextWidth(backLabel)
  doc.link(MARGIN, y - 9, backW, 12, { pageNumber: 1 })
}
