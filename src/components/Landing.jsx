import { useEffect, useRef, useState } from 'react'
import './Landing.css'

const NAV_LINKS = [
  { id: 'products', label: 'Products' },
  { id: 'solutions', label: 'Solutions' },
  { id: 'about', label: 'About' },
  { id: 'pricing', label: 'Pricing' },
]

const PRODUCTS = [
  {
    id: 'presentations',
    title: 'Presentations',
    body: 'Turn any idea into a polished slide deck. Export to PPT, PDF, and more.',
    accent: 'mint',
    preview: (
      <div className="prod-preview prod-preview-deck">
        <div className="prod-card prod-card-a">
          <div className="prod-eyebrow">Slide 01</div>
          <div className="prod-h">Unlock your startup's full potential</div>
          <div className="prod-wave" aria-hidden />
        </div>
      </div>
    ),
  },
  {
    id: 'social',
    title: 'Social Media',
    body: 'Generate platform‑ready social content — sized, styled, and ready to post.',
    accent: 'sun',
    preview: (
      <div className="prod-preview prod-preview-social">
        <div className="prod-phone">
          <div className="prod-phone-h">Olly's Birthday Bash</div>
          <div className="prod-phone-glow" aria-hidden />
        </div>
      </div>
    ),
  },
  {
    id: 'websites',
    title: 'Websites',
    body: 'Spin up a beautiful one‑pager from a prompt. Ship a real shareable URL.',
    accent: 'sky',
    preview: (
      <div className="prod-preview prod-preview-web">
        <div className="prod-browser">
          <div className="prod-browser-bar">
            <span /><span /><span />
          </div>
          <div className="prod-browser-body">
            <div className="prod-browser-h">Hello, world.</div>
            <div className="prod-browser-row" />
            <div className="prod-browser-row short" />
          </div>
        </div>
      </div>
    ),
  },
]

const FEATURES = [
  {
    icon: '✦',
    title: 'AI that drafts the whole thing',
    body: 'Outline, theme, layouts, copy, speaker notes — written in one pass.',
  },
  {
    icon: '◧',
    title: '10 polished slide layouts',
    body: 'Title, bullets, comparisons, quotes, stats — auto‑picked per slide.',
  },
  {
    icon: '✎',
    title: 'Edit any card, instantly',
    body: 'Swap layouts, rewrite a single slide, regenerate with one click.',
  },
  {
    icon: '⤓',
    title: 'Saved to your account',
    body: 'Every deck you generate is linked to you, on every device.',
  },
  {
    icon: '◴',
    title: 'Streaming generation',
    body: 'Slides type in front of you so you can read while the model writes.',
  },
  {
    icon: '✺',
    title: 'On‑brand imagery',
    body: 'Each slide gets a generated visual that matches the deck theme.',
  },
]

const FAQS = [
  {
    q: 'How is this different from PowerPoint or Google Slides?',
    a: 'You start from a prompt, not a blank canvas. We pick a theme, write the copy, choose layouts, and lay everything out for you in seconds.',
  },
  {
    q: 'Do I need a credit card to try it?',
    a: 'No. Sign in with Replit and you can generate your first deck right away.',
  },
  {
    q: 'Can I edit what the AI wrote?',
    a: 'Every word, layout, color and slide order is editable. You can also ask the AI to rewrite a single slide.',
  },
  {
    q: 'Do my decks save automatically?',
    a: 'Yes. Decks autosave to your account and show up in your dashboard for editing later.',
  },
]

export default function Landing({ onSignIn }) {
  return (
    <div className="g-landing">
      <LandingNav onSignIn={onSignIn} />
      <Hero onSignIn={onSignIn} />
      <ProductsBand />
      <PromptShowcase onSignIn={onSignIn} />
      <FeaturesGrid />
      <Faq />
      <CtaFooter onSignIn={onSignIn} />
    </div>
  )
}

