import { ChevronLeftIcon, ChevronRightIcon } from '../../components/icons/NavIcons'
import { getPageItems, pageCount, TABLE_PAGE_SIZE } from './tablePaging'

const NAV_BUTTON_CLASSES =
  'inline-flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-[#e2e6ee] bg-white text-[#12284a] cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] hover:not-disabled:bg-[#f2f5fa] focus-visible:outline-2 focus-visible:outline-[#0d9488] disabled:cursor-not-allowed disabled:opacity-40'

export function TablePager({
  label,
  page,
  total,
  onPage,
}: {
  label: string
  page: number
  total: number
  onPage: (page: number) => void
}) {
  if (total <= TABLE_PAGE_SIZE) return null
  const pages = pageCount(total)
  const current = Math.min(page, pages)
  const rangeStart = (current - 1) * TABLE_PAGE_SIZE + 1
  const rangeEnd = Math.min(current * TABLE_PAGE_SIZE, total)

  return (
    <nav aria-label={`${label} pages`} className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#7c8aa0]">
      <span>
        Showing {rangeStart}–{rangeEnd} of {total}
      </span>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button type="button" disabled={current <= 1} onClick={() => onPage(current - 1)} aria-label="Previous page" className={NAV_BUTTON_CLASSES}>
          <ChevronLeftIcon size={16} />
        </button>

        {getPageItems(current, pages).map((item, index) =>
          typeof item === 'number' ? (
            <button
              key={item}
              type="button"
              onClick={() => onPage(item)}
              aria-current={item === current ? 'page' : undefined}
              aria-label={`Page ${item}`}
              className={`inline-flex h-[34px] min-w-[34px] items-center justify-center rounded-[9px] border px-1.5 text-[13px] font-semibold cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] focus-visible:outline-2 focus-visible:outline-[#0d9488] ${
                item === current
                  ? 'border-[#0d9488] bg-[#0d9488] font-bold text-white hover:bg-[#0f766e]'
                  : 'border-[#e2e6ee] bg-white text-[#12284a] hover:bg-[#f2f5fa]'
              }`}
            >
              {item}
            </button>
          ) : (
            <span key={`${item}-${index}`} className="inline-flex h-[34px] w-5 items-center justify-center tracking-[1px] font-bold text-[#9aa6ba]">
              &hellip;
            </span>
          ),
        )}

        <button type="button" disabled={current >= pages} onClick={() => onPage(current + 1)} aria-label="Next page" className={NAV_BUTTON_CLASSES}>
          <ChevronRightIcon size={16} />
        </button>
      </div>
    </nav>
  )
}
