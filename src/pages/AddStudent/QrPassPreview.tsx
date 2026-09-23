import { useMemo } from 'react'
import fusionLogoMark from '../../assets/fusion_logo_exact_transparent.png'
import { buildPassQr, getCenterHoleBounds, getFinderOrigins, FINDER_SIZE, QUIET_ZONE } from './qrPassUtils'

interface QrPassPreviewProps {
  // The pass's real random token from the passes table. Null while it's still loading — the
  // QR is never rendered from anything derived from the student's ID.
  passToken: string | null
  name: string
  faculty: string
  levelLabel: string
  status?: 'Active' | 'Revoked'
}

function FinderMark({ row, col }: { row: number; col: number }) {
  const ring = (inset: number, span: number, className: string) => (
    <span
      style={{ gridRow: `${row + inset + 1} / span ${span}`, gridColumn: `${col + inset + 1} / span ${span}` }}
      className={`rounded-[24%] ${className}`}
    />
  )
  return (
    <>
      {ring(0, FINDER_SIZE, 'bg-[#12284a]')}
      {ring(1, FINDER_SIZE - 2, 'bg-white')}
      {ring(2, FINDER_SIZE - 4, 'bg-[#f4b400]')}
    </>
  )
}

export function QrPassPreview({ passToken, name, faculty, levelLabel, status = 'Active' }: QrPassPreviewProps) {
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
    return (
      <div className="flex w-full max-w-[360px] items-center justify-center rounded-2xl border border-[#e6f6f4] bg-white px-5 py-10 text-[13px] font-semibold text-[#7c8aa0] shadow-[0_14px_34px_rgba(13,148,136,0.18)]">
        Loading pass&hellip;
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
          <span className="overflow-hidden text-[12.5px] text-ellipsis whitespace-nowrap text-[#6b7a94]">{faculty}</span>
          <span className="overflow-hidden text-[12.5px] text-ellipsis whitespace-nowrap text-[#6b7a94]">{levelLabel}</span>
        </div>
      </div>
    </div>
  )
}
