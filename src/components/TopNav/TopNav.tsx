import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { FusionLogo } from '../FusionLogo/FusionLogo'
import { Topbar } from '../Topbar/Topbar'
import { openInNewTabWithSession } from '../../lib/newTabSession'
import {
  HomeIcon,
  CalendarIcon,
  ClockIcon,
  PeopleIcon,
  CheckCircleIcon,
  GridIcon,
  ChartIcon,
  SettingsIcon,
  LogOutIcon,
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
  // Only set when `to` (where a direct click lands) isn't itself the right prefix to match against
  // for the "active" highlight — Events' `to` points straight at /events/all now that there's no
  // separate hub page, but /events/new, /events/active, etc. should still show Events as active.
  // Falls back to `to` when omitted.
  activeMatch?: string
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
  { to: '/students/import', label: 'Import students' },
  { to: '/students/passes', label: 'Fusion Passes' },
  { to: '/students/analytics', label: 'Student analytics' },
]

const NAV_ITEMS: NavItemDef[] = [
  { to: '/', label: 'Dashboard', icon: HomeIcon, end: true },
  { to: '/events/all', label: 'Events', icon: CalendarIcon, subItems: EVENT_SUB_ITEMS, activeMatch: '/events' },
  { to: '/sessions', label: 'Sessions', icon: ClockIcon },
  { to: '/students/directory', label: 'Students', icon: PeopleIcon, subItems: STUDENT_SUB_ITEMS, activeMatch: '/students' },
  { to: '/attendance', label: 'Attendance', icon: CheckCircleIcon },
  { to: '/programs', label: 'Programs', icon: GridIcon },
  { to: '/analytics', label: 'Analytics', icon: ChartIcon },
]

// Desktop nav items: plain text, not button-styled pills — a small yellow underline marks the
// active route instead of a filled background, so the bar stays visually quiet (see redesign
// notes below). NAV_ITEM_ACTIVE/INACTIVE below are the mobile-menu-only pill styles, kept
// separately since a vertical list benefits from a filled highlight in a way a horizontal bar
// doesn't.
const DESKTOP_NAV_ITEM_BASE =
  'relative flex shrink-0 items-center px-3.5 py-2 text-[13.5px] tracking-[-0.01em] leading-none whitespace-nowrap no-underline cursor-pointer [transition:color_200ms_ease]'

const DESKTOP_NAV_ITEM_INACTIVE = 'font-medium text-[#6e6e73] hover:text-[#1d1d1f]'

const DESKTOP_NAV_ITEM_ACTIVE = 'font-semibold text-[#1d1d1f]'

// The active-state underline itself — full width of the item's own padding box (not measured to
// the text), so it lines up cleanly without any JS width calculation. Scales in from the center
// rather than just appearing, a small detail that reads as more deliberate/premium than an
// instant-on bar, especially when switching between routes.
const ACTIVE_UNDERLINE = (
  <span className="absolute right-3.5 -bottom-[1px] left-3.5 h-[1.5px] origin-center scale-x-100 rounded-full bg-[#1d1d1f] [animation:underline-grow_220ms_cubic-bezier(0.34,1.56,0.64,1)_both]" />
)

const NAV_ITEM_INACTIVE = 'bg-transparent font-medium text-[#6e6e73] hover:bg-[#f2f5fa] hover:text-[#1d1d1f]'

const NAV_ITEM_ACTIVE = 'bg-[#f2f5fa] font-bold text-[#1d1d1f] border-l-2 border-[#1d1d1f]'

