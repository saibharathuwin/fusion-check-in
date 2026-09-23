import { CalendarIcon, CalendarPlusIcon, CheckCircleIcon, ChartIcon, ClockIcon } from '../../components/icons/NavIcons'

interface EventHubCard {
  title: string
  subtitle: string
  href: string
  theme: 'blue' | 'green' | 'teal' | 'purple' | 'amber' | 'pink'
  icon: React.ComponentType<{ size?: number }>
}

// Mirrors StudentsLandingPage.tsx's structure exactly — same card shape, same grid, same "Manage
// X" heading pattern — so the two hub pages read as one consistent system rather than two
// independently-designed pages.
const CARDS: EventHubCard[] = [
  { title: 'All events', subtitle: 'Browse and search every event, past and upcoming.', href: '/events/all', theme: 'blue', icon: CalendarIcon },
  { title: 'Add event', subtitle: 'Create a new event and its check-in sessions.', href: '/events/new', theme: 'green', icon: CalendarPlusIcon },
  { title: 'Active events', subtitle: 'Events currently running, with live check-in counts.', href: '/events/active', theme: 'teal', icon: CheckCircleIcon },
  { title: 'Upcoming events', subtitle: 'Scheduled events that haven’t started yet.', href: '/events/upcoming', theme: 'purple', icon: ClockIcon },
  { title: 'Event analytics', subtitle: 'Cross-event attendance trends and comparisons.', href: '/analytics', theme: 'amber', icon: ChartIcon },
]

const ICON_THEME_CLASSES: Record<EventHubCard['theme'], string> = {
  blue: 'bg-[#d6e7fc] text-[#2f6fed]',
  green: 'bg-[#d3f1e2] text-[#12a35c]',
  teal: 'bg-[#ccfbf1] text-[#0d9488]',
  purple: 'bg-[#e4dbfb] text-[#8b5cf6]',
  amber: 'bg-[#fff3d6] text-[#b3790a]',
  pink: 'bg-[#fde7f1] text-[#d13d82]',
}

export function EventsLandingPage() {
  return (
    <div className="flex flex-col gap-[22px]">
      <div>
        <h1 className="m-0 mb-1.5 text-[30px] font-extrabold tracking-[-0.01em] text-[#12284a] max-[641px]:text-2xl">
          Manage Events
        </h1>
        <p className="m-0 text-[15px] text-[#6b7a94]">Create, browse, and track everything related to Fusion events</p>
      </div>

      <div className="grid w-full grid-cols-3 gap-[22px] max-[901px]:grid-cols-2 max-[641px]:grid-cols-1">
        {CARDS.map(({ title, subtitle, href, theme, icon: Icon }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full flex-col items-start gap-1 rounded-2xl border border-[#eef6f5] bg-white px-[26px] py-7 text-inherit no-underline shadow-[0_10px_30px_rgba(13,148,136,0.07)] [transition:translate_150ms_ease,box-shadow_150ms_ease,border-color_150ms_ease,background-color_150ms_ease] hover:-translate-y-1 hover:border-[#ccfbf1] hover:shadow-[0_16px_36px_rgba(13,148,136,0.16)] max-[641px]:px-[22px] max-[641px]:py-6"
          >
            <div className={`mb-3.5 flex h-11 w-11 items-center justify-center rounded-full ${ICON_THEME_CLASSES[theme]}`}>
              <Icon size={22} />
            </div>
            <h2 className="m-0 text-[17px] font-extrabold text-[#12284a]">{title}</h2>
            <p className="m-0 text-[13.5px] leading-[1.5] text-[#6b7a94]">{subtitle}</p>
          </a>
        ))}
      </div>
    </div>
  )
}
