/**
 * Filename-safe slug for a deck title.
 *
 * Every download path (PDF, PPTX, JSON) and both server export routes derive
 * file names the same way, so the rule lives in one place.
 */
export function slugify(title) {
  return (
    String(title || 'deck')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'deck'
  )
}