function LandingNav({ onSignIn }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function jump(id) {
    setOpen(false)
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <header className={`g-nav ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="g-nav-inner">
        <button
          type="button"
          className="g-brand"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Gamma"
        >
          <span className="g-brand-mark">Γ</span>
          <span className="g-brand-name"><b>GAMMA</b></span>
        </button>

        <nav className="g-nav-links" aria-label="Primary">
          {NAV_LINKS.map((l) => (
            <button
              key={l.id}
              type="button"
              className="g-nav-link"
              onClick={() => jump(l.id)}
            >
              {l.label}
            </button>
          ))}
        </nav>

        <div className="g-nav-cta">
          <button type="button" className="g-link-btn" onClick={onSignIn}>
            Login
          </button>
          <button type="button" className="g-cta g-cta-primary" onClick={onSignIn}>
            Start for free
          </button>
          <button
            type="button"
            className="g-burger"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {open ? (
        <div className="g-nav-mobile" role="menu">
          {NAV_LINKS.map((l) => (
            <button key={l.id} type="button" onClick={() => jump(l.id)}>
              {l.label}
            </button>
          ))}
          <button type="button" onClick={onSignIn}>Login</button>
          <button type="button" className="g-cta g-cta-primary" onClick={onSignIn}>
            Start for free
          </button>
        </div>
      ) : null}
    </header>
  )
}

function Hero({ onSignIn }) {
  return (
    <section className="g-hero">
      <div className="g-hero-copy">
        <div className="g-hero-mark" aria-hidden>S</div>
        <h1 className="g-hero-title">
          Effortless AI design
          <br />
          for <span className="g-hero-underline">presentations</span>,
          <br />
          websites, and more
        </h1>
        <p className="g-hero-lede">
          Your ideas are brilliant. The universe deserves to see them. A
          captivating pitch deck? Easy. A stunning launch slide? Done. Make
          anything you can imagine almost as quickly as you can think it up.
        </p>
        <div className="g-hero-ctas">
          <button type="button" className="g-cta g-cta-primary g-cta-lg" onClick={onSignIn}>
            Start for free
          </button>
          <a className="g-cta g-cta-ghost g-cta-lg" href="#showcase">
            <span className="g-play" aria-hidden>▶</span>
            Watch video
          </a>
        </div>
        <div className="g-hero-trust">
          <span className="g-stars" aria-hidden>★★★★★</span>
          <span>Loved by 60M+ creators worldwide</span>
        </div>
      </div>

      <div className="g-hero-art" aria-hidden>
        <div className="g-art-card g-art-card-1">
          <div className="g-art-tabs">
            <span className="g-art-dot" />
            <span className="g-art-dot" />
            <span className="g-art-dot" />
          </div>
          <div className="g-art-eyebrow">Suggest images ✦</div>
          <div className="g-art-thumbs">
            <div className="g-art-thumb t-a" />
            <div className="g-art-thumb t-b" />
            <div className="g-art-thumb t-c" />
          </div>
        </div>

        <div className="g-art-card g-art-card-2">
          <div className="g-art-toolbar">
            <span className="g-art-tool"><b>Aa</b></span>
            <span className="g-art-tool">◧</span>
            <span className="g-art-tool">✦</span>
            <span className="g-art-tool">◴</span>
          </div>
          <div className="g-art-stage">
            <div className="g-art-bloom" />
            <div className="g-art-h">The art of Botany</div>
            <div className="g-art-row" />
            <div className="g-art-row short" />
          </div>
        </div>

        <div className="g-art-card g-art-card-3">
          <div className="g-art-eyebrow">Improve writing ✦</div>
          <div className="g-art-mountains" />
        </div>
      </div>
    </section>
  )
}

function ProductsBand() {
  return (
    <section className="g-band" id="products">
      <div className="g-band-grid">
        {PRODUCTS.map((p) => (
          <article key={p.id} className={`g-prod g-prod-${p.accent}`}>
            <div className="g-prod-art">{p.preview}</div>
            <div className="g-prod-body">
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function PromptShowcase({ onSignIn }) {
  const [prompt, setPrompt] = useState('')
  const [format, setFormat] = useState('presentation')
  const [length, setLength] = useState('8 cards')
  const ref = useRef(null)

  const formats = [
    { id: 'presentation', label: 'Presentation', icon: '▭' },
    { id: 'document', label: 'Document', icon: '☰' },
    { id: 'webpage', label: 'Webpage', icon: '◫' },
    { id: 'social', label: 'Social', icon: '◉' },
  ]

  const ideas = [
    'A 10-slide investor pitch for an AI legal-research startup',
    'Onboarding deck for new engineering hires',
    'Q2 2026 product launch announcement',
    '5-slide brand intro for a coffee subscription',
  ]

  function handleStart() {
    if (prompt.trim()) {
      try {
        // localStorage (not sessionStorage) so the prompt survives the
        // top-level navigation that the sign-in flow performs.
        localStorage.setItem('slideai:pendingPrompt', JSON.stringify({
          prompt: prompt.trim(),
          format,
          length,
        }))
      } catch { /* ignore */ }
    }
    onSignIn?.()
  }

  return (
    <section className="g-showcase" id="showcase">
      <div className="g-showcase-head">
        <div className="g-eyebrow">Try it</div>
        <h2>From a single prompt to a full deck.</h2>
        <p>Type what you want to present. We'll handle the outline, the layouts, the writing, and the visuals.</p>
      </div>

      <div className="g-prompt-card">
        <div className="g-prompt-tabs" role="tablist">
          {formats.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={format === f.id}
              className={`g-prompt-tab ${format === f.id ? 'is-on' : ''}`}
              onClick={() => setFormat(f.id)}
            >
              <span aria-hidden>{f.icon}</span> {f.label}
            </button>
          ))}
        </div>
        <textarea
          ref={ref}
          className="g-prompt-input"
          rows={3}
          placeholder="e.g. A 10-slide investor pitch for an AI-powered legal research startup."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="g-prompt-bottom">
          <div className="g-prompt-len">
            <span className="g-prompt-len-label">Length</span>
            <div className="g-seg">
              {['4 cards', '8 cards', '12 cards', '16 cards'].map((l) => (
                <button
                  key={l}
                  className={`g-seg-btn ${length === l ? 'is-on' : ''}`}
                  onClick={() => setLength(l)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="g-cta g-cta-primary g-prompt-go"
            onClick={handleStart}
          >
            Generate ✦
          </button>
        </div>
        <div className="g-prompt-ideas">
          <span>Try:</span>
          {ideas.map((i) => (
            <button
              key={i}
              type="button"
              className="g-idea"
              onClick={() => {
                setPrompt(i)
                ref.current?.focus()
              }}
            >
              {i}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeaturesGrid() {
  return (
    <section className="g-features" id="solutions">
      <div className="g-section-head">
        <div className="g-eyebrow">Why SlideAI</div>
        <h2>Everything you need to ship a deck today.</h2>
      </div>
      <div className="g-features-grid">
        {FEATURES.map((f) => (
          <div key={f.title} className="g-feature">
            <div className="g-feature-icon" aria-hidden>{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Faq() {
  const [open, setOpen] = useState(0)
  return (
    <section className="g-faq" id="about">
      <div className="g-section-head">
        <div className="g-eyebrow">FAQ</div>
        <h2>Questions, answered.</h2>
      </div>
      <ul className="g-faq-list">
        {FAQS.map((f, i) => (
          <li key={f.q} className={`g-faq-item ${open === i ? 'is-open' : ''}`}>
            <button
              type="button"
              className="g-faq-q"
              aria-expanded={open === i}
              onClick={() => setOpen(open === i ? -1 : i)}
            >
              <span>{f.q}</span>
              <span className="g-faq-chev" aria-hidden>{open === i ? '–' : '+'}</span>
            </button>
            {open === i ? <p className="g-faq-a">{f.a}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

function CtaFooter({ onSignIn }) {
  return (
    <>
      <section className="g-end" id="pricing">
        <div className="g-end-card">
          <h2>Generate your first deck for free.</h2>
          <p>Sign in with Replit. No credit card required.</p>
          <button type="button" className="g-cta g-cta-primary g-cta-lg" onClick={onSignIn}>
            Start for free
          </button>
        </div>
      </section>
      <footer className="g-foot">
        <div className="g-foot-inner">
          <div className="g-brand g-brand-foot">
            <span className="g-brand-mark">S</span>
            <span className="g-brand-name">slide<b>ai</b></span>
          </div>
          <div className="g-foot-copy">
            © {new Date().getFullYear()} SlideAI · Sign in powered by Replit
          </div>
        </div>
      </footer>
    </>
  )
}
