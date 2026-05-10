import { useState } from 'react'
import './TemplatesPage.css'

const ALL = 'All'

const templates = [
  // Sales & Business
  {
    name: 'Pitch deck',
    category: 'Sales',
    grad: 'linear-gradient(135deg,#7c5cff,#ff6ea0)',
    desc: 'Problem → solution → traction → ask',
    prompt:
      'A 10-slide investor pitch deck for [your startup]: problem, solution, market size, product, traction, business model, competition, team, ask, and vision.',
  },
  {
    name: 'Sales proposal',
    category: 'Sales',
    grad: 'linear-gradient(135deg,#ff9a55,#ff6ea0)',
    desc: 'Scope, pricing, and next steps for a prospect',
    prompt:
      'A 6-slide sales proposal for [client]: their goals, our recommended solution, scope of work, timeline, pricing tiers, and next steps.',
  },
  {
    name: 'Business case',
    category: 'Sales',
    grad: 'linear-gradient(135deg,#f0c419,#ff9a55)',
    desc: 'Justify a new initiative or investment',
    prompt:
      'A 7-slide business case for [initiative]: executive summary, problem statement, proposed solution, financial ROI, risks and mitigations, implementation plan, recommendation.',
  },
  {
    name: 'Partnership proposal',
    category: 'Sales',
    grad: 'linear-gradient(135deg,#ff6ea0,#f0c419)',
    desc: 'Frame a strategic alliance opportunity',
    prompt:
      'A 6-slide partnership proposal for [partner]: mutual opportunity, what we bring, what we ask for, how the partnership works, expected outcomes, call to action.',
  },

  // Marketing
  {
    name: 'Product launch',
    category: 'Marketing',
    grad: 'linear-gradient(135deg,#2ecc71,#7c5cff)',
    desc: 'Announce a new product with GTM framing',
    prompt:
      "An 8-slide product launch deck for [product]: what it is, who it's for, the problem it solves, key features, demo, pricing, GTM plan, and how to try it.",
  },
  {
    name: 'Campaign recap',
    category: 'Marketing',
    grad: 'linear-gradient(135deg,#3b82f6,#2ecc71)',
    desc: 'Performance summary for a marketing campaign',
    prompt:
      'A 7-slide marketing campaign recap for [campaign name]: objective, audience, channels, key creatives, results vs KPIs, learnings, and recommended next steps.',
  },
  {
    name: 'Competitive analysis',
    category: 'Marketing',
    grad: 'linear-gradient(135deg,#7c5cff,#3b82f6)',
    desc: 'Market landscape and differentiation story',
    prompt:
      'A 6-slide competitive analysis for [your product]: market overview, key competitors, feature comparison matrix, positioning map, our differentiation, strategic takeaways.',
  },
  {
    name: 'Brand guidelines',
    category: 'Marketing',
    grad: 'linear-gradient(135deg,#ff6ea0,#7c5cff)',
    desc: 'Visual and voice identity in one deck',
    prompt:
      "A 7-slide brand guidelines deck for [brand name]: brand story and mission, personality and voice, logo usage rules, color palette, typography, imagery style, do's and don'ts.",
  },

  // Internal
  {
    name: 'Quarterly review',
    category: 'Internal',
    grad: 'linear-gradient(135deg,#1a1a2e,#7c5cff)',
    desc: 'All-hands business review with KPIs',
    prompt:
      'A 10-slide Q[X] [YEAR] business review: highlights, KPIs vs target, wins, misses, customer stories, product progress, financials, lessons, priorities for next quarter.',
  },
  {
    name: 'OKR planning',
    category: 'Internal',
    grad: 'linear-gradient(135deg,#3b82f6,#1a1a2e)',
    desc: 'Set and align team objectives',
    prompt:
      'A 6-slide OKR planning deck for [team/company] for [period]: company context, our north star metric, 3 key objectives, key results per objective, dependencies and blockers, how we track progress.',
  },
  {
    name: 'Team retro',
    category: 'Internal',
    grad: 'linear-gradient(135deg,#2ecc71,#1a1a2e)',
    desc: 'What went well, what to improve',
    prompt:
      'A 5-slide team retrospective for [sprint/quarter]: what went well, what could be better, key learnings, action items with owners, and our commitments for next period.',
  },
  {
    name: 'Onboarding deck',
    category: 'Internal',
    grad: 'linear-gradient(135deg,#ff9a55,#2ecc71)',
    desc: 'Welcome new hires with context and culture',
    prompt:
      'A 8-slide employee onboarding deck for [company]: welcome message, company mission and history, product overview, team structure, how we work, tools and processes, first-week checklist, who to talk to.',
  },

  // Education
  {
    name: 'Workshop',
    category: 'Education',
    grad: 'linear-gradient(135deg,#f0c419,#ff9a55)',
    desc: 'Hands-on session with exercises',
    prompt:
      'An 8-slide workshop deck on [topic]: agenda, why it matters, core concept, framework, walkthrough example, hands-on exercise, recap, and resources.',
  },
  {
    name: 'Research presentation',
    category: 'Education',
    grad: 'linear-gradient(135deg,#7c5cff,#f0c419)',
    desc: 'Academic or industry research findings',
    prompt:
      'A 7-slide research presentation on [topic]: research question, methodology, key findings, data visualizations, analysis and interpretation, implications, conclusions and recommendations.',
  },
  {
    name: 'Course outline',
    category: 'Education',
    grad: 'linear-gradient(135deg,#3b82f6,#f0c419)',
    desc: 'Curriculum overview for a multi-module course',
    prompt:
      'A 6-slide course outline for [course name]: learning outcomes, target audience, module breakdown, teaching methods, assessment strategy, and next steps for enrollment.',
  },
  {
    name: 'Case study',
    category: 'Education',
    grad: 'linear-gradient(135deg,#3b82f6,#7c5cff)',
    desc: 'Customer story with measurable results',
    prompt:
      'A 6-slide customer case study about [customer]: their context, the challenge, the solution we built, implementation, measurable results, and a quote.',
  },

  // Strategy
  {
    name: 'Company roadmap',
    category: 'Strategy',
    grad: 'linear-gradient(135deg,#ff6ea0,#f0c419)',
    desc: 'Vision, bets, and timeline for the year',
    prompt:
      "A 7-slide company roadmap for [year]: company vision, strategic pillars, what we're building (H1 vs H2), key milestones, resource allocation, risks and assumptions, success metrics.",
  },
  {
    name: 'Go-to-market',
    category: 'Strategy',
    grad: 'linear-gradient(135deg,#2ecc71,#ff6ea0)',
    desc: 'Launch plan for a new product or market',
    prompt:
      'An 8-slide go-to-market strategy for [product/market]: market opportunity, ICP definition, positioning, channels and tactics, pricing strategy, launch timeline, success metrics, team and budget.',
  },
  {
    name: 'Investor update',
    category: 'Strategy',
    grad: 'linear-gradient(135deg,#7c5cff,#2ecc71)',
    desc: 'Monthly or quarterly update for investors',
    prompt:
      'A 6-slide monthly investor update for [company]: highlights and lowlights, KPIs dashboard, product updates, sales and revenue, team news, asks and support needed.',
  },
  {
    name: 'SWOT analysis',
    category: 'Strategy',
    grad: 'linear-gradient(135deg,#ff9a55,#7c5cff)',
    desc: 'Strengths, weaknesses, opportunities, threats',
    prompt:
      'A 5-slide SWOT analysis for [company or product]: executive summary, strengths (with evidence), weaknesses (with evidence), opportunities, threats, strategic priorities that emerge.',
  },
]

