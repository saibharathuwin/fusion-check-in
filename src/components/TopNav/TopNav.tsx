import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { FusionLogo } from '../FusionLogo/FusionLogo'
import { Topbar } from '../Topbar/Topbar'
import universityLogo from '../../assets/universitylogo.png'
import {
  HomeIcon,
  CalendarIcon,
  ClockIcon,
  PeopleIcon,
  CheckCircleIcon,
  GridIcon,
  ChartIcon,
  DocIcon,
  SettingsIcon,
  MenuIcon,
  XIcon,
  ChevronRightIcon,
} from '../icons/NavIcons'

interface SubNavItemDef {
  to: string
  label: string
}

interface NavItemDef {
  to: string
  label: string
  icon: React.ComponentType<{ size?: number }>
  end?: boolean
  // Present only for a nav item that leads to a hub of several sub-pages (e.g. Students) — clicking
  // it opens a flyout on desktop (see FlyoutPanel), or expands inline in the mobile menu.
  subItems?: SubNavItemDef[]
}

const EVENT_SUB_ITEMS: SubNavItemDef[] = [
  { to: '/events/all', label: 'All events' },
  { to: '/events/new', label: 'Add event' },
  { to: '/events/active', label: 'Active events' },
  { to: '/events/upcoming', label: 'Upcoming events' },
  { to: '/analytics', label: 'Event analytics' },
]

const STUDENT_SUB_ITEMS: SubNavItemDef[] = [
  { to: '/students/directory', label: 'Student directory' },
  { to: '/students/new', label: 'Add student' },
  { to: '/students/import', label: 'Upload CSV' },
  { to: '/students/passes', label: 'Pass tools' },
  { to: '/students/analytics', label: 'Student analytics' },
]

