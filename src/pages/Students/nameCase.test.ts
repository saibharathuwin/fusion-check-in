import { describe, expect, it } from 'vitest'
import { needsCaseFix, toNameCase } from './nameCase'

describe('needsCaseFix', () => {
  it('flags an all-caps name', () => {
    expect(needsCaseFix('JAXON')).toBe(true)
  })

  it('flags an all-lowercase name', () => {
    expect(needsCaseFix('jaxon')).toBe(true)
  })

  it('leaves an already mixed-case name alone', () => {
    expect(needsCaseFix('DeAndre')).toBe(false)
    expect(needsCaseFix('Jaxon')).toBe(false)
  })
})

describe('toNameCase', () => {
  it('title-cases a plain all-caps name', () => {
    expect(toNameCase('ADAMS')).toBe('Adams')
  })

  it('title-cases a plain all-lowercase name', () => {
    expect(toNameCase('adams')).toBe('Adams')
  })

  it('keeps "Mc" surnames correct', () => {
    expect(toNameCase('MCDONALD')).toBe('McDonald')
    expect(toNameCase('mcdonald')).toBe('McDonald')
  })

  it('keeps an apostrophe surname correct', () => {
    expect(toNameCase("O'BRIEN")).toBe("O'Brien")
    expect(toNameCase("o'brien")).toBe("O'Brien")
  })

  it('capitalizes both halves of a hyphenated name', () => {
    expect(toNameCase('MARY-JANE')).toBe('Mary-Jane')
    expect(toNameCase('smith-jones')).toBe('Smith-Jones')
  })

  it('title-cases a full name with multiple words', () => {
    expect(toNameCase('JOHN SMITH')).toBe('John Smith')
  })
})
