import { generateDeck } from './server/generateDeck.js'
const t0 = Date.now()
try {
  const deck = await generateDeck({
    prompt: 'A short deck about coffee origins',
    format: 'presentation',
    length: '4 cards',
    tone: 'Professional',
    language: 'English',
    mode: 'concise',
  })
  console.log('OK in', Date.now() - t0, 'ms')
  console.log('Title:', deck.title)
  console.log('Slides:', deck.slides.length, deck.slides.map(s => s.layout).join(','))
} catch (e) {
  console.error('FAILED in', Date.now() - t0, 'ms:', e.message)
}