// Bar height — the flyout and mobile menu both anchor to this exact value, so it's pulled out once
// rather than duplicated as a magic number in three places.
const BAR_HEIGHT = 58

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
          <span className="mb-5 block text-[13px] font-semibold text-[#9aa6ba]">{item.label}</span>
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
//
// Deliberately `pointer-events-none` at all times, open or closed: this thing spans nearly the
// entire viewport below the bar, so if it ever participated in the hover-keeps-open logic, resting
// the cursor anywhere on the page — nowhere near the actual trigger or panel — would silently keep
// the flyout open forever (only the trigger button and the panel's own content should do that).
function FlyoutBackdrop({ open }: { open: boolean }) {
  return (
    <div
      aria-hidden="true"
      style={{ top: BAR_HEIGHT }}
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-[68] bg-white/45 backdrop-blur-md [transition:opacity_180ms_ease] max-[769px]:hidden ${
        open ? 'opacity-100' : 'opacity-0'
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
  const matchAgainst = item.activeMatch ?? item.to
  const isActive = location.pathname === matchAgainst || location.pathname.startsWith(`${matchAgainst}/`)
  const showActive = isActive || isFlyoutOpen

  return (
    <button
      type="button"
      aria-haspopup="true"
      aria-expanded={isFlyoutOpen}
      onClick={onToggleFlyout}
      onMouseEnter={onOpenOnHover}
      onMouseLeave={onScheduleClose}
      className={`${DESKTOP_NAV_ITEM_BASE} ${showActive ? DESKTOP_NAV_ITEM_ACTIVE : DESKTOP_NAV_ITEM_INACTIVE}`}
    >
      {item.label}
      {showActive && ACTIVE_UNDERLINE}
    </button>
  )
}

interface MobileMenuProps {
  open: boolean
  onClose: () => void
  expandedTo: string | null
  onToggleExpanded: (to: string) => void
  accountName: string
  accountRole: string
  onLogout: () => void
}

// The mobile equivalent of the desktop flyout — a full-width panel dropping down from under the
// bar with every nav item stacked vertically, Students expanding inline (there's no room for a
// side-by-side flyout at phone widths). Kept permanently mounted, driven by `open`, for the same
// smooth-close reason as FlyoutPanel above. Also carries the account section (Settings, Log out)
// that lives in the desktop Topbar dropdown — that dropdown itself is hidden below 769px, so
// without this, a phone user would have no way to reach either one at all.
function MobileMenu({ open, onClose, expandedTo, onToggleExpanded, accountName, accountRole, onLogout }: MobileMenuProps) {
  return (
    <div
      style={{ top: BAR_HEIGHT }}
      className={`fixed inset-x-0 bottom-0 z-[65] hidden overflow-y-auto bg-white px-5 py-5 shadow-[0_18px_26px_-20px_rgba(15,40,74,0.25)] [transition:opacity_200ms_ease,translate_200ms_ease] max-[769px]:block ${
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
                              subActive ? 'bg-[#f2f5fa] font-bold text-[#12284a]' : 'bg-transparent font-medium text-[#56617a] hover:bg-[#f7f9fc] hover:text-[#12284a]'
                            }`
                          }
                        >
                          <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-[#1d1d1f]" />
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

      <div className="mt-3 flex flex-col gap-1 border-t border-[#eef1f6] px-2 pt-3">
        <div className="px-[14px] pt-1 pb-2">
          <span className="block text-[13.5px] font-bold text-[#12284a]">{accountName}</span>
          <span className="block text-[12px] text-[#9aa6ba]">{accountRole}</span>
        </div>
        {/* See Topbar.tsx's Settings link for how a session stored in sessionStorage survives
            opening this in a new tab. */}
        <a
          href="/settings"
          target="_blank"
          onClick={(e) => {
            onClose()
            openInNewTabWithSession(e, '/settings')
          }}
          className="flex items-center gap-3 rounded-[10px] border-none px-[14px] py-3 text-left text-[14.5px] no-underline cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] bg-transparent font-medium text-[#56617a] hover:bg-[#f2f5fa] hover:text-[#12284a]"
        >
          <SettingsIcon size={19} />
          Settings
        </a>
        <button
          type="button"
          onClick={() => {
            onClose()
            onLogout()
          }}
          className="flex items-center gap-3 rounded-[10px] border-none bg-transparent px-[14px] py-3 text-left text-[14.5px] font-medium text-[#d1453d] cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] hover:bg-[#fde8e8]"
        >
          <LogOutIcon size={19} />
          Log out
        </button>
      </div>

      <div className="mt-2 border-t border-[#eef1f6] px-2 pt-4 pb-1">
        <span className="text-[13px] leading-[1.3] text-[#7c8aa0]">
          University <strong className="text-[#12284a]">of Windsor</strong>
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
        className="sticky top-0 z-[60] grid grid-cols-[auto_1fr_auto] items-center gap-4 bg-white px-10 shadow-[0_1px_0_rgba(15,40,74,0.06)] max-[1081px]:px-7 max-[769px]:px-5"
      >
        <NavLink to="/" className="flex shrink-0 items-center" aria-label="Fusion Dashboard">
          <FusionLogo variant="dark" width={108} />
        </NavLink>

        <nav
          className="flex min-w-0 items-center justify-center gap-2.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] max-[769px]:hidden [&::-webkit-scrollbar]:hidden"
        >
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
                className={({ isActive }) =>
                  `${DESKTOP_NAV_ITEM_BASE} ${isActive ? DESKTOP_NAV_ITEM_ACTIVE : DESKTOP_NAV_ITEM_INACTIVE}`
                }
              >
                {({ isActive }) => (
                  <>
                    {item.label}
                    {isActive && ACTIVE_UNDERLINE}
                  </>
                )}
              </NavLink>
            ),
          )}
        </nav>

        <div className="flex shrink-0 items-center gap-4 justify-self-end">
          <div className="max-[769px]:hidden">
            <Topbar
              name={staffUser?.fullName ?? ''}
              initials={staffUser ? getInitials(staffUser.fullName) : ''}
              role={staffUser?.role ?? ''}
              onLogout={handleLogout}
            />
          </div>
          {staffUser && (
            <div
              aria-hidden="true"
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1d1d1f] text-[12px] font-bold text-white max-[769px]:flex"
            >
              {getInitials(staffUser.fullName)}
            </div>
          )}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="hidden h-10 w-10 items-center justify-center rounded-[10px] border-none bg-transparent text-[#12284a] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f2f5fa] max-[769px]:inline-flex"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
          </button>
        </div>
      </header>

      <FlyoutBackdrop open={expandedTo !== null && !mobileMenuOpen} />
      <FlyoutPanel
        item={flyoutItem}
        open={expandedTo !== null && !mobileMenuOpen}
        onClose={closeAll}
        onMouseEnter={cancelScheduledClose}
        onMouseLeave={scheduleFlyoutClose}
      />
      <MobileMenu
        open={mobileMenuOpen}
        onClose={closeAll}
        expandedTo={expandedTo}
        onToggleExpanded={toggleMobileExpanded}
        accountName={staffUser?.fullName ?? ''}
        accountRole={staffUser?.role ?? ''}
        onLogout={handleLogout}
      />
    </>
  )
}
