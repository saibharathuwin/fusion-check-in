import { useMemo } from 'react'
import fusionLogoMark from '../../assets/fusion_logo.png'
import { buildPassQr, getCenterHoleBounds, getFinderOrigins, FINDER_SIZE, QUIET_ZONE } from './qrPassUtils'

interface QrPassPreviewProps {
  // The pass's real random token from the passes table. Null either while it's still loading, or
  // once loading has finished and there genuinely isn't one — `loading` is what tells those two
  // apart; never inferred from passToken alone. The QR is never rendered from anything derived
  // from the student's ID.
  passToken: string | null
  loading?: boolean
  onIssuePass?: () => void
  issuingPass?: boolean
  // True when this student was imported without their real student number yet. Issuing a pass
  // bakes "ID pending" into the printed PDF's Student ID field — better to wait until the real
  // number is known than to print one that'll need reissuing once it is.
  studentIdPending?: boolean
  name: string
  faculty: string
  level: string
  year: string
  status?: 'Active' | 'Revoked'
}

function FinderMark({ row, col }: { row: number; col: number }) {
  const ring = (inset: number, span: number, className: string) => (
    <span
      style={{ gridRow: `${row + inset + 1} / span ${span}`, gridColumn: `${col + inset + 1} / span ${span}` }}
      className={`rounded-[24%] ${className}`}
    />
  )
  // Navy-white-navy, matching a real finder pattern's actual dark-light-dark proportions — a
  // decoder locates these three corner squares specifically by that contrast ratio, and a gold
  // center (used here previously) reads as "light" by luminance, breaking that ratio and making
  // detection fail outright rather than just looking different. Verified with a real jsQR decode
  // of this exact design: 100% failure with a gold center, 100% success with navy, everything
  // else held identical. Only the rounded corners are decorative now — every color is load-bearing.
  return (
    <>
      {ring(0, FINDER_SIZE, 'bg-[#12284a]')}
      {ring(1, FINDER_SIZE - 2, 'bg-white')}
      {ring(2, FINDER_SIZE - 4, 'bg-[#12284a]')}
    </>
  )
}

