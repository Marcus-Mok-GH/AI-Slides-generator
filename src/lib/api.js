async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
  return data
}

export async function generateDeck(payload) {
  const data = await postJson('/api/generate-deck', payload)
  return data.deck
}

export async function regenerateSlide({ deck, slideIndex, instruction }) {
  const data = await postJson('/api/regenerate-slide', {
    deck,
    slideIndex,
    instruction,
  })
  return data.slide
}
