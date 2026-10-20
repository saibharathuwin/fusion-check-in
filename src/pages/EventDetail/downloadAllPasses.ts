import JSZip from 'jszip'
import { fetchPassToken, issuePass } from '../../data/passesData'
import { fetchRoster } from '../../data/inviteesData'
import { fetchFusionIdsByStudentIds } from '../../data/fusionIds'
import { generatePassPdfBlob, passFileName } from '../PassTools/generatePassPdf'
import { runWithConcurrency } from '../Students/csvImportData'
import type { Student } from '../StudentDirectory/studentDirectoryData'

export interface DownloadAllPassesResult {
  zipBlob: Blob
  // Everyone currently invited (not dropped) — the set this run attempted.
  totalCount: number
  // How many of those actually made it into the zip.
  includedCount: number
  // How many had no pass yet and got one issued as part of this run.
  issuedCount: number
  // Name + reason, for anyone who didn't make it in (no pass and couldn't issue one, or their PDF
  // failed to build) — shown to staff afterward so nobody silently goes missing from the zip.
  skipped: { name: string; reason: string }[]
}

// Keeps two students who happen to share a name from overwriting each other inside the zip. The
// Fusion ID prefix already makes this unique in the normal case — the numbered-suffix fallback
// below only matters if a fusion id couldn't be looked up for one of them.
export function uniqueFileName(student: Student, usedNames: Set<string>, fusionId?: string | null): string {
  const base = passFileName(student, fusionId)
  if (!usedNames.has(base)) {
    usedNames.add(base)
    return base
  }
  let n = 2
  for (;;) {
    const candidate = base.replace(/\.pdf$/, `-${n}.pdf`)
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate)
      return candidate
    }
    n += 1
  }
}

// Builds one ZIP containing every currently-invited student's Fusion Pass PDF, issuing a pass for
// anyone who doesn't have one yet so nobody is left out just because they never visited Pass
// Tools. Reading an existing pass's token (fetchPassToken) is Admin-only at the database level —
// a Staff account running this will see most students reported as skipped rather than a wrong or
// incomplete zip, the same limitation Pass Tools already has today for a single student.
export async function downloadAllPasses(
  eventId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<DownloadAllPassesResult> {
  const { students, periods } = await fetchRoster(eventId)
  const activeUuids = new Set(periods.filter((p) => p.droppedFromSessionId === null).map((p) => p.studentId))
  const activeStudents = students.filter((s) => activeUuids.has(s.uuid))
  // Falls back to no fusion ids (plain name-based filenames, same as before) rather than failing
  // the whole zip if this lookup errors for any reason.
  const fusionIds = await fetchFusionIdsByStudentIds(activeStudents.map((s) => s.uuid)).catch(() => new Map<string, string>())

  const zip = new JSZip()
  const usedNames = new Set<string>()
  const skipped: { name: string; reason: string }[] = []
  let issuedCount = 0
  let done = 0

  await runWithConcurrency(activeStudents, 6, async (student) => {
    try {
      let token = await fetchPassToken(student.uuid)
      if (!token) {
        await issuePass(student.uuid)
        token = await fetchPassToken(student.uuid)
        if (token) issuedCount += 1
      }
      if (!token) {
        skipped.push({ name: student.fullName, reason: "couldn't issue or read a pass for them" })
        return
      }
      const fusionId = fusionIds.get(student.uuid) ?? null
      const blob = await generatePassPdfBlob(student, token)
      zip.file(uniqueFileName(student, usedNames, fusionId), blob)
    } catch {
      skipped.push({ name: student.fullName, reason: 'something went wrong building their pass' })
    } finally {
      done += 1
      onProgress?.(done, activeStudents.length)
    }
  })

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  return {
    zipBlob,
    totalCount: activeStudents.length,
    includedCount: activeStudents.length - skipped.length,
    issuedCount,
    skipped,
  }
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Spaces and anything unsafe for a filename become underscores, same treatment passFileName
// already gives a student's name.
export function zipFileName(eventName: string): string {
  const safe = eventName.trim().replace(/[^a-zA-Z0-9]+/g, '_')
  return `fusion-passes-${safe}.zip`
}
