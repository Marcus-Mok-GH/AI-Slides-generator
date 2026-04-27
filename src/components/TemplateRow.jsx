import './TemplateRow.css'

const templates = [
  { name: 'Pitch deck', tag: 'Startup', grad: 'linear-gradient(135deg,#7c5cff,#ff6ea0)' },
  { name: 'Sales proposal', tag: 'Business', grad: 'linear-gradient(135deg,#ff9a55,#ff6ea0)' },
  { name: 'Product launch', tag: 'Marketing', grad: 'linear-gradient(135deg,#2ecc71,#7c5cff)' },
  { name: 'Quarterly review', tag: 'Internal', grad: 'linear-gradient(135deg,#1a1a1a,#6b6b6b)' },
  { name: 'Workshop', tag: 'Education', grad: 'linear-gradient(135deg,#f0c419,#ff9a55)' },
  { name: 'Case study', tag: 'Marketing', grad: 'linear-gradient(135deg,#3b82f6,#7c5cff)' },
]

export default function TemplateRow({ onSelect }) {
  function pick(name) {
    onSelect?.(name)
  }
  return (
    <section className="row" id="templates-row">
      <div className="row-head">
        <h2 className="row-title">Start from a template</h2>
        <button
          type="button"
          className="row-link"
          onClick={() => pick('Pitch deck')}
        >
          Browse all →
        </button>
      </div>
      <div className="template-grid">
        {templates.map((t) => (
          <button
            key={t.name}
            type="button"
            className="template-card"
            onClick={() => pick(t.name)}
            aria-label={`Use ${t.name} template`}
          >
            <div className="template-thumb" style={{ background: t.grad }}>
              <div className="template-mock">
                <span className="m-line w70" />
                <span className="m-line w40" />
                <span className="m-block" />
              </div>
            </div>
            <div className="template-meta">
              <span className="template-name">{t.name}</span>
              <span className="template-tag">{t.tag}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
