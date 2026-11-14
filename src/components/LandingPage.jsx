import { useRef, useState } from 'react'
import { deckCostCents } from '../lib/pricing.js'
import { SampleDeckCard, SampleDeckViewer } from './SampleDeck.jsx'
import useTheme from '../lib/useTheme.js'
import './LandingPage.css'

/**
 * Public front door. Signed-out visitors land here instead of on the sign-in
 * form; every call to action continues into `/login` with whatever they asked
 * for already queued (see QUEUED_PROMPT_KEY in LoginPage/App).
 */

const QUEUED_PROMPT_KEY = 'slideai:queuedPrompt'

const EXAMPLE_IDEAS = [
  'Seed-round pitch for a climate-tech startup',
  'Q3 business review for a 40-person SaaS team',
  'Onboarding deck for new engineers',
  'Workshop on prompt engineering for marketers',
]

const STEPS = [
  {
    n: '01',
    title: 'Describe the deck',
    body: 'One sentence is enough. Add an audience, a length, an angle — or paste the notes you already have.',
  },
  {
    n: '02',
    title: 'Watch it write and design',
    body: 'Slides stream in one by one. Each one is written and laid out as its own HTML and CSS — no shared template.',
  },
  {
    n: '03',
    title: 'Polish, then present',
    body: 'Edit any slide by typing, or ask for a change in words. Export to PDF or PPTX, or send a share link.',
  },
]

const FEATURES = [
  {
    title: 'Slides designed from scratch',
    body: 'Every slide is authored as bespoke HTML and CSS around your content, so no two decks look alike.',
  },
  {
    title: 'Speaker notes included',
    body: 'Each slide carries notes that add substance for delivery instead of repeating the bullets.',
  },
  {
    title: 'Edit by describing the change',
    body: 'Rewrite a single slide in words, or open the HTML and CSS and take the wheel yourself.',
  },
  {
    title: 'Live streaming draft',
    body: 'Read the deck as it is being written, so you can judge the story before the last slide lands.',
  },
  {
    title: 'PDF, PPTX and JSON export',
    body: 'Hand off a file that matches the stage, slide for slide — same layout, same type, same charts.',
  },
  {
    title: 'Share a read-only link',
    body: 'Send a deck to someone without an account. They can page through it and start their own copy.',
  },
]

const LENGTHS = [4, 8, 12, 16]

const FAQS = [
  {
    q: 'Do I need a credit card to try it?',
    a: 'No. A new account starts with $100 of credits, which covers your first two hundred eight-slide decks. You only top up if you keep going.',
  },
  {
    q: 'How is this different from a template tool?',
    a: 'Template tools pour your words into fixed layouts. SlideAI writes the layout too — each slide is generated as its own HTML and CSS for the point you are making, whether that is a chart, a quote, a comparison or a numbered process.',
  },
  {
    q: 'Can I edit what the AI wrote?',
    a: 'Everything is editable. Change the copy, edit the HTML and CSS of a slide, regenerate one slide at a time, or describe the change you want and let the model apply it.',
  },
  {
    q: 'What happens when the deck is finished?',
    a: 'It autosaves to your account. Export it to PDF, PPTX or JSON, present it full-screen in the app, or share a read-only link that anyone can open — account or not.',
  },
  {
    q: 'How much does a deck cost?',
    a: 'Decks are priced by length, from $0.25 for four slides to $1.00 for sixteen. The price is shown on the generate button before you commit.',
  },
]

function startWithIdea(text) {
  const trimmed = (text || '').trim()
  try {
    if (trimmed) localStorage.setItem(QUEUED_PROMPT_KEY, trimmed)
  } catch { /* storage may be unavailable; sign-in still works */ }
  window.location.assign('/login?start=1')
}

