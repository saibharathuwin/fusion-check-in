import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import type { StaffRole } from '../../auth/context'
import { PlusIcon, RefreshIcon } from '../../components/icons/NavIcons'
import { fetchStaffRoster, updateStaffRole, type StaffRosterRow } from './staffRosterData'
import { RemoveStaffDialog } from './RemoveStaffDialog'
import { AddStaffDialog } from './AddStaffDialog'
import { SettingsCard } from './SettingsCard'

const ROLES: StaffRole[] = ['Admin', 'Staff', 'Kiosk']

const ROLE_PILL_CLASSES: Record<StaffRole, string> = {
  Admin: 'bg-[#d6e7fc] text-[#2f6fed]',
  Staff: 'bg-[#d3f1e2] text-[#12a35c]',
  Kiosk: 'bg-[#fff3d6] text-[#b3790a]',
}

const SELECT_CLASSES =
  'rounded-[8px] border border-[#e2e6ee] bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-[#12284a] cursor-pointer [transition:border-color_150ms_ease] hover:border-[#c7d0e0] focus:border-[#0d9488] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50'

export function StaffAccessTab() {
  const { staffUser } = useAuth()
  const [roster, setRoster] = useState<StaffRosterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null)
  const [roleError, setRoleError] = useState('')
  const [removeTarget, setRemoveTarget] = useState<StaffRosterRow | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  // For the Refresh button and AddStaffDialog's onClose — both fire from event handlers, never
  // from an effect body, so the setState calls inside are never "synchronous within an effect".
  const loadRoster = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      setRoster(await fetchStaffRoster())
    } catch {
      setLoadError("Couldn't load the staff roster. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchStaffRoster()
      .then((rows) => {
        if (!cancelled) setRoster(rows)
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't load the staff roster. Please try again.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleRoleChange(row: StaffRosterRow, role: StaffRole) {
    setRoleError('')
    setRoleUpdatingId(row.id)
    const previous = roster
    setRoster((prev) => prev.map((r) => (r.id === row.id ? { ...r, role } : r)))
    try {
      await updateStaffRole(row.id, role)
    } catch {
      setRoster(previous)
      setRoleError(`Couldn't update ${row.fullName}'s role. Please try again.`)
    } finally {
      setRoleUpdatingId(null)
    }
  }

  function handleRemoved(id: string) {
    setRoster((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <SettingsCard
        title="Staff accounts"
        description="Admin accounts can manage events and students. Staff accounts can only use the scanner. Kiosk is the one shared login used at /kiosk."
        actions={
          <>
            <button
              type="button"
              onClick={() => loadRoster()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-[9px] border border-[#e2e6ee] bg-white px-3 py-[9px] text-[12.5px] font-bold text-[#56617a] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f2f5fa] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshIcon size={14} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-[9px] border-none bg-[#0d9488] px-3.5 py-[9px] text-[12.5px] font-bold text-white cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#0b7d73]"
            >
              <PlusIcon size={14} />
              Add account
            </button>
          </>
        }
      >
        {roleError && (
          <div className="mx-[22px] mt-4 rounded-[10px] border border-[#f8c9c9] bg-[#fde8e8] px-3.5 py-3 text-[13px] font-semibold text-[#d1453d]">
            {roleError}
          </div>
        )}

        {loading ? (
          <p className="m-0 px-[22px] py-6 text-[13.5px] text-[#9aa6ba]">Loading staff accounts&hellip;</p>
        ) : loadError ? (
          <p className="m-0 px-[22px] py-6 text-[13.5px] font-semibold text-[#d1453d]">{loadError}</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th className="border-b border-[#eef1f6] px-[22px] py-3.5 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                    Name
                  </th>
                  <th className="border-b border-[#eef1f6] px-[22px] py-3.5 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                    Email
                  </th>
                  <th className="border-b border-[#eef1f6] px-[22px] py-3.5 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                    Role
                  </th>
                  <th className="border-b border-[#eef1f6] px-[22px] py-3.5 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {roster.map((row, index) => {
                  const cellBorder = index === roster.length - 1 ? '' : 'border-b border-[#f2f4f8]'
                  const isSelf = row.id === staffUser?.id
                  return (
                    <tr key={row.id}>
                      <td className={`px-[22px] py-4 align-middle text-[13.5px] font-bold whitespace-nowrap text-[#12284a] ${cellBorder}`}>
                        {row.fullName}
                        {isSelf && <span className="ml-2 text-[12px] font-semibold text-[#9aa6ba]">(you)</span>}
                      </td>
                      <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>{row.email}</td>
                      <td className={`px-[22px] py-4 align-middle ${cellBorder}`}>
                        {isSelf ? (
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-bold ${ROLE_PILL_CLASSES[row.role]}`}
                          >
                            {row.role}
                          </span>
                        ) : (
                          <label className="sr-only" htmlFor={`role-${row.id}`}>
                            Role for {row.fullName}
                          </label>
                        )}
                        {!isSelf && (
                          <select
                            id={`role-${row.id}`}
                            value={row.role}
                            disabled={roleUpdatingId === row.id}
                            onChange={(e) => handleRoleChange(row, e.target.value as StaffRole)}
                            className={SELECT_CLASSES}
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className={`px-[22px] py-4 align-middle text-right ${cellBorder}`}>
                        {isSelf ? (
                          <span className="text-[12px] text-[#9aa6ba]">Can&rsquo;t remove your own account</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setRemoveTarget(row)}
                            className="rounded-[8px] border border-[#f8c9c9] bg-white px-3 py-1.5 text-[12.5px] font-bold text-[#d1453d] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#fde8e8]"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SettingsCard>

      <RemoveStaffDialog staffMember={removeTarget} onClose={() => setRemoveTarget(null)} onRemoved={handleRemoved} />
      <AddStaffDialog
        open={addOpen}
        onClose={() => {
          setAddOpen(false)
          // The new account only actually exists once the admin runs the generated SQL themselves
          // (elsewhere, in the Supabase dashboard) — refresh so it shows up here without a full
          // page reload once they're done and close this dialog.
          loadRoster()
        }}
      />
    </div>
  )
}
