import { fetchDistinctPrograms } from '../StudentDirectory/studentDirectoryData'

export const OTHER_OPTION = 'Other (type manually)'

export const STUDENT_ID_PATTERN = /^\d{9}$/

// A pragmatic "does this look like an email" shape check — not full RFC 5322, which would reject
// or accept plenty of real addresses either way. This just catches the obviously-malformed cases
// (no @, no domain, stray spaces) before the stricter @uwindsor.ca domain check runs.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const NAME_MAX_LENGTH = 50

// Letters (any language — plenty of real names use accented or non-Latin characters), spaces,
// hyphens and apostrophes only. Must start with a letter, so a name can't be just punctuation.
// This is what actually catches "John123" or a stray symbol — length/required checks alone don't.
export const NAME_PATTERN = /^\p{L}[\p{L}\s'-]*$/u

export const FACULTIES = [
  'Faculty of Arts, Humanities and Social Sciences',
  'Faculty of Education',
  'Faculty of Engineering',
  'Faculty of Graduate Studies',
  'Faculty of Human Kinetics',
  'Faculty of Law',
  'Faculty of Nursing',
  'Odette School of Business',
  'Faculty of Science',
  'Schulich School of Medicine and Dentistry – Windsor Campus',
]

// Binary to match the real `students.level` check constraint (see supabase/seed.sql). Previously
// a 3-way Undergraduate/Master's/PhD split — Master's and PhD program lists below are merged
// under Graduate.
export type StudentLevel = 'Undergraduate' | 'Graduate'

export const LEVELS: StudentLevel[] = ['Undergraduate', 'Graduate']

export const YEARS = ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6']

type ProgramsByLevel = Partial<Record<StudentLevel, string[]>>

export const PROGRAMS_BY_FACULTY_AND_LEVEL: Record<string, ProgramsByLevel> = {
  'Faculty of Engineering': {
    Undergraduate: [
      'Civil Engineering',
      'Electrical Engineering',
      'Environmental Engineering',
      'General Engineering',
      'Industrial Engineering',
      'Industrial Engineering with Minor in Business Administration',
      'Mechanical Engineering',
      'Mechatronic Systems Engineering',
      'Engineering Technology',
    ],
    Graduate: [
      'Automotive Engineering MEng',
      'Civil Engineering MASc',
      'Civil Engineering MEng',
      'Electrical Engineering MASc',
      'Electrical Engineering MEng',
      'Environmental Engineering MASc',
      'Environmental Engineering MEng',
      'Industrial Engineering MASc',
      'Industrial Engineering MEng',
      'Mechanical Engineering MASc',
      'Mechanical Engineering MEng',
      'Master of Engineering Management',
      'Civil Engineering PhD',
      'Electrical Engineering PhD',
      'Environmental Engineering PhD',
      'Industrial and Manufacturing Systems Engineering PhD',
      'Mechanical Engineering PhD',
    ],
  },
  'Faculty of Arts, Humanities and Social Sciences': {
    Undergraduate: [
      'Psychology',
      'Criminology',
      'History',
      'English and Creative Writing',
      'English Language and Literature',
      'Social Work',
      'Political Science',
      'Communication Media & Film',
      'Dramatic Art',
      'Visual Arts',
      'Philosophy',
      'Sociology',
      'Sociology and Criminology',
      "Women's and Gender Studies",
      'French Studies',
      'Disability Studies',
      'Film Production',
      'International Relations',
      'Law and Politics',
      'Liberal Arts and Professional Studies',
      'Music (BA)',
    ],
    Graduate: [
      'Communication Media & Digital Culture MA',
      'Criminology MA',
      'English MA',
      'History MA',
      'Philosophy MA',
      'Political Science MA',
      'Psychology MA',
      'Social Work MSW',
      'Sociology MA',
      'Film & Media Arts MFA',
      'Visual Arts MFA',
      'Argumentation Studies PhD',
      'Psychology PhD',
      'Social Work PhD',
      'Sociology PhD',
    ],
  },
  'Faculty of Science': {
    Undergraduate: [
      'Biology',
      'Biochemistry',
      'Biomedical Sciences',
      'Chemistry',
      'Computer Science (Honours)',
      'Computer Science (General)',
      'Computer Science Applied Computing',
      'Computer Science Software Engineering Specialization',
      'Bachelor of Information Technology',
      'Mathematics BMath (Honours)',
      'Mathematics and Statistics',
      'Physics',
      'Economics BSc',
      'Forensic Science (BFS)',
      'Environmental Science',
      'Environmental Studies',
    ],
    Graduate: [
      'Master of Applied Computing',
      'Master of Applied Computing – AI Stream',
      'Computer Science MSc',
      'Biology MSc',
      'Chemistry and Biochemistry MSc',
      'Physics MSc',
      'Earth Sciences MSc',
      'Mathematics and Statistics MSc',
      'Master of Actuarial Science',
      'Master of Medical Biotechnology',
      'Computer Science PhD',
      'Biology PhD',
      'Chemistry and Biochemistry PhD',
      'Physics PhD',
      'Earth Sciences PhD',
      'Mathematics and Statistics PhD',
    ],
  },
  'Odette School of Business': {
    Undergraduate: [
      'Bachelor of Commerce – Accounting',
      'Bachelor of Commerce – Finance',
      'Bachelor of Commerce – Human Resources',
      'Bachelor of Commerce – Supply Chain and Business Analytics',
      'Bachelor of Commerce – Marketing',
      'Bachelor of Commerce – Strategy and Entrepreneurship',
      'Bachelor of Commerce – International Business',
    ],
    Graduate: [
      'MBA',
      'MBA for Managers and Professionals',
      'MBA Professional Accounting Specialization',
      'Master of Management – Business Analytics',
      'Master of Management – International Accounting and Finance',
      'Master of Management – Human Resource Management',
      'Master of Management – Supply Chain and Logistics',
    ],
  },
  'Faculty of Human Kinetics': {
    Undergraduate: ['Kinesiology', 'Sport Management and Leadership'],
    Graduate: [
      'Kinesiology and Health Studies MSc',
      'Sport Management and Leadership MSML',
      'Kinesiology and Health Studies PhD',
      'Sport Management and Leadership PhD',
    ],
  },
  'Faculty of Nursing': {
    Undergraduate: ['Bachelor of Science in Nursing'],
    Graduate: ['Master of Science in Nursing', 'Graduate Diploma in Primary Health Care Nurse Practitioner', 'Nursing PhD'],
  },
  'Faculty of Law': {
    Graduate: ['Master of Laws (LLM)'],
  },
  'Faculty of Education': {
    Undergraduate: [
      'History/Concurrent Education',
      'English/Concurrent Education',
      'Mathematics/Concurrent Education',
      'Visual Arts/Concurrent Education',
    ],
    Graduate: ['Master of Education', 'Education (joint PhD)'],
  },
  'Schulich School of Medicine and Dentistry – Windsor Campus': {},
  'Faculty of Graduate Studies': {},
}

export function getProgramSuggestions(faculty: string, level: StudentLevel | ''): string[] {
  if (!faculty || !level) return []
  return PROGRAMS_BY_FACULTY_AND_LEVEL[faculty]?.[level] ?? []
}

// Merges the static curated catalog above with real distinct program values already in use for
// this faculty+level (fetchDistinctPrograms, studentDirectoryData.ts) — the autocomplete then
// surfaces both the preset list and whatever staff have actually typed before (combined programs,
// certificates, diplomas, anything not in the preset). Typing a value in neither list is still
// always accepted; suggestions are just a convenience, never a restriction (see ProgramAutocomplete).
export async function getLiveProgramSuggestions(faculty: string, level: StudentLevel | ''): Promise<string[]> {
  if (!faculty || !level) return []
  const preset = getProgramSuggestions(faculty, level)
  const live = await fetchDistinctPrograms(faculty, level)
  const merged = new Map<string, string>()
  for (const program of [...preset, ...live]) merged.set(program.toLowerCase(), program)
  return Array.from(merged.values()).sort()
}

export interface NewStudentForm {
  firstName: string
  middleName: string
  lastName: string
  studentId: string
  email: string
  faculty: string
  customFaculty: string
  level: StudentLevel
  program: string
  currentYear: string
}

export const EMPTY_STUDENT_FORM: NewStudentForm = {
  firstName: '',
  middleName: '',
  lastName: '',
  studentId: '',
  email: '',
  faculty: '',
  customFaculty: '',
  level: 'Undergraduate',
  program: '',
  currentYear: '',
}
