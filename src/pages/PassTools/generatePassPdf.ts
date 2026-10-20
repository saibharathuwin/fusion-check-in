import type jsPDF from 'jspdf'
import fusionLogoUrl from '../../assets/fusion_logo.png'
import fusionMarkUrl from '../../assets/flogo.png'
import { buildPassQr, getFinderOrigins, getCenterHoleBounds, FINDER_SIZE, QUIET_ZONE } from '../AddStudent/qrPassUtils'
import type { Student } from '../StudentDirectory/studentDirectoryData'

interface LoadedImage {
  dataUrl: string
  aspect: number
}

// Downscales to `maxWidthPx` before encoding — the source logo is a high-res PNG, but every
// placement in this PDF prints well under 200pt wide, so embedding it at native resolution would
// bloat the file for no visible gain.
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
const NAVY_DEEP: Rgb = [13, 27, 51] // page 2's full-bleed background — a touch richer/darker than the text navy
const GOLD: Rgb = [244, 180, 0]
const GOLD_DEEP: Rgb = [214, 155, 0] // the darker of the two swoosh layers on page 2
const AMBER_BG: Rgb = [255, 243, 214]
const AMBER_BORDER: Rgb = [250, 214, 137]
const AMBER_TEXT: Rgb = [179, 121, 10]
const RED_BG: Rgb = [253, 232, 232]
const RED_TEXT: Rgb = [209, 69, 61]
const GRAY: Rgb = [107, 122, 148]
const GRAY_LIGHT: Rgb = [154, 166, 186]
const BORDER: Rgb = [230, 236, 242]
const PILL_BG: Rgb = [231, 238, 245]
const DETAILS_BG: Rgb = [247, 249, 251]
const WHITE: Rgb = [255, 255, 255]

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 44

// Spaces and anything unsafe for a filename become underscores — a middle name or an accented
// character shouldn't produce a broken or ugly download name. The Fusion ID suffix (when known) is
// what actually guarantees uniqueness now that student_number is optional — two students who share
// a name would otherwise produce the exact same filename.
export function passFileName(student: Student, fusionId?: string | null): string {
  const fileSafeName = `${student.firstName}_${student.lastName}`.trim().replace(/[^a-zA-Z0-9]+/g, '_')
  const suffix = fusionId ? `_${fusionId}` : ''
  return `${fileSafeName}${suffix}-fusion-pass.pdf`
}

// Builds the actual document — shared by a single download and the bulk "Download all passes"
// ZIP export below. The only difference between the two is what happens to the finished PDF:
// saved straight to disk, or added to an in-memory zip instead.
async function buildPassDoc(student: Student, passToken: string): Promise<jsPDF> {
  // Loaded on demand so jsPDF (and its optional plugins) don't weigh down every other page —
  // only the moment an admin actually clicks Download pulls this in.
  const [{ default: JsPDF }, logo, mark] = await Promise.all([import('jspdf'), loadImage(fusionLogoUrl), loadImage(fusionMarkUrl)])
  const doc = new JsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H] })

  drawWelcomePage(doc, student, logo)
  doc.addPage([PAGE_W, PAGE_H])
  drawPassPage(doc, passToken, mark)
  return doc
}

/**
 * Generates and downloads a Fusion Pass PDF for the given student. The QR encodes the pass's
 * real random token from the `passes` table, which the caller supplies — never the student's
 * ID number, which would be trivially forgeable.
 */
export async function generatePassPdf(student: Student, passToken: string, fusionId?: string | null): Promise<void> {
  const doc = await buildPassDoc(student, passToken)
  doc.save(passFileName(student, fusionId))
}

// Same PDF as generatePassPdf, returned as a Blob instead of triggering its own browser download
// — used by the bulk "Download all passes" ZIP export, which needs every student's PDF in memory
// before bundling them together into one file.
export async function generatePassPdfBlob(student: Student, passToken: string): Promise<Blob> {
  const doc = await buildPassDoc(student, passToken)
  return doc.output('blob')
}

