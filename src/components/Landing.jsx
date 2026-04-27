import './Landing.css'

/**
 * Sign-in landing page shown when no Replit user is authenticated.
 * Single CTA — Replit handles all credential collection on its own pages.
 */
export default function Landing({ onSignIn }) {
  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-brand">
          <div className="landing-brand-mark">S</div>
          <span className="landing-brand-name">
            Slide<span>AI</span>
          </span>
        </div>
        <button type="button" className="landing-signin" onClick={onSignIn}>
          Sign in
        </button>
      </header>

      <main className="landing-hero">
        <div className="landing-copy">
          <div className="landing-eyebrow">AI Presentations</div>
          <h1 className="landing-title">
            Beautiful slide decks,
            <br />
            <span className="landing-title-accent">drafted in seconds.</span>
          </h1>
          <p className="landing-lede">
            Describe what you want to present. SlideAI writes the outline,
            picks a theme, and types out every slide in front of you — with
            on-brand imagery and one-click rewrites.
          </p>
          <div className="landing-cta-row">
            <button
              type="button"
              className="landing-cta-primary"
              onClick={onSignIn}
            >
              Sign in with Replit
              <span aria-hidden>→</span>
            </button>
            <span className="landing-cta-note">
              Free · your decks save to your account
            </span>
          </div>
        </div>

        <aside className="landing-preview" aria-hidden>
          <div className="landing-card landing-card-1">
            <div className="landing-card-label">Slide 1 · Title</div>
            <div className="landing-card-h">The Future of Renewable Energy</div>
            <div className="landing-card-sub">
              How solar, wind, and storage reshape the next decade.
            </div>
          </div>
          <div className="landing-card landing-card-2">
            <div className="landing-card-label">Slide 4 · Comparison</div>
            <div className="landing-card-grid">
              <div>
                <div className="landing-card-mini">2015</div>
                <div className="landing-card-stat">$0.62/W</div>
              </div>
              <div>
                <div className="landing-card-mini">2025</div>
                <div className="landing-card-stat">$0.13/W</div>
              </div>
            </div>
          </div>
          <div className="landing-card landing-card-3">
            <div className="landing-card-label">Slide 7 · Bullets</div>
            <ul className="landing-card-bullets">
              <li>Storage costs down 89% in a decade</li>
              <li>Grid-scale batteries hit 200 GWh installed</li>
              <li>Wind LCOE undercuts coal in 84 markets</li>
            </ul>
          </div>
        </aside>
      </main>

      <section className="landing-features">
        <div className="landing-feature">
          <div className="landing-feature-icon" aria-hidden>✦</div>
          <h3>Streaming generation</h3>
          <p>
            Slides type in front of you so you can read while the model writes.
          </p>
        </div>
        <div className="landing-feature">
          <div className="landing-feature-icon" aria-hidden>◧</div>
          <h3>10 polished layouts</h3>
          <p>
            Title, bullets, comparisons, quotes, stats — chosen per slide.
          </p>
        </div>
        <div className="landing-feature">
          <div className="landing-feature-icon" aria-hidden>◴</div>
          <h3>Saves to your account</h3>
          <p>
            Every deck you generate stays linked to you, on every device.
          </p>
        </div>
      </section>

      <footer className="landing-footer">
        © {new Date().getFullYear()} SlideAI · Sign in powered by Replit
      </footer>
    </div>
  )
}