const NAV_ITEMS: NavItemDef[] = [
  { to: '/', label: 'Dashboard', icon: HomeIcon, end: true },
  { to: '/events', label: 'Events', icon: CalendarIcon, subItems: EVENT_SUB_ITEMS },
  { to: '/sessions', label: 'Sessions', icon: ClockIcon },
  { to: '/students', label: 'Students', icon: PeopleIcon, subItems: STUDENT_SUB_ITEMS },
  { to: '/attendance', label: 'Attendance', icon: CheckCircleIcon },
  { to: '/programs', label: 'Programs', icon: GridIcon },
  { to: '/analytics', label: 'Analytics', icon: ChartIcon },
  { to: '/reports', label: 'Reports', icon: DocIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

const NAV_ITEM_BASE =
  'flex shrink-0 items-center gap-2 rounded-[9px] border-none px-3 py-2 text-[13.5px] whitespace-nowrap no-underline cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease]'

const NAV_ITEM_INACTIVE = 'bg-transparent font-medium text-[#aab8cf] hover:bg-white/[0.08] hover:text-white'

const NAV_ITEM_ACTIVE = 'bg-[#f4b400] font-bold text-[#0d1f39]'

// Bar height — the flyout and mobile menu both anchor to this exact value, so it's pulled out once
// rather than duplicated as a magic number in three places.
const BAR_HEIGHT = 68

interface FlyoutPanelProps {
  // The last-opened item, kept around after `open` goes false so the fade-out transition has real
  // content to animate away instead of the rows vanishing the instant the panel starts closing.
  item: (NavItemDef & { subItems: SubNavItemDef[] }) | null
  open: boolean
  onClose: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

// Full-width dropdown, styled after apple.com's own nav flyout: flat page-colored background (not
// a floating card), a muted sentence-case label above a set of bold links, generous spacing, opens
// in the same band directly under the bar no matter which item triggered it. Kept permanently
// mounted with opacity/translate driven by `open` so open/close both get the same smooth
// transition instead of an abrupt mount/unmount.
function FlyoutPanel({ item, open, onClose, onMouseEnter, onMouseLeave }: FlyoutPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-hidden={!open}
      style={{ top: BAR_HEIGHT }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`fixed inset-x-0 z-[70] bg-[#f5f7fb] px-10 py-9 shadow-[0_18px_26px_-20px_rgba(15,40,74,0.4)] [transition:opacity_180ms_ease,translate_180ms_ease] max-[769px]:hidden ${
        open ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
      }`}
    >
      {item && (
        <>
          <span className="mb-5 block text-[13px] font-semibold text-[#a56478]">{item.label}</span>
          <div className="flex flex-col gap-5">
            {item.subItems.map((sub) => (
              <NavLink
                key={sub.to}
                to={sub.to}
                role="menuitem"
                onClick={onClose}
                className="block w-fit text-[17px] leading-[1.3] font-bold text-[#1d1d1f] no-underline [transition:color_150ms_ease] hover:text-[#0d9488]"
              >
                {sub.label}
              </NavLink>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Blurs and dims whatever's on the page below the bar while a flyout is open — apple.com's own
// mega-menu treatment, and what makes the flyout read as the thing you're looking at rather than
// just another panel stacked on top of a fully-legible page. Sits under the flyout (z-[68] vs its
// z-[70]) and above ordinary page content, and — unlike a typical modal backdrop — stays fully
// transparent to nothing: it's real backdrop-filter blur, not a solid scrim, so the page underneath
// is still readable, just softened out of focus.
function FlyoutBackdrop({
  open,
  onMouseEnter,
  onMouseLeave,
}: {
  open: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  return (
    <div
      aria-hidden="true"
      style={{ top: BAR_HEIGHT }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`fixed inset-x-0 bottom-0 z-[68] bg-white/45 backdrop-blur-md [transition:opacity_180ms_ease] max-[769px]:hidden ${
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    />
  )
}

interface DesktopExpandableNavItemProps {
  item: NavItemDef & { subItems: SubNavItemDef[] }
  isFlyoutOpen: boolean
  onToggleFlyout: () => void
  onOpenOnHover: () => void
  onScheduleClose: () => void
}

function DesktopExpandableNavItem({ item, isFlyoutOpen, onToggleFlyout, onOpenOnHover, onScheduleClose }: DesktopExpandableNavItemProps) {
  const location = useLocation()
  const isActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
  const Icon = item.icon

  return (
    <button
      type="button"
      aria-haspopup="true"
      aria-expanded={isFlyoutOpen}
      onClick={onToggleFlyout}
      onMouseEnter={onOpenOnHover}
      onMouseLeave={onScheduleClose}
      className={`${NAV_ITEM_BASE} ${isActive || isFlyoutOpen ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE}`}
    >
      <Icon size={16} />
      {item.label}
      <span className={`[transition:transform_200ms_ease] ${isFlyoutOpen ? 'rotate-90' : ''}`}>
        <ChevronRightIcon size={12} />
      </span>
    </button>
  )
}

interface MobileMenuProps {
  open: boolean
  onClose: () => void
  expandedTo: string | null
  onToggleExpanded: (to: string) => void
}

// The mobile equivalent of the desktop flyout — a full-width panel dropping down from under the
// bar with every nav item stacked vertically, Students expanding inline (there's no room for a
// side-by-side flyout at phone widths). Kept permanently mounted, driven by `open`, for the same
// smooth-close reason as FlyoutPanel above.
function MobileMenu({ open, onClose, expandedTo, onToggleExpanded }: MobileMenuProps) {
  return (
    <div
      style={{ top: BAR_HEIGHT }}
      className={`fixed inset-x-0 bottom-0 z-[65] hidden overflow-y-auto bg-[linear-gradient(180deg,#102544_0%,#0d1f39_100%)] px-5 py-5 [transition:opacity_200ms_ease,translate_200ms_ease] max-[769px]:block ${
        open ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
      }`}
    >
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          if (item.subItems) {
            const isExpanded = expandedTo === item.to
            return (
              <div key={item.to}>
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => onToggleExpanded(item.to)}
                  className={`flex w-full items-center justify-between gap-3 rounded-[10px] border-none px-[14px] py-3 text-left text-[14.5px] no-underline cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] ${
                    isExpanded ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon size={19} />
                    {item.label}
                  </span>
                  <span className={`[transition:transform_200ms_ease] ${isExpanded ? 'rotate-90' : ''}`}>
                    <ChevronRightIcon size={15} />
                  </span>
                </button>
                <div className={`grid [transition:grid-template-rows_200ms_ease] ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden">
                    <div className="mt-1 mb-1 flex flex-col gap-0.5 pl-[22px]">
                      {item.subItems.map((sub) => (
                        <NavLink
                          key={sub.to}
                          to={sub.to}
                          onClick={onClose}
                          className={({ isActive: subActive }) =>
                            `flex items-center gap-2.5 rounded-[9px] border-none px-3 py-2.5 text-left text-[13.5px] no-underline cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] ${
                              subActive ? 'bg-white/[0.1] font-bold text-white' : 'bg-transparent font-medium text-[#aab8cf] hover:bg-white/[0.07] hover:text-white'
                            }`
                          }
                        >
                          <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-[#f4b400]" />
                          {sub.label}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-[10px] border-none px-[14px] py-3 text-left text-[14.5px] no-underline cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] ${
                  isActive ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE
                }`
              }
            >
              <Icon size={19} />
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      <div className="mt-3 flex items-center gap-[10px] border-t border-white/[0.12] px-2 pt-4 pb-1">
        <img src={universityLogo} alt="University of Windsor" className="h-auto w-[26px] shrink-0" />
        <span className="text-[13px] leading-[1.3] text-[#cdd7e6]">
          University
          <br />
          <strong className="text-white">of Windsor</strong>
        </span>
      </div>
    </div>
  )
}

export function TopNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { staffUser, signOut } = useAuth()

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [expandedTo, setExpandedTo] = useState<string | null>(null)
  const [flyoutItem, setFlyoutItem] = useState<(NavItemDef & { subItems: SubNavItemDef[] }) | null>(null)
  // A short delay before a hover-triggered close actually happens — the mouse has to travel from
  // the trigger button down to the panel below it, and would otherwise cross a "gap" with nothing
  // hovered in between, closing the flyout before it ever reaches the links. Cancelled by
  // re-entering either the trigger or the panel itself within the window.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A flyout/mobile-menu left open across a route change (a sub-link click already closes it, but
  // a browser back/forward or any other navigation should too). Adjusted directly during render
  // (React's own recommended pattern for this) rather than in an effect, so there's no extra render
  // where the stale-open menu is still visible.
  const [lastPathname, setLastPathname] = useState(location.pathname)
  if (location.pathname !== lastPathname) {
    setLastPathname(location.pathname)
    setExpandedTo(null)
    setMobileMenuOpen(false)
  }

  function cancelScheduledClose() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  function scheduleFlyoutClose() {
    cancelScheduledClose()
    closeTimerRef.current = setTimeout(() => setExpandedTo(null), 200)
  }

  useEffect(() => cancelScheduledClose, [])

  function toggleDesktopFlyout(item: NavItemDef & { subItems: SubNavItemDef[] }) {
    if (expandedTo === item.to) {
      setExpandedTo(null)
      return
    }
    setFlyoutItem(item)
    setExpandedTo(item.to)
  }

  function openFlyoutOnHover(item: NavItemDef & { subItems: SubNavItemDef[] }) {
    cancelScheduledClose()
    setFlyoutItem(item)
    setExpandedTo(item.to)
  }

  function toggleMobileExpanded(to: string) {
    setExpandedTo((current) => (current === to ? null : to))
  }

  function closeAll() {
    cancelScheduledClose()
    setExpandedTo(null)
    setMobileMenuOpen(false)
  }

  async function handleLogout() {
    await signOut()
    navigate('/login', { replace: true })
  }

  function getInitials(fullName: string): string {
    const parts = fullName.trim().split(/\s+/)
    const first = parts[0]?.[0] ?? ''
    const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
    return (first + last).toUpperCase()
  }

  return (
    <>
      <header
        style={{ height: BAR_HEIGHT }}
        className="sticky top-0 z-[60] flex items-center justify-between gap-4 bg-[linear-gradient(90deg,#102544_0%,#0d1f39_100%)] px-10 text-white max-[1081px]:px-7 max-[769px]:px-5"
      >
        <div className="flex min-w-0 items-center gap-8">
          <NavLink to="/" className="flex shrink-0 items-center" aria-label="Fusion Dashboard">
            <FusionLogo variant="light" width={128} />
          </NavLink>

          <nav className="flex items-center gap-1 overflow-x-auto max-[769px]:hidden">
            {NAV_ITEMS.map((item) =>
              item.subItems ? (
                <DesktopExpandableNavItem
                  key={item.to}
                  item={item as NavItemDef & { subItems: SubNavItemDef[] }}
                  isFlyoutOpen={expandedTo === item.to}
                  onToggleFlyout={() => toggleDesktopFlyout(item as NavItemDef & { subItems: SubNavItemDef[] })}
                  onOpenOnHover={() => openFlyoutOnHover(item as NavItemDef & { subItems: SubNavItemDef[] })}
                  onScheduleClose={scheduleFlyoutClose}
                />
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `${NAV_ITEM_BASE} ${isActive ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE}`}
                >
                  <item.icon size={16} />
                  {item.label}
                </NavLink>
              ),
            )}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <div className="max-[769px]:hidden">
            <Topbar
              name={staffUser?.fullName ?? ''}
              initials={staffUser ? getInitials(staffUser.fullName) : ''}
              role={staffUser?.role ?? ''}
              onLogout={handleLogout}
            />
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="hidden h-10 w-10 items-center justify-center rounded-[10px] border-none bg-white/[0.08] text-white cursor-pointer [transition:background-color_150ms_ease] hover:bg-white/[0.14] max-[769px]:inline-flex"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
          </button>
        </div>
      </header>

      <FlyoutBackdrop
        open={expandedTo !== null && !mobileMenuOpen}
        onMouseEnter={cancelScheduledClose}
        onMouseLeave={scheduleFlyoutClose}
      />
      <FlyoutPanel
        item={flyoutItem}
        open={expandedTo !== null && !mobileMenuOpen}
        onClose={closeAll}
        onMouseEnter={cancelScheduledClose}
        onMouseLeave={scheduleFlyoutClose}
      />
      <MobileMenu open={mobileMenuOpen} onClose={closeAll} expandedTo={expandedTo} onToggleExpanded={toggleMobileExpanded} />
    </>
  )
}