// Names come from whatever case they were originally entered in — most are typed properly
// capitalized, but a few (an older direct-SQL insert, say, or a CSV import) ended up all-lowercase
// in storage, e.g. "naga sai bharath potla". Rather than trust storage, this pass always displays
// a name in proper Title Case regardless of how it's actually stored, hyphenated names included
// ("Jean-Luc" stays two capitalized halves, not "Jean-luc").
function toTitleCase(value: string): string {
  return value.replace(/[^\s-]+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
}

// Small pill badge shared by both pages' top-right corner.
function drawFusionPassPill(doc: jsPDF, rightX: number, y: number) {
  const label = 'FUSION PASS'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  const textW = doc.getTextWidth(label)
  const padX = 14
  const w = textW + padX * 2
  const h = 22
  doc.setFillColor(...GOLD)
  doc.roundedRect(rightX - w, y, w, h, h / 2, h / 2, 'F')
  doc.setTextColor(...NAVY)
  doc.text(label, rightX - w / 2, y + h / 2 + 3.5, { align: 'center' })
}

function numberedStep(doc: jsPDF, x: number, y: number, w: number, n: number, text: string) {
  const circleR = 11
  doc.setFillColor(...NAVY)
  doc.circle(x + circleR, y + circleR, circleR, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(...WHITE)
  doc.text(String(n), x + circleR, y + circleR + 3.7, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...NAVY)
  const lines: string[] = doc.splitTextToSize(text, w - circleR * 2 - 12)
  doc.text(lines, x + circleR * 2 + 12, y + 9)
  return Math.max(circleR * 2, lines.length * 12.5)
}

function drawWelcomePage(doc: jsPDF, student: Student, logo: LoadedImage) {
  doc.setFillColor(...WHITE)
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F')

  // Header — wordmark left, FUSION PASS pill right, navy rule underneath.
  const logoW = 118
  const logoH = logoW / logo.aspect
  doc.addImage(logo.dataUrl, 'PNG', MARGIN, MARGIN, logoW, logoH)
  drawFusionPassPill(doc, PAGE_W - MARGIN, MARGIN + logoH / 2 - 11)

  let y = MARGIN + Math.max(logoH, 22) + 18
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(1.4)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)

  // Welcome heading.
  y += 44
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(23)
  doc.setTextColor(...NAVY)
  doc.text(`Welcome to Fusion, ${toTitleCase(student.firstName)}!`, MARGIN, y)

  y += 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(...GRAY)
  const introLines: string[] = doc.splitTextToSize(
    'You are now registered with Fusion. This document contains your Fusion Pass, a personal QR code that you will use to check in to Fusion events, workshops and programs.',
    PAGE_W - MARGIN * 2,
  )
  doc.text(introLines, MARGIN, y)
  y += introLines.length * 14 + 16

  // "About Fusion" card.
  const cardX = MARGIN
  const cardW = PAGE_W - MARGIN * 2
  const cardPad = 18
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  const aboutTitleH = 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  const aboutLines: string[] = doc.splitTextToSize(
    "Fusion is the University of Windsor's central network for innovation and entrepreneurship. Its mission is to unlock the entrepreneurial spirit and leadership of our campus and region, and to help students, researchers and community members build a more innovative, inclusive and economically vibrant Windsor-Essex.",
    cardW - cardPad * 2,
  )
  const aboutBodyH = aboutLines.length * 13
  const pillLabels = ['Academic & Curriculum Integration', 'Programs & Student Experience', 'Startup & R&D Supports']
  const pillH = 20
  const findUsH = 14
  const learnMoreH = 14
  const cardH = cardPad + aboutTitleH + 8 + aboutBodyH + 14 + pillH + 14 + findUsH + 6 + learnMoreH + cardPad

  doc.setDrawColor(...BORDER)
  doc.setLineWidth(1)
  doc.setFillColor(...WHITE)
  doc.roundedRect(cardX, y, cardW, cardH, 12, 12, 'FD')

  let cy = y + cardPad + aboutTitleH - 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...NAVY)
  doc.text('About Fusion', cardX + cardPad, cy)

  cy += 8 + 12
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...GRAY)
  doc.text(aboutLines, cardX + cardPad, cy)
  cy += aboutBodyH + 12

  let px = cardX + cardPad
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  for (const label of pillLabels) {
    const w = doc.getTextWidth(label) + 20
    doc.setFillColor(...PILL_BG)
    doc.roundedRect(px, cy - 14, w, pillH, pillH / 2, pillH / 2, 'F')
    doc.setTextColor(...NAVY)
    doc.text(label, px + w / 2, cy - 1, { align: 'center' })
    px += w + 8
  }
  cy += pillH - 6 + 12

  // Both lines below are real clickable links in the PDF (doc.textWithLink) — no underline, kept
  // the same plain gray as the rest of the card's body text.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(...NAVY)
  const findUsLabel = 'Find us: '
  doc.text(findUsLabel, cardX + cardPad, cy)
  const findUsLabelW = doc.getTextWidth(findUsLabel)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY)
  const addressText = 'Fusion Reactor, second floor of the Joyce Entrepreneurship Centre'
  const addressX = cardX + cardPad + findUsLabelW
  // Links to the university's own campus address (2455 Wyandotte St W, Windsor, ON N9B 3P4) —
  // that's campus center, not literally the Joyce Entrepreneurship Centre itself, but it's the
  // address Google Maps actually resolves "University of Windsor" to.
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('2455 Wyandotte St W, Windsor, ON N9B 3P4')}`
  doc.textWithLink(addressText, addressX, cy, { url: mapsUrl })

  cy += learnMoreH + 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(...NAVY)
  // Plain ASCII only — the arrow character tried before rendered as garbage glyphs, since jsPDF's
  // base "helvetica" font doesn't have that character.
  const learnMoreText = 'Learn more about Fusion, click here'
  doc.textWithLink(learnMoreText, cardX + cardPad, cy, { url: 'https://www.uwindsor.ca/fusion/' })

  y += cardH + 16

  // Student details box. Every field is measured and wrapped to its column's real width BEFORE
  // anything is drawn — a longer faculty name ("Schulich School of Medicine and Dentistry –
  // Windsor Campus") easily runs past a single line, and drawing it unwrapped let it run straight
  // out the bottom of the box into the heading below. Same class of bug as the numbered-steps
  // overlap below, same fix: measure first, size the box from that, then draw.
  const detailsPad = 18
  const colGap = 14
  // Two columns, not three — Student ID is deliberately left off the printed pass, so Full name
  // and Email split the row evenly instead of leaving a gap where it used to sit.
  const col1 = cardX + detailsPad
  const col2 = cardX + detailsPad + cardW / 2
  const row1ColW = cardW / 2 - colGap

  // Row 2 is Faculty alone, spanning the full width now that Issued on is gone — it still needs
  // wrapping since a longer faculty name ("Schulich School of Medicine and Dentistry – Windsor
  // Campus") can run well past a single line even at the full card width.
  const facultyColW = cardW - detailsPad * 2
  const facultyValue = student.faculty || 'Faculty pending'
  const fullNameDisplay = toTitleCase(student.fullName)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  const measure = (value: string, maxW: number) => (doc.splitTextToSize(value, maxW) as string[]).length
  const detailsRow1Lines = Math.max(measure(fullNameDisplay, row1ColW), measure(student.email, row1ColW))
  const detailsRow2Lines = measure(facultyValue, facultyColW)

  const labelToValueGap = 15
  const lineH = 13
  const detailsRow1H = labelToValueGap + detailsRow1Lines * lineH
  const detailsRow2H = labelToValueGap + detailsRow2Lines * lineH
  const detailsH = detailsPad + 10 + detailsRow1H + 12 + detailsRow2H + detailsPad - 3

  doc.setFillColor(...DETAILS_BG)
  doc.roundedRect(cardX, y, cardW, detailsH, 12, 12, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  doc.text('STUDENT DETAILS', cardX + detailsPad, y + detailsPad + 2)

  const passRevoked = student.passStatus === 'Revoked'
  const revokedLabel = 'Pass revoked'
  if (passRevoked) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    const w = doc.getTextWidth(revokedLabel) + 16
    const bh = 15
    const bx = cardX + cardW - detailsPad - w
    const by = y + detailsPad - 10
    doc.setFillColor(...RED_BG)
    doc.roundedRect(bx, by, w, bh, bh / 2, bh / 2, 'F')
    doc.setTextColor(...RED_TEXT)
    doc.text(revokedLabel, bx + w / 2, by + bh / 2 + 2.8, { align: 'center' })
  }

  function field(label: string, value: string, fx: number, fy: number, maxW: number) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...GRAY)
    doc.text(label, fx, fy)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...NAVY)
    const lines: string[] = doc.splitTextToSize(value, maxW)
    doc.text(lines, fx, fy + labelToValueGap)
  }

  const row1Y = y + detailsPad + 26
  field('Full name', fullNameDisplay, col1, row1Y, row1ColW)
  field('Email', student.email, col2, row1Y, row1ColW)

  const row2Y = row1Y + detailsRow1H + 10
  field('Faculty', facultyValue, col1, row2Y, facultyColW)

  y += detailsH + 18

  // "How to use your Fusion Pass" — 2x2 grid of numbered steps.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...NAVY)
  doc.text('How to use your Fusion Pass', MARGIN, y)
  y += 18

  const stepColW = (cardW - 24) / 2
  const steps = [
    'Save this PDF to your phone, or print page 2 and keep it with you.',
    'When you arrive at a Fusion event, go to the check-in kiosk or find a member of the Fusion team.',
    'Open your Fusion Pass on page 2 and hold the QR code in front of the scanner.',
    'Wait for the confirmation on the screen. Your attendance is then recorded automatically.',
  ]

  // Both rows' real heights have to be known BEFORE drawing anything below them — a fixed guessed
  // gap here is exactly what let the "Good to know" box overlap step 3/4 whenever their text
  // wrapped to 2 lines (which it does): measure each step's wrapped line count up front, and size
  // each row from its own tallest cell rather than assuming every step fits on one line.
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  const stepLineCounts = steps.map((text) => (doc.splitTextToSize(text, stepColW - 34) as string[]).length)
  const rowHeight = (row: number) => Math.max(22, stepLineCounts[row * 2] * 12.5, stepLineCounts[row * 2 + 1] * 12.5)
  const row0H = rowHeight(0)
  const row1H = rowHeight(1)

  numberedStep(doc, MARGIN, y, stepColW, 1, steps[0])
  numberedStep(doc, MARGIN + stepColW + 24, y, stepColW, 2, steps[1])
  y += row0H + 14
  numberedStep(doc, MARGIN, y, stepColW, 3, steps[2])
  numberedStep(doc, MARGIN + stepColW + 24, y, stepColW, 4, steps[3])
  y += row1H + 16

  // "Good to know" amber callout.
  const knowPad = 18
  const knowBullets = [
    'Your Fusion Pass is personal. Please do not share it or let anyone else check in with it.',
    'You can use the same pass for every Fusion event, so you do not need a new one each time.',
    'If the scanner cannot read your code, turn up your screen brightness and try again.',
    'If you lose your pass or any of your details are incorrect, please contact the Fusion team at fusion@uwindsor.ca.',
  ]
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const bulletLineSets = knowBullets.map((b) => doc.splitTextToSize(b, cardW - knowPad * 2 - 14) as string[])
  const knowTitleH = 18
  const bulletsH = bulletLineSets.reduce((sum, lines) => sum + lines.length * 12.5 + 5, 0)
  const knowH = knowPad + knowTitleH + bulletsH + knowPad - 5

  doc.setFillColor(...AMBER_BG)
  doc.setDrawColor(...AMBER_BORDER)
  doc.setLineWidth(1)
  doc.roundedRect(MARGIN, y, cardW, knowH, 12, 12, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...AMBER_TEXT)
  doc.text('Good to know', MARGIN + knowPad, y + knowPad + 4)

  let by = y + knowPad + knowTitleH + 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  for (const lines of bulletLineSets) {
    doc.setFillColor(...AMBER_TEXT)
    doc.circle(MARGIN + knowPad + 2.5, by - 3, 1.8, 'F')
    doc.setTextColor(...AMBER_TEXT)
    doc.text(lines, MARGIN + knowPad + 12, by)
    by += lines.length * 12.5 + 5
  }

  // Footer — pinned to the traditional bottom-of-page position in the common case, but pushed
  // further down instead of overlapping it if everything above (student details wrapping to an
  // extra line, a long "Good to know" list, etc.) ends up taller than that position allows.
  const footerY = Math.max(y + knowH + 16, PAGE_H - MARGIN + 8)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...GRAY_LIGHT)
  doc.text('Page 1 of 2', PAGE_W - MARGIN, footerY, { align: 'right' })
}

function drawPassPage(doc: jsPDF, passToken: string, mark: LoadedImage) {
  doc.setFillColor(...NAVY_DEEP)
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F')

  drawPageDecoration(doc)

  const qrOuter = 400
  const qrX = (PAGE_W - qrOuter) / 2
  const qrY = (PAGE_H - qrOuter) / 2

  // Two nested rounded borders (navy, then gold) around the white QR card, matching the app's own
  // on-screen QrPassPreview framing.
  doc.setFillColor(...NAVY)
  doc.roundedRect(qrX, qrY, qrOuter, qrOuter, 26, 26, 'F')
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(2)
  doc.roundedRect(qrX + 8, qrY + 8, qrOuter - 16, qrOuter - 16, 20, 20, 'D')
  const innerPad = 22
  doc.setFillColor(...WHITE)
  doc.roundedRect(qrX + innerPad, qrY + innerPad, qrOuter - innerPad * 2, qrOuter - innerPad * 2, 14, 14, 'F')

  const qrSize = qrOuter - innerPad * 2 - 24
  drawQr(doc, qrX + (qrOuter - qrSize) / 2, qrY + (qrOuter - qrSize) / 2, qrSize, passToken, mark)
}

// Full-bleed decorative background — a gold diagonal band flowing in from the top-left, a smaller
// chevron-accented one bottom-right, a dotted grid top-right, and thin circuit-style lines with
// small node circles down each side. Approximated with plain vector shapes rather than exact
// bezier tracing of the reference art; the goal is the same visual language (navy + gold,
// angular/tech accents), not a pixel-identical trace.
function drawPageDecoration(doc: jsPDF) {
  // Top-left swoosh: a wide gold band cutting diagonally across the corner, with a slightly darker
  // gold band layered behind/below it for depth.
  doc.setFillColor(...GOLD_DEEP)
  doc.triangle(0, 0, 230, 0, 0, 190, 'F')
  doc.setFillColor(...GOLD)
  doc.triangle(0, 0, 180, 0, 0, 150, 'F')
  doc.setFillColor(...NAVY_DEEP)
  doc.triangle(0, 0, 130, 0, 0, 108, 'F')

  // Bottom-right swoosh, same idea mirrored, plus a small chevron accent bottom-left.
  doc.setFillColor(...GOLD_DEEP)
  doc.triangle(PAGE_W, PAGE_H, PAGE_W - 210, PAGE_H, PAGE_W, PAGE_H - 170, 'F')
  doc.setFillColor(...GOLD)
  doc.triangle(PAGE_W, PAGE_H, PAGE_W - 160, PAGE_H, PAGE_W, PAGE_H - 130, 'F')
  doc.setFillColor(...NAVY_DEEP)
  doc.triangle(PAGE_W, PAGE_H, PAGE_W - 110, PAGE_H, PAGE_W, PAGE_H - 90, 'F')

  doc.setFillColor(...GOLD)
  doc.triangle(0, PAGE_H, 46, PAGE_H, 0, PAGE_H - 46, 'F')
  doc.setDrawColor(...WHITE)
  doc.setLineWidth(1.5)
  doc.triangle(14, PAGE_H, 54, PAGE_H, 14, PAGE_H - 54, 'D')

  // Circuit-style lines with small node circles, one on each side, roughly mid-height.
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(1)
  const leftY = PAGE_H / 2 + 40
  doc.line(0, leftY, 34, leftY)
  doc.line(34, leftY, 34, leftY - 34)
  doc.circle(34, leftY - 34, 3, 'D')
  doc.circle(0, leftY, 3, 'D')

  const rightY = PAGE_H / 2 - 60
  doc.line(PAGE_W, rightY, PAGE_W - 34, rightY)
  doc.line(PAGE_W - 34, rightY, PAGE_W - 34, rightY + 34)
  doc.circle(PAGE_W - 34, rightY + 34, 3, 'D')
  doc.circle(PAGE_W, rightY, 3, 'D')
}

function drawQr(doc: jsPDF, x: number, y: number, size: number, passToken: string, mark: LoadedImage) {
  const qr = buildPassQr(passToken)
  // A QR code needs a blank quiet-zone margin around its modules to be detected at all, so the
  // module grid is sized to leave QUIET_ZONE modules of margin on every side within `size`.
  const cellSize = size / (qr.size + QUIET_ZONE * 2)
  const originX = x + QUIET_ZONE * cellSize
  const originY = y + QUIET_ZONE * cellSize

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

  // Rounded, branded finder "eye" markers — navy ring, white gap, navy center — one per corner.
  // The 1:1:3:1:1 dark/light/dark proportions of a real finder pattern are what a decoder actually
  // uses to even locate these three squares in the first place (it looks for that specific
  // ratio along a scanline); a gold center used to sit here instead, and gold reads as "light" by
  // luminance, not "dark" — breaking that ratio and making finder detection fail outright, not
  // just look different. Verified directly: a real jsQR decode of this exact design failed 100%
  // of the time with a gold center and succeeded every time with navy, with everything else held
  // identical. Only the corner rounding is decorative now — every color here is load-bearing.
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
    ring(2, FINDER_SIZE - 4, NAVY)
  }

  // Center logo mark, sized to fit — in BOTH dimensions — within the open square the module grid
  // leaves blank. Fixing the width at 82% of the hole and deriving height from it (width / aspect)
  // was fine for the old wide wordmark (aspect ~3.6, so the derived height came out small on its
  // own) but silently broke for this near-square icon (aspect ~0.86): the derived height came out
  // LARGER than the hole itself, so the mark bled a few pixels past the boundary the module grid
  // actually left blank and covered real data modules right at the edge — exactly the kind of
  // damage error correction isn't budgeted for, since it only accounts for the intended hole. This
  // computes both candidate sizes and picks whichever keeps the mark within the hole on both axes,
  // the same thing CSS object-contain does for the on-screen QrPassPreview version of this.
  const hole = getCenterHoleBounds(qr.size)
  const holePx = hole.size * cellSize
  const maxDim = holePx * 0.82
  let markW = maxDim
  let markH = maxDim / mark.aspect
  if (markH > maxDim) {
    markH = maxDim
    markW = maxDim * mark.aspect
  }
  const holeCenterX = originX + (hole.start + hole.size / 2) * cellSize
  const holeCenterY = originY + (hole.start + hole.size / 2) * cellSize
  doc.addImage(mark.dataUrl, 'PNG', holeCenterX - markW / 2, holeCenterY - markH / 2, markW, markH)
}