function signIn() {
  // `?signin=1` keeps a returning visitor on the sign-in form even if a deck
  // idea is queued from the prompt box above.
  window.location.assign('/login?signin=1')
}

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`
}

const THEME_ICONS = { light: '☀', dark: '☾', system: '◐' }

export default function LandingPage() {
  const { mode, cycle } = useTheme()
  const [idea, setIdea] = useState('')
  const [showSample, setShowSample] = useState(false)
  const ideaRef = useRef(null)

  function useExample(text) {
    setIdea(text)
    ideaRef.current?.focus()
  }

  function onSubmit(e) {
    e.preventDefault()
    startWithIdea(idea)
  }

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <a className="lp-brand" href="/">
            <span className="lp-brand-mark">S</span>
            <span className="lp-brand-name">slide<b>ai</b></span>
          </a>

          <nav className="lp-links" aria-label="Sections">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>

          <div className="lp-nav-actions">
            <button
              type="button"
              className="lp-theme"
              onClick={cycle}
              aria-label={`Theme: ${mode}. Click to switch.`}
              title={`Theme: ${mode}`}
            >
              {THEME_ICONS[mode] || '◐'}
            </button>
            <button type="button" className="lp-btn lp-btn--ghost lp-btn--sm" onClick={signIn}>
              Sign in
            </button>
            <button
              type="button"
              className="lp-btn lp-btn--primary lp-btn--sm"
              onClick={() => startWithIdea('')}
            >
              Start free
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow">
              <span className="lp-eyebrow-rule" aria-hidden />
              AI deck studio
            </span>
            <h1 className="lp-title">
              A deck that looks
              <br />
              designed, from
              <br />
              one <em>sentence.</em>
            </h1>
            <p className="lp-lede">
              Describe what you need to present. SlideAI writes the story, designs
              every slide as real HTML and CSS, and hands you something you can
              present — or edit down to the last word.
            </p>
            <ul className="lp-facts">
              <li>$100 of credits on us</li>
              <li>No card required</li>
              <li>PDF &amp; PPTX export</li>
            </ul>
          </div>

          <form className="lp-prompt" onSubmit={onSubmit}>
            <div className="lp-prompt-head">
              <span className="lp-prompt-kicker">Start here</span>
              <h2 className="lp-prompt-title">What are you presenting?</h2>
            </div>
            <label className="lp-prompt-field">
              <span className="lp-sr-only">Describe your deck</span>
              <textarea
                ref={ideaRef}
                className="lp-prompt-input"
                rows={3}
                maxLength={300}
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="e.g. A 10-slide investor pitch for an AI legal-research startup, leading with traction."
              />
            </label>
            <div className="lp-chips" aria-label="Example ideas">
              {EXAMPLE_IDEAS.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="lp-chip"
                  onClick={() => useExample(example)}
                >
                  {example}
                </button>
              ))}
            </div>
            <div className="lp-prompt-foot">
              <span className="lp-prompt-note">Free to start · saves to your account</span>
              <button type="submit" className="lp-btn lp-btn--primary">
                Build my deck
                <span aria-hidden>→</span>
              </button>
            </div>
          </form>
        </section>

        {/* A real deck, rendered by the app itself */}
        <section className="lp-showcase" aria-labelledby="lp-showcase-title">
          <div className="lp-showcase-copy">
            <span className="lp-kicker">Sample</span>
            <h2 id="lp-showcase-title" className="lp-h2">
              This is one prompt, rendered live.
            </h2>
            <p className="lp-body">
              The slides next to this text are not screenshots. They are the real
              deck document the app produces, drawn by the same renderer you get
              after signing in — chart, notes and page furniture included.
            </p>
            <div className="lp-showcase-actions">
              <button
                type="button"
                className="lp-btn lp-btn--primary"
                onClick={() => setShowSample(true)}
              >
                Open the full deck
              </button>
              <button
                type="button"
                className="lp-btn lp-btn--quiet"
                onClick={() => ideaRef.current?.focus()}
              >
                Make one like it
              </button>
            </div>
          </div>
          <div className="lp-showcase-stage">
            <SampleDeckCard onOpen={() => setShowSample(true)} />
          </div>
        </section>

        {/* How it works */}
        <section className="lp-section" id="how" aria-labelledby="lp-how-title">
          <div className="lp-section-head">
            <span className="lp-kicker">Process</span>
            <h2 id="lp-how-title" className="lp-h2">
              Three steps, about a minute.
            </h2>
          </div>
          <ol className="lp-steps">
            {STEPS.map((step) => (
              <li key={step.n} className="lp-step">
                <span className="lp-step-n">{step.n}</span>
                <h3 className="lp-step-title">{step.title}</h3>
                <p className="lp-step-body">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section className="lp-section" id="features" aria-labelledby="lp-features-title">
          <div className="lp-section-head">
            <span className="lp-kicker">What is in the box</span>
            <h2 id="lp-features-title" className="lp-h2">
              Built for the part after the idea.
            </h2>
            <p className="lp-section-sub">
              Generating the outline is the easy half. SlideAI also handles the
              design, the delivery notes and the handoff.
            </p>
          </div>
          <div className="lp-features">
            {FEATURES.map((feature, i) => (
              <article key={feature.title} className="lp-feature">
                <span className="lp-feature-n">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="lp-feature-title">{feature.title}</h3>
                <p className="lp-feature-body">{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section className="lp-section" id="pricing" aria-labelledby="lp-pricing-title">
          <div className="lp-pricing">
            <div className="lp-pricing-copy">
              <span className="lp-kicker">Pricing</span>
              <h2 id="lp-pricing-title" className="lp-h2">
                $100 in credits, then pay per deck.
              </h2>
              <p className="lp-body">
                No subscription and no seat maths. A new account starts with $100
                of credits, so your first decks are already paid for. After that
                you top up only when you generate.
              </p>
              <button
                type="button"
                className="lp-btn lp-btn--primary"
                onClick={() => startWithIdea('')}
              >
                Start with $100 free
              </button>
            </div>
            <table className="lp-price-table">
              <caption className="lp-sr-only">Deck price by slide count</caption>
              <thead>
                <tr>
                  <th scope="col">Deck length</th>
                  <th scope="col">Cost</th>
                </tr>
              </thead>
              <tbody>
                {LENGTHS.map((n) => (
                  <tr key={n}>
                    <th scope="row">{n} slides</th>
                    <td>{money(deckCostCents(`${n} cards`))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
        <section className="lp-section" id="faq" aria-labelledby="lp-faq-title">
          <div className="lp-section-head">
            <span className="lp-kicker">Questions</span>
            <h2 id="lp-faq-title" className="lp-h2">
              Before you start.
            </h2>
          </div>
          <Faq />
        </section>

        {/* Closing */}
        <section className="lp-close">
          <div className="lp-close-inner">
            <h2 className="lp-close-title">Your next deck starts with a sentence.</h2>
            <p className="lp-close-sub">
              Sign up with an email and a password. The credits are already there.
            </p>
            <button
              type="button"
              className="lp-btn lp-btn--primary lp-btn--lg"
              onClick={() => startWithIdea(idea)}
            >
              {idea.trim() ? 'Start with my idea' : 'Start free'}
              <span aria-hidden>→</span>
            </button>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-foot-inner">
          <a className="lp-brand lp-brand--foot" href="/">
            <span className="lp-brand-mark">S</span>
            <span className="lp-brand-name">slide<b>ai</b></span>
          </a>
          <p className="lp-foot-note">
            Slides as HTML and CSS, written by an AI you can argue with.
          </p>
          <button type="button" className="lp-foot-signin" onClick={signIn}>
            Sign in
          </button>
        </div>
        <div className="lp-foot-legal">
          © {new Date().getFullYear()} SlideAI
        </div>
      </footer>

      {showSample ? (
        <SampleDeckViewer
          onClose={() => setShowSample(false)}
          onSignIn={() => {
            setShowSample(false)
            ideaRef.current?.focus()
          }}
        />
      ) : null}
    </div>
  )
}

function Faq() {
  const [open, setOpen] = useState(0)
  return (
    <ul className="lp-faq">
      {FAQS.map((item, i) => {
        const isOpen = open === i
        return (
          <li key={item.q} className={`lp-faq-item ${isOpen ? 'is-open' : ''}`}>
            <button
              type="button"
              className="lp-faq-q"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? -1 : i)}
            >
              <span>{item.q}</span>
              <span className="lp-faq-sign" aria-hidden>{isOpen ? '–' : '+'}</span>
            </button>
            {isOpen ? <p className="lp-faq-a">{item.a}</p> : null}
          </li>
        )
      })}
    </ul>
  )
}
