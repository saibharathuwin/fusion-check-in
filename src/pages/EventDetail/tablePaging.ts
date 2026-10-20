export const TABLE_PAGE_SIZE = 10

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE))
}

export function pageSlice<T>(items: T[], page: number): T[] {
  const start = (Math.min(page, pageCount(items.length)) - 1) * TABLE_PAGE_SIZE
  return items.slice(start, start + TABLE_PAGE_SIZE)
}

export type PageItem = number | 'ellipsis-start' | 'ellipsis-end'

export function getPageItems(current: number, total: number): PageItem[] {
  const siblingCount = 1
  const windowSize = siblingCount * 2 + 5

  if (total <= windowSize) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const leftSibling = Math.max(current - siblingCount, 1)
  const rightSibling = Math.min(current + siblingCount, total)
  const showLeftEllipsis = leftSibling > 2
  const showRightEllipsis = rightSibling < total - 1

  if (!showLeftEllipsis && showRightEllipsis) {
    const leftRange = Array.from({ length: 3 + siblingCount * 2 }, (_, i) => i + 1)
    return [...leftRange, 'ellipsis-end', total]
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    const rightCount = 3 + siblingCount * 2
    const rightRange = Array.from({ length: rightCount }, (_, i) => total - rightCount + i + 1)
    return [1, 'ellipsis-start', ...rightRange]
  }

  const middleRange = Array.from({ length: rightSibling - leftSibling + 1 }, (_, i) => leftSibling + i)
  return [1, 'ellipsis-start', ...middleRange, 'ellipsis-end', total]
}
