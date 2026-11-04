import './TemplateRow.css'

// Muted duotone covers, keyed by category — one consistent system instead
// of a rainbow of one-off gradients. Works on light and dark chrome.
const TINTS = {
  Sales: 'linear-gradient(135deg, #4f46e5, #6d28d9)',
  Startup: 'linear-gradient(135deg, #4f46e5, #6d28d9)',
  Business: 'linear-gradient(135deg, #3b82f6, #4f46e5)',
  Marketing: 'linear-gradient(135deg, #9333ea, #c026d3)',
  Internal: 'linear-gradient(135deg, #475569, #1e293b)',
  Education: 'linear-gradient(135deg, #0d9488, #0f766e)',
  Strategy: 'linear-gradient(135deg, #d97706, #b45309)',
}

const templates = [
  { name: 'Pitch deck', tag: 'Startup', },
  { name: 'Sales proposal', tag: 'Business', },
  { name: 'Product launch', tag: 'Marketing', },
  { name: 'Quarterly review', tag: 'Internal', },
  { name: 'Workshop', tag: 'Education', },
  { name: 'Case study', tag: 'Marketing', },
]

export default function TemplateRow({ onSelect, onBrowseAll }) {
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
          onClick={() => onBrowseAll?.()}
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
            <div className="template-thumb" style={{ background: TINTS[t.tag] || TINTS.Internal }}>
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
