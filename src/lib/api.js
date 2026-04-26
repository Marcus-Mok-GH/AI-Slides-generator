export async function generateDeck(payload) {
  const res = await fetch('/api/generate-deck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    throw new Error(`Server returned ${res.status}`)
  }
  if (!res.ok) {
    throw new Error(data?.error || `Server returned ${res.status}`)
  }
  return data.deck
}
