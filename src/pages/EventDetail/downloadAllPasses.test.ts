import { describe, expect, it } from 'vitest'
import { uniqueFileName, zipFileName } from './downloadAllPasses'
import type { Student } from '../StudentDirectory/studentDirectoryData'

function student(firstName: string, lastName: string): Student {
  return { firstName, lastName } as Student
}

describe('uniqueFileName', () => {
  it('uses the plain name-based filename when there is no collision and no fusion id', () => {
    const used = new Set<string>()
    expect(uniqueFileName(student('Ava', 'White'), used)).toBe('Ava_White-fusion-pass.pdf')
  })

  it('appends the fusion id when one is given', () => {
    const used = new Set<string>()
    expect(uniqueFileName(student('Ava', 'White'), used, 'F0001')).toBe('Ava_White_F0001-fusion-pass.pdf')
  })

  it('two same-named students get distinct filenames from their own fusion ids, no extra suffix needed', () => {
    const used = new Set<string>()
    const first = uniqueFileName(student('Ava', 'White'), used, 'F0001')
    const second = uniqueFileName(student('Ava', 'White'), used, 'F0002')
    expect(first).toBe('Ava_White_F0001-fusion-pass.pdf')
    expect(second).toBe('Ava_White_F0002-fusion-pass.pdf')
  })

  it('falls back to a numbered suffix when a fusion id is missing for a collision', () => {
    const used = new Set<string>()
    uniqueFileName(student('Ava', 'White'), used)
    expect(uniqueFileName(student('Ava', 'White'), used)).toBe('Ava_White-fusion-pass-2.pdf')
  })

  it('keeps incrementing for a third collision', () => {
    const used = new Set<string>()
    uniqueFileName(student('Ava', 'White'), used)
    uniqueFileName(student('Ava', 'White'), used)
    expect(uniqueFileName(student('Ava', 'White'), used)).toBe('Ava_White-fusion-pass-3.pdf')
  })
})

describe('zipFileName', () => {
  it('sanitizes the event name the same way student names are sanitized', () => {
    expect(zipFileName("venture_test1: Fall Cohort!")).toBe('fusion-passes-venture_test1_Fall_Cohort_.zip')
  })
})