export function QrPassPreview({
  passToken,
  loading = false,
  onIssuePass,
  issuingPass = false,
  studentIdPending = false,
  name,
  faculty,
  level,
  year,
  status = 'Active',
}: QrPassPreviewProps) {
  // Faculty/program/year are all optional now (see AddStudentForm) — show the same "pending"
  // wording the pass already uses for a not-yet-known student ID, rather than a blank line.
  const facultyLabel = faculty || 'Faculty pending'
  const levelLabel = `${level}${year ? ` · ${year}` : ' · Year pending'}`
  // Render a neutral placeholder rather than a QR built from a placeholder token — a scannable
  // code must only ever come from a real stored token.
  const qr = useMemo(() => (passToken ? buildPassQr(passToken) : null), [passToken])
  const isRevoked = status === 'Revoked'

  const dataCells = useMemo(() => {
    const cells: { row: number; col: number }[] = []
    if (!qr) return cells
    for (let row = 0; row < qr.size; row++) {
      for (let col = 0; col < qr.size; col++) {
        if (qr.isFinder(row, col) || qr.isCenterHole(row, col)) continue
        if (qr.isDark(row, col)) cells.push({ row, col })
      }
    }
    return cells
  }, [qr])

  const finderOrigins = useMemo(() => (qr ? getFinderOrigins(qr.size) : []), [qr])
  const hole = useMemo(() => (qr ? getCenterHoleBounds(qr.size) : { start: 0, size: 0 }), [qr])

  if (!qr) {
    if (loading) {
      return (
        <div className="flex w-full max-w-[360px] items-center justify-center rounded-2xl border border-[#e6f6f4] bg-white px-5 py-10 text-[13px] font-semibold text-[#7c8aa0] shadow-[0_14px_34px_rgba(13,148,136,0.18)]">
          Loading pass&hellip;
        </div>
      )
    }
    // Loading has finished and there's still no token — this student genuinely has no pass row
    // yet (a handful of older ones ended up this way), not a slow request. Never show the earlier
    // "Loading pass…" text forever here — it looked broken because nothing was ever going to load.
    return (
      <div className="flex w-full max-w-[360px] flex-col items-center gap-3 rounded-2xl border border-[#e6f6f4] bg-white px-5 py-10 text-center shadow-[0_14px_34px_rgba(13,148,136,0.18)]">
        <p className="m-0 text-[13px] font-semibold text-[#7c8aa0]">No pass on file for this student yet.</p>
        {studentIdPending ? (
          <p className="m-0 max-w-[280px] text-[12.5px] text-[#a0740f]">
            Their student ID is still pending. Add their real number first, since a pass issued now would print "ID pending" on it.
          </p>
        ) : (
          onIssuePass && (
            <button
              type="button"
              onClick={onIssuePass}
              disabled={issuingPass}
              className="rounded-[10px] border-none bg-[#0d9488] px-4 py-2 text-[13px] font-bold text-white cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] hover:not-disabled:bg-[#0b7d73] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {issuingPass ? 'Issuing…' : 'Issue a pass'}
            </button>
          )
        )}
      </div>
    )
  }

  return (
    <div className="w-full max-w-[360px] overflow-hidden rounded-2xl border border-[#e6f6f4] bg-white shadow-[0_14px_34px_rgba(13,148,136,0.18)]">
      <div
        className={`flex items-center justify-between px-[18px] py-3 text-[13px] font-extrabold tracking-[0.6px] text-white ${
          isRevoked ? 'bg-[#9aa6ba]' : 'bg-[linear-gradient(120deg,#0d9488,#14b8a6)]'
        }`}
      >
        <span>FUSION PASS</span>
        <span className="inline-flex items-center gap-[5px] rounded-full bg-white/20 px-[9px] py-[3px] text-[11px] font-bold tracking-[0.4px]">
          <span className={`h-1.5 w-1.5 rounded-full ${isRevoked ? 'bg-[#fde8e8]' : 'bg-[#d1fae5]'}`} />
          {status}
        </span>
      </div>
      <div className={`flex items-center gap-[18px] p-5 ${isRevoked ? 'opacity-50' : ''}`}>
        <div
          className="grid h-24 w-24 shrink-0 rounded-lg border border-[#eef6f5] bg-white"
          style={{
            gridTemplateColumns: `repeat(${qr.size + QUIET_ZONE * 2}, 1fr)`,
            gridTemplateRows: `repeat(${qr.size + QUIET_ZONE * 2}, 1fr)`,
          }}
        >
          {dataCells.map(({ row, col }) => (
            <span
              key={`${row}-${col}`}
              style={{ gridRow: row + QUIET_ZONE + 1, gridColumn: col + QUIET_ZONE + 1 }}
              className="bg-[#12284a]"
            />
          ))}
          {finderOrigins.map((origin, i) => (
            <FinderMark key={i} row={origin.row + QUIET_ZONE} col={origin.col + QUIET_ZONE} />
          ))}
          <div
            style={{
              gridRow: `${hole.start + QUIET_ZONE + 1} / span ${hole.size}`,
              gridColumn: `${hole.start + QUIET_ZONE + 1} / span ${hole.size}`,
            }}
            className="flex items-center justify-center p-px"
          >
            <img src={fusionLogoMark} alt="" className="h-full w-full object-contain" />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className="text-[15.5px] font-extrabold text-[#12284a]">{name}</span>
          <span className="overflow-hidden text-[12.5px] text-ellipsis whitespace-nowrap text-[#6b7a94]">{facultyLabel}</span>
          <span className="overflow-hidden text-[12.5px] text-ellipsis whitespace-nowrap text-[#6b7a94]">{levelLabel}</span>
        </div>
      </div>
    </div>
  )
}
