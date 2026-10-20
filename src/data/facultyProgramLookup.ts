// Flattened program -> faculty lookup for the Smart Import's fuzzy faculty matching, derived from
// the same curated catalog the Add Student form's program autocomplete already uses — kept as one
// source of truth rather than a second hand-maintained list that would drift out of sync with it.
// A separate file (not inlined in smartImport.ts) so the catalog itself stays easy to find and edit
// on its own, same reasoning as addStudentData.ts being its own file.
import Fuse from 'fuse.js'
import { FACULTIES, PROGRAMS_BY_FACULTY_AND_LEVEL } from '../pages/AddStudent/addStudentData'

export interface ProgramFacultyEntry {
  program: string
  faculty: string
}

export const PROGRAM_FACULTY_ENTRIES: ProgramFacultyEntry[] = Object.entries(PROGRAMS_BY_FACULTY_AND_LEVEL).flatMap(
  ([faculty, byLevel]) => Object.values(byLevel).flatMap((programs) => (programs ?? []).map((program) => ({ program, faculty }))),
)

const programFuse = new Fuse(PROGRAM_FACULTY_ENTRIES, { keys: ['program'], threshold: 0.4, includeScore: true })
const facultyFuse = new Fuse(
  FACULTIES.map((faculty) => ({ faculty })),
  { keys: ['faculty'], threshold: 0.4, includeScore: true },
)

export interface FacultyMatch {
  faculty: string
  // How the match was found — a caller uses this to decide how much to trust it: 'exact' and
  // 'suffix' are deterministic, 'program' and 'faculty-name' are a fuzzy guess.
  via: 'exact' | 'suffix' | 'program' | 'faculty-name'
  score: number // 0 = perfect match, 1 = worst — only meaningful for the two fuzzy 'via' values
}

// Tries, in order: an exact faculty name match; "Engineering" -> "Faculty of Engineering" style
// suffix normalizing; a fuzzy match of the faculty text itself (catches typos like "Facultty of
// Scence", and short forms like "Business" for "Odette School of Business"); a fuzzy match of the
// program text against the known program catalog, used only as a fallback when the faculty text is
// blank or doesn't resemble any real faculty. Returns null when nothing clears the threshold — the
// caller must never invent a faculty from nothing.
//
// Faculty text has to come before program text: a one-word program value ("General", "Bachelors")
// can score as a near-perfect literal match against an unrelated program ("General Engineering")
// purely by coincidence, which used to silently overrule an explicit, correct faculty answer like
// "Business" — see SmartImportReview rows for Odette students getting reassigned to whatever faculty
// their program text happened to resemble.
export function matchFaculty(facultyText: string, programText: string): FacultyMatch | null {
  const trimmedFaculty = facultyText.trim()
  if (trimmedFaculty) {
    const exact = FACULTIES.find((f) => f.toLowerCase() === trimmedFaculty.toLowerCase())
    if (exact) return { faculty: exact, via: 'exact', score: 0 }

    const suffixed = FACULTIES.find((f) => f.toLowerCase() === `faculty of ${trimmedFaculty.toLowerCase()}`)
    if (suffixed) return { faculty: suffixed, via: 'suffix', score: 0 }

    const [bestFaculty] = facultyFuse.search(trimmedFaculty)
    if (bestFaculty && bestFaculty.score !== undefined) {
      return { faculty: bestFaculty.item.faculty, via: 'faculty-name', score: bestFaculty.score }
    }
  }

  const trimmedProgram = programText.trim()
  if (trimmedProgram) {
    const [bestProgram] = programFuse.search(trimmedProgram)
    if (bestProgram && bestProgram.score !== undefined) {
      return { faculty: bestProgram.item.faculty, via: 'program', score: bestProgram.score }
    }
  }

  return null
}
