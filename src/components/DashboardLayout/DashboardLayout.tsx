import { Outlet } from 'react-router-dom'
import { TopNav } from '../TopNav/TopNav'

export function DashboardLayout() {
  return (
    <div className="min-h-screen bg-[#f5f7fb]">
      {/* Visually hidden until focused (Tab from the very top of the page lands here first) —
          jumps straight past TopNav's ~10 links/dropdowns to the actual page content, so a
          keyboard user doesn't have to re-tab through the whole nav bar on every single page. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[200] focus:rounded-[10px] focus:bg-[#0d9488] focus:px-4 focus:py-2.5 focus:text-sm focus:font-bold focus:text-white focus:no-underline focus:shadow-[0_4px_14px_rgba(15,40,74,0.3)] focus:outline-2 focus:outline-offset-2 focus:outline-white"
      >
        Skip to main content
      </a>
      <TopNav />
      <div
        id="main-content"
        tabIndex={-1}
        className="px-10 pt-6 pb-10 max-[1081px]:px-7 max-[1081px]:pt-5 max-[1081px]:pb-9 max-[769px]:px-5 max-[769px]:pt-[18px] max-[769px]:pb-8 focus:outline-none"
      >
        <Outlet />
      </div>
    </div>
  )
}
