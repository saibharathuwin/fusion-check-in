import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FusionLogo } from '../../components/FusionLogo/FusionLogo'
import { StatCard } from '../../components/StatCard/StatCard'
import { QuickActionCard } from '../../components/QuickActionCard/QuickActionCard'
import { CalendarIcon, CalendarPlusIcon, PersonPlusIcon } from '../../components/icons/NavIcons'
import { fetchEvents, type EventItem } from '../Events/eventsData'

const REFRESH_INTERVAL_MS = 60_000

interface DashboardProps {
  firstName: string
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function Dashboard({ firstName }: DashboardProps) {
  const navigate = useNavigate()
  const [events, setEvents] = useState<EventItem[]>([])

  const load = useCallback(() => {
    fetchEvents().then(setEvents)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Automatic-mode events recompute their status on every fetch — this periodic refresh is what
  // keeps these counts live (Upcoming → Active → Completed) without the admin reloading the page.
  useEffect(() => {
    const interval = setInterval(load, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [load])

  const activeEvents = events.filter((e) => e.status === 'Active').length
  const upcomingEvents = events.filter((e) => e.status === 'Upcoming').length

  return (
    <div className="flex flex-col gap-7">
      <div className="relative flex items-center justify-between gap-5 overflow-hidden rounded-[22px] bg-[linear-gradient(120deg,#f4ede0_0%,#e9e2f5_55%,#dbe8f7_100%)] px-10 py-9 max-[901px]:flex-col max-[901px]:items-start">
        <div className="relative z-[1]">
          <span className="mb-3.5 block h-1 w-[34px] rounded-sm bg-[#f4b400]" />
          <h1 className="m-0 mb-1.5 text-[28px] font-extrabold text-[#12284a]">
            {getGreeting()}, {firstName}!
          </h1>
          <p className="m-0 text-[15px] text-[#56617a]">Welcome to Fusion. Here&apos;s a quick overview.</p>
        </div>
        <div className="relative z-[1] flex flex-col items-end gap-0.5 opacity-50 max-[901px]:items-start">
          <FusionLogo variant="dark" width={220} />
          <span className="text-[13px] font-semibold tracking-[2px] text-[#7c8aa0] uppercase">Welcome Here</span>
        </div>
      </div>

      <div className="flex gap-5 max-[901px]:flex-col">
        <StatCard
          icon={<CalendarIcon size={22} />}
          count={activeEvents}
          label="Active Events"
          description="Events currently running"
          theme="blue"
          onClick={() => navigate('/events/active')}
        />
        <StatCard
          icon={<CalendarIcon size={22} />}
          count={upcomingEvents}
          label="Upcoming Events"
          description="Scheduled for the coming weeks"
          theme="purple"
          onClick={() => navigate('/events/upcoming')}
        />
      </div>

      <div className="rounded-[20px] bg-white px-7 pt-[26px] pb-7 shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
        <h2 className="m-0 mb-1 text-lg font-extrabold text-[#12284a]">Quick Actions</h2>
        <p className="m-0 mb-[18px] text-[13px] text-[#7c8aa0]">The two things you&rsquo;ll do most often, one click away.</p>
        <div className="flex gap-[18px] max-[901px]:flex-col">
          <QuickActionCard
            icon={<CalendarPlusIcon size={22} />}
            title="Create event"
            description="Set up a new event"
            theme="blue"
            onClick={() => navigate('/events/new')}
          />
          <QuickActionCard
            icon={<PersonPlusIcon size={22} />}
            title="Add student"
            description="Register participants and generate their Fusion Passes"
            theme="green"
            href="/students/new"
            target="_blank"
          />
        </div>
      </div>
    </div>
  )
}
