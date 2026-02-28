import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Database, Shield, Brain, ChevronDown, ChevronUp, Clock, Rows3, Sparkles, Table2, BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon, Hash, Info, Lightbulb, MessageSquare } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const API = import.meta.env.VITE_API_URL || ''
const COLORS = ['#00D4FF', '#7B61FF', '#00C9A7', '#FFB547', '#FF6B8A', '#0072BC']

function ConfidenceBadge({ level }) {
  const cfg = { high: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'High Confidence' }, medium: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Medium Confidence' }, low: { bg: 'bg-rose-500/15', text: 'text-rose-400', label: 'Low Confidence' } }
  const c = cfg[level] || cfg.medium
  return <span className={`${c.bg} ${c.text} text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full`}>{c.label}</span>
}

function Chart({ type, data, config }) {
  if (!data?.length) return null
  const xKey = config?.x_key || Object.keys(data[0])[0]
  const yKey = config?.y_key || Object.keys(data[0])[1]
  const yKeys = Array.isArray(yKey) ? yKey : [yKey]
  const fmt = (v) => typeof v === 'number' ? (v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v.toFixed(1)) : v

  const common = { style: { fontSize: 11, fill: '#8B9DC3' } }

  if (type === 'number') {
    const val = data[0]?.[Object.keys(data[0])[0]] ?? data[0]?.[Object.keys(data[0])[1]]
    return <div className="flex items-center justify-center py-8"><span className="font-display text-5xl text-cyan-400 italic">{typeof val === 'number' ? fmt(val) : val}</span></div>
  }

  if (type === 'table') {
    const cols = Object.keys(data[0])
    return (
      <div className="overflow-auto max-h-64 rounded-lg border border-dark-600">
        <table className="w-full text-xs">
          <thead><tr className="bg-dark-700">{cols.map(c => <th key={c} className="px-3 py-2 text-left font-mono text-cyan-400/70 uppercase tracking-wider">{c}</th>)}</tr></thead>
          <tbody>{data.slice(0, 50).map((row, i) => <tr key={i} className="border-t border-dark-600 hover:bg-dark-700/50">{cols.map(c => <td key={c} className="px-3 py-1.5 text-gray-300">{typeof row[c] === 'number' ? fmt(row[c]) : String(row[c] ?? '')}</td>)}</tr>)}</tbody>
        </table>
      </div>
    )
  }

  if (type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie data={data.slice(0, 6)} dataKey={yKeys[0]} nameKey={xKey} cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${fmt(value)}`} labelLine={true}>
            {data.slice(0, 6).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: '#131D33', border: '1px solid #1e3a5f', borderRadius: 8, fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
          <XAxis dataKey={xKey} {...common} />
          <YAxis tickFormatter={fmt} {...common} />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ background: '#131D33', border: '1px solid #1e3a5f', borderRadius: 8, fontSize: 12 }} formatter={fmt} />
          {yKeys.length > 1 && <Legend />}
          {yKeys.map((k, i) => <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />)}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  // Default: line
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
        <XAxis dataKey={xKey} {...common} />
        <YAxis tickFormatter={fmt} {...common} />
        <Tooltip cursor={{ stroke: 'rgba(255,255,255,0.1)' }} contentStyle={{ background: '#131D33', border: '1px solid #1e3a5f', borderRadius: 8, fontSize: 12 }} formatter={fmt} />
        {yKeys.length > 1 && <Legend />}
        {yKeys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />)}
      </LineChart>
    </ResponsiveContainer>
  )
}

function ResponseCard({ res, onAsk }) {
  const [sqlOpen, setSqlOpen] = useState(false)
  const [lineageOpen, setLineageOpen] = useState(false)
  const chartIcon = { line: <LineChartIcon size={14} />, bar: <BarChart3 size={14} />, pie: <PieChartIcon size={14} />, table: <Table2 size={14} />, number: <Hash size={14} /> }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      {/* Answer */}
      <div className="bg-dark-700 border border-dark-600 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <p className="text-sm leading-relaxed text-gray-200">{res.answer}</p>
          <ConfidenceBadge level={res.confidence} />
        </div>
        {res.insight && <div className="flex items-start gap-2 text-xs text-teal-400/80 bg-teal-400/5 rounded-lg px-3 py-2"><Lightbulb size={13} className="mt-0.5 shrink-0" />{res.insight}</div>}
      </div>

      {/* Chart */}
      {res.data?.length > 0 && (
        <div className="bg-dark-700 border border-dark-600 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
            {chartIcon[res.chart_type]}<span className="font-mono uppercase tracking-wider">{res.chart_config?.title || 'Results'}</span>
            <span className="ml-auto text-dark-600">|</span>
            <Rows3 size={12} />{res.rows_returned} rows
            <span className="text-dark-600">|</span>
            <Clock size={12} />{res.execution_time_ms}ms
          </div>
          <Chart type={res.chart_type} data={res.data} config={res.chart_config} />
        </div>
      )}

      {/* SQL + Lineage toggles */}
      <div className="flex gap-2">
        <button onClick={() => setSqlOpen(!sqlOpen)} className="flex items-center gap-1.5 text-[11px] font-mono text-gray-500 hover:text-cyan-400 transition-colors bg-dark-700 border border-dark-600 rounded-lg px-3 py-1.5">
          <Database size={12} />SQL {sqlOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {res.lineage?.length > 0 && (
          <button onClick={() => setLineageOpen(!lineageOpen)} className="flex items-center gap-1.5 text-[11px] font-mono text-gray-500 hover:text-teal-400 transition-colors bg-dark-700 border border-dark-600 rounded-lg px-3 py-1.5">
            <Shield size={12} />Lineage {lineageOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>

      <AnimatePresence>
        {sqlOpen && (
          <motion.pre initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-dark-800 border border-dark-600 rounded-xl p-4 text-xs font-mono text-cyan-400/80 overflow-x-auto">
            {res.sql}
          </motion.pre>
        )}
        {lineageOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-dark-800 border border-dark-600 rounded-xl p-4 space-y-2">
            {res.lineage.map((l, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="font-mono text-violet-400">{l.table}</span>
                <span className="text-gray-500">←</span>
                <span className="text-gray-400">{l.source}</span>
                <span className="ml-auto text-gray-500">{l.refresh}</span>
                <span className={`font-mono ${l.quality_score >= 0.95 ? 'text-emerald-400' : 'text-amber-400'}`}>{(l.quality_score * 100).toFixed(0)}% quality</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Follow-up suggestions */}
      {(res.follow_ups?.length > 0 || res.follow_up) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Sparkles size={12} className="text-cyan-400/50" />
            <span>Continue exploring:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(res.follow_ups?.length > 0 ? res.follow_ups : [res.follow_up]).map((q, i) => (
              <button key={i} onClick={() => onAsk(q)} className="text-left text-xs text-gray-400 hover:text-cyan-400 bg-dark-700 hover:bg-dark-600 border border-dark-600 hover:border-cyan-400/20 rounded-lg px-3 py-2 transition-all hover:-translate-y-0.5">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}

export default function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const bottomRef = useRef(null)

  useEffect(() => {
    fetch(`${API}/api/suggestions`).then(r => r.json()).then(setSuggestions).catch(() => {})
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function ask(question) {
    if (!question.trim()) return
    const q = question.trim()
    setInput('')
    setMessages(prev => [...prev, { type: 'user', text: q }])
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()
      setMessages(prev => [...prev, { type: 'response', data }])
    } catch (err) {
      setMessages(prev => [...prev, { type: 'error', text: err.message }])
    } finally {
      setLoading(false)
    }
  }

  const empty = messages.length === 0 && !loading

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-3 border-b border-dark-600 bg-dark-900/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-violet-400 flex items-center justify-center"><Brain size={18} className="text-dark-900" /></div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">Analytics Copilot</h1>
            <p className="text-[10px] text-gray-500 font-mono tracking-wider">AUTONOMOUS INTELLIGENCE · POC</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4 text-[10px] font-mono text-gray-500">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>GPT-4o</span>
          <span className="flex items-center gap-1"><Database size={10} />PostgreSQL</span>
          <span className="flex items-center gap-1"><Shield size={10} />Lineage Active</span>
        </div>
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Welcome state */}
          {empty && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-16 text-center">
              <h2 className="font-display text-4xl italic text-gray-200 mb-2">Ask anything about your data</h2>
              <p className="text-sm text-gray-500 mb-10">Natural language → SQL → Insights → Charts. Powered by GPT-4o with full transparency.</p>
              <div className="grid grid-cols-2 gap-2 max-w-xl mx-auto">
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => ask(s)} className="text-left text-xs text-gray-400 bg-dark-700 hover:bg-dark-600 border border-dark-600 hover:border-cyan-400/20 rounded-xl px-4 py-3 transition-all hover:-translate-y-0.5">
                    <Sparkles size={12} className="text-cyan-400/50 mb-1.5" />
                    {s}
                  </button>
                ))}
              </div>
              {/* Pillar badges */}
              <div className="flex items-center justify-center gap-3 mt-12 flex-wrap">
                {['Agentic AI', 'AI-Native Data', 'Responsible AI', 'Analytics Copilot'].map(p => (
                  <span key={p} className="text-[10px] font-mono text-cyan-400/50 border border-cyan-400/10 rounded-full px-3 py-1">{p}</span>
                ))}
              </div>
            </motion.div>
          )}

          {/* Conversation */}
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.type === 'user' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex justify-end">
                  <div className="bg-cyan-400/10 border border-cyan-400/15 rounded-2xl rounded-br-md px-5 py-3 max-w-md">
                    <p className="text-sm text-gray-200">{msg.text}</p>
                  </div>
                </motion.div>
              )}
              {msg.type === 'response' && <ResponseCard res={msg.data} onAsk={ask} />}
              {msg.type === 'error' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-rose-400/10 border border-rose-400/15 rounded-2xl px-5 py-3">
                  <p className="text-sm text-rose-400">{msg.text}</p>
                </motion.div>
              )}
            </div>
          ))}

          {/* Loading */}
          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 thinking bg-dark-700 border border-cyan-400/10 rounded-2xl px-5 py-4 max-w-xs">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-400" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />)}
              </div>
              <span className="text-xs text-gray-400">Analyzing data...</span>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-dark-600 bg-dark-900/80 backdrop-blur-md px-6 py-4">
        <div className="max-w-3xl mx-auto flex gap-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && ask(input)}
            placeholder="Ask a question about your data..."
            className="flex-1 bg-dark-700 border border-dark-600 focus:border-cyan-400/30 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-500 outline-none transition-colors"
            disabled={loading}
          />
          <button onClick={() => ask(input)} disabled={loading || !input.trim()} className="bg-cyan-400 hover:bg-cyan-500 disabled:opacity-30 disabled:cursor-not-allowed text-dark-900 font-semibold rounded-xl px-5 py-3 transition-colors flex items-center gap-2 text-sm">
            <Send size={16} />Ask
          </button>
        </div>
        <p className="max-w-3xl mx-auto text-[10px] text-gray-600 mt-2 text-center font-mono">
          Powered by GPT-4o · SQL generated in real-time · Full data lineage and transparency
        </p>
      </div>
    </div>
  )
}
