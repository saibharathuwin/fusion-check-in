// Fixes casing on a name that came in ALL CAPS or all lowercase from a survey export, without
// mangling "McDonald", "O'Brien" or hyphenated names the way a naive per-word capitalize() would
// ("Mcdonald", "O'brien"). Only touches names that are entirely one case — a name that's already
// mixed case (e.g. "deAndre") is left exactly as typed, since there's no reliable way to tell a
// stylistic choice from a typo.
export function needsCaseFix(name: string): boolean {
  const letters = name.replace(/[^a-zA-Z]/g, '')
  if (letters.length === 0) return false
  return letters === letters.toUpperCase() || letters === letters.toLowerCase()
}

// Capitalizes a single word, respecting an internal apostrophe (O'Brien) and a "Mc" prefix
// (McDonald) — the two patterns a plain capitalize-first-letter would get wrong. "Mac" surnames
// (MacArthur vs. Macy) aren't disambiguated; they fall through to plain title case.
function capitalizeWord(word: string): string {
  if (word.length === 0) return word
  const lower = word.toLowerCase()

  if (lower.startsWith("mc") && lower.length > 2) {
    return 'Mc' + lower[2].toUpperCase() + lower.slice(3)
  }

  const apostropheIndex = word.indexOf("'")
  if (apostropheIndex > 0 && apostropheIndex < word.length - 1) {
    return capitalizeWord(word.slice(0, apostropheIndex)) + "'" + capitalizeWord(word.slice(apostropheIndex + 1))
  }

  return lower[0].toUpperCase() + lower.slice(1)
}

export function toNameCase(name: string): string {
  return name
    .trim()
    .split(/(\s+|-)/) // keep the separators (spaces, hyphens) in the split so they survive untouched
    .map((part) => (part.trim() === '' || part === '-' ? part : capitalizeWord(part)))
    .join('')
}