const categories = [ALL, ...Array.from(new Set(templates.map((t) => t.category)))]

export default function TemplatesPage({ onUseTemplate }) {
  const [activeCategory, setActiveCategory] = useState(ALL)
  const [hovered, setHovered] = useState(null)

  const filtered =
    activeCategory === ALL
      ? templates
      : templates.filter((t) => t.category === activeCategory)

  return (
    <div className="tpl-page">
      <div className="tpl-header">
        <h1 className="tpl-title">Templates</h1>
        <p className="tpl-sub">Pick a starting point — edit the prompt to make it yours.</p>
      </div>

      <div className="tpl-cats" role="tablist">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={activeCategory === cat}
            className={`tpl-cat-btn ${activeCategory === cat ? 'is-active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="tpl-grid">
        {filtered.map((t) => (
          <button
            key={t.name}
            type="button"
            className={`tpl-card ${hovered === t.name ? 'is-hovered' : ''}`}
            onClick={() => onUseTemplate?.(t.name, t.prompt)}
            onMouseEnter={() => setHovered(t.name)}
            onMouseLeave={() => setHovered(null)}
            aria-label={`Use ${t.name} template`}
          >
            <div className="tpl-thumb" style={{ background: t.grad }}>
              <div className="tpl-mock">
                <span className="tm-line w65" />
                <span className="tm-line w40" />
                <span className="tm-block" />
                <span className="tm-line w80" />
                <span className="tm-line w55" />
              </div>
            </div>
            <div className="tpl-info">
              <div className="tpl-row">
                <span className="tpl-name">{t.name}</span>
                <span className="tpl-tag">{t.category}</span>
              </div>
              <p className="tpl-desc">{t.desc}</p>
            </div>
            <div className="tpl-use-overlay">Use template →</div>
          </button>
        ))}
      </div>
    </div>
  )
}
