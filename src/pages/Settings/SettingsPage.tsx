import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FusionLogo } from '../../components/FusionLogo/FusionLogo'
import { AccountTab } from './AccountTab'
import { SecurityTab } from './SecurityTab'
import { StaffAccessTab } from './StaffAccessTab'

// One entry per Settings section — each shown as its own item in the left sub-nav and its own
// segregated panel on the right. Adding a new section later means one more entry here and one
// more case in the switch below, not restructuring the page.
interface SettingsTabDef {
  key: string
  label: string
}

const SETTINGS_TABS: SettingsTabDef[] = [
  { key: 'account', label: 'Account' },
  { key: 'security', label: 'Security' },
  { key: 'staff', label: 'Staff & Access' },
]

const TAB_BTN_BASE =
  'flex items-center rounded-[10px] border-none px-3.5 py-2.5 text-left text-[13.5px] font-bold whitespace-nowrap cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0d9488]'
const TAB_BTN_ACTIVE = 'bg-[#e5faf7] text-[#0d9488]'
const TAB_BTN_INACTIVE = 'bg-transparent text-[#6e6e73] hover:bg-[#f2f5fa] hover:text-[#1d1d1f]'

// This page is deliberately outside DashboardLayout (see App.tsx) — it's opened in its own browser
// tab from the profile dropdown, so it gets a minimal dedicated header of its own instead of the
// full app nav, which wouldn't make sense floating in a tab with no other app context around it.
export function SettingsPage() {
  const [activeTab, setActiveTab] = useState(SETTINGS_TABS[0].key)

  return (
    <div className="min-h-screen bg-[#f5f7fb]">
      {/* Same 58px height as the main app's TopNav bar, for visual consistency between the two */}
      <header
        style={{ height: 58 }}
        className="flex items-center justify-between gap-4 bg-white px-10 shadow-[0_1px_0_rgba(15,40,74,0.06)] max-[641px]:px-5"
      >
        <div className="flex items-center gap-4">
          <FusionLogo variant="dark" width={108} />
          <span className="h-6 w-px bg-[#eef1f6]" />
          <span className="hidden text-[15px] font-bold tracking-[-0.01em] text-[#1d1d1f] max-[561px]:inline">Settings</span>
          <span className="text-[15px] font-bold tracking-[-0.01em] text-[#1d1d1f] max-[561px]:hidden">Administrator Settings</span>
        </div>
        <Link
          to="/"
          className="rounded-[9px] border border-[#e2e6ee] bg-white px-3.5 py-2 text-[13px] font-bold text-[#6e6e73] no-underline cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f2f5fa]"
        >
          Back to Dashboard
        </Link>
      </header>

      <div className="mx-auto max-w-[1100px] px-10 pt-8 pb-16 max-[1081px]:px-7 max-[641px]:px-5">
        <div className="mb-7">
          <h1 className="m-0 mb-1.5 text-[28px] font-extrabold tracking-[-0.01em] text-[#1d1d1f] max-[641px]:text-2xl">Settings</h1>
          <p className="m-0 text-[15px] text-[#6b7a94]">Manage your Fusion Hub administrator account and application preferences.</p>
        </div>

        <div className="flex min-w-0 items-start gap-6 max-[801px]:flex-col max-[801px]:gap-4">
          <nav
            aria-label="Settings sections"
            className="flex w-[220px] shrink-0 flex-col gap-1 max-[801px]:w-full max-[801px]:flex-row max-[801px]:overflow-x-auto"
          >
            {SETTINGS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                aria-current={activeTab === tab.key ? 'page' : undefined}
                onClick={() => setActiveTab(tab.key)}
                className={`${TAB_BTN_BASE} max-[801px]:shrink-0 ${activeTab === tab.key ? TAB_BTN_ACTIVE : TAB_BTN_INACTIVE}`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1 max-[801px]:w-full">
            {activeTab === 'account' && <AccountTab />}
            {activeTab === 'security' && <SecurityTab />}
            {activeTab === 'staff' && <StaffAccessTab />}
          </div>
        </div>
      </div>
    </div>
  )
}
