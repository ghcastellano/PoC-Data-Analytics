import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send, Database, Shield, Brain, ChevronDown, ChevronUp, Clock, Rows3,
  Sparkles, Table2, BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon,
  Hash, Lightbulb, LayoutDashboard, MessageSquare, Eye, Activity,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, XCircle,
  RefreshCw, FileText, Share2, Filter, Cpu, Zap, ArrowRight, Copy, Check,
  Radio, Search, Link2, MessageCircle
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area
} from 'recharts'

const API = import.meta.env.VITE_API_URL || ''
const COLORS = ['#00D4FF', '#7B61FF', '#00C9A7', '#FFB547', '#FF6B8A', '#0072BC']
const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'copilot', label: 'Copilot', icon: MessageSquare },
  { id: 'governance', label: 'Governance', icon: Shield },
]

// ─── Utility Components ───

function ConfidenceBadge({ level }) {
  const cfg = {
    high: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'High Confidence' },
    medium: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Medium Confidence' },
    low: { bg: 'bg-rose-500/15', text: 'text-rose-400', label: 'Low Confidence' },
  }
  const c = cfg[level] || cfg.medium
  return <span className={`${c.bg} ${c.text} text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full`}>{c.label}</span>
}

function TrustBadge({ score }) {
  const color = score >= 80 ? 'text-emerald-400 bg-emerald-400/10' : score >= 60 ? 'text-amber-400 bg-amber-400/10' : 'text-rose-400 bg-rose-400/10'
  return <span className={`${color} text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full flex items-center gap-1`}><Shield size={10} />{score}% trust</span>
}

function StatusDot({ status }) {
  const colors = { on_track: 'bg-emerald-400', warning: 'bg-amber-400', critical: 'bg-rose-400' }
  return <span className={`w-2 h-2 rounded-full ${colors[status] || colors.on_track} inline-block`} />
}

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-dark-600 rounded-lg ${className}`} />
}

// ─── Chart Component ───

function Chart({ type, data, config }) {
  if (!data?.length) return null
  const xKey = config?.x_key || Object.keys(data[0])[0]
  const yKey = config?.y_key || Object.keys(data[0])[1]
  let yKeys = Array.isArray(yKey) ? yKey : [yKey]
  const fmt = (v) => typeof v === 'number' ? (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toFixed(1)) : v
  const common = { style: { fontSize: 11, fill: '#8B9DC3' } }

  // Scale guard: if multiple y_keys have vastly different magnitudes, fall back to table
  if (yKeys.length > 1 && (type === 'line' || type === 'bar')) {
    const maxVals = yKeys.map(k => Math.max(...data.map(d => Math.abs(Number(d[k]) || 0))))
    const largest = Math.max(...maxVals)
    const smallest = Math.min(...maxVals.filter(v => v > 0))
    if (largest > 0 && smallest > 0 && largest / smallest > 50) {
      type = 'table' // auto-downgrade to table when scales are incompatible
    }
  }

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

// ─── Sparkline Mini Chart ───

function Sparkline({ data, color = '#00D4FF', height = 40 }) {
  if (!data?.length) return null
  const gradientId = `spark-${color.replace('#', '')}-${data.length}`
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data.map((v, i) => ({ v, i }))} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <YAxis domain={['dataMin', 'dataMax']} hide />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Agent Reasoning Panel (Rich Detail) ───

function AgentPanel({ trace, response, isOpen, onToggle }) {
  if (!trace?.length) return null

  const agentColors = { sql: 'text-cyan-400', analysis: 'text-violet-400', narrative: 'text-teal-400' }
  const agentBgColors = { sql: 'bg-cyan-400/5 border-cyan-400/15', analysis: 'bg-violet-400/5 border-violet-400/15', narrative: 'bg-teal-400/5 border-teal-400/15' }
  const agentIcons = { sql: Database, analysis: Activity, narrative: FileText }
  const agentLabels = { sql: 'SQL Agent', analysis: 'Analysis Agent', narrative: 'Narrative Agent' }

  const totalMs = trace.reduce((sum, t) => sum + (t.duration_ms || 0), 0)
  const successSteps = trace.filter(t => t.status === 'success' || t.status === 'partial')

  return (
    <div className="mt-3">
      <button onClick={onToggle} className="flex items-center gap-2 text-[11px] font-mono text-gray-400 hover:text-violet-400 transition-colors bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 w-full justify-between">
        <div className="flex items-center gap-2">
          <Cpu size={12} className="text-violet-400" />
          <span>Agent Pipeline Trace</span>
          <span className="text-dark-600">|</span>
          <span className="text-violet-400">{successSteps.length} agents</span>
          <span className="text-dark-600">|</span>
          <span className="text-cyan-400">{totalMs}ms total</span>
        </div>
        {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {/* Pipeline Timeline Bar */}
      {isOpen && totalMs > 0 && (
        <div className="mt-2 flex h-2 rounded-full overflow-hidden bg-dark-800 border border-dark-600">
          {trace.filter(t => t.duration_ms).map((t, i) => {
            const pct = ((t.duration_ms || 0) / totalMs) * 100
            const colors = { sql: 'bg-cyan-400', analysis: 'bg-violet-400', narrative: 'bg-teal-400' }
            return <div key={i} className={`${colors[t.agent] || 'bg-gray-600'} h-full`} style={{ width: `${pct}%` }} title={`${agentLabels[t.agent]}: ${t.duration_ms}ms`} />
          })}
        </div>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 space-y-2 overflow-hidden">
            {trace.filter(t => t.status === 'success' || t.status === 'partial').map((step, i) => {
              const Icon = agentIcons[step.agent] || Cpu
              const color = agentColors[step.agent] || 'text-gray-400'
              const bgColor = agentBgColors[step.agent] || 'bg-dark-800 border-dark-600'
              const label = agentLabels[step.agent] || step.agent

              return (
                <div key={i} className={`${bgColor} border rounded-xl p-4`}>
                  {/* Agent Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon size={14} className={color} />
                      <span className={`text-xs font-mono font-semibold ${color}`}>{label}</span>
                      {step.attempt && <span className="text-[10px] text-gray-600 bg-dark-800 px-1.5 py-0.5 rounded">attempt {step.attempt}</span>}
                      {step.status === 'success' && <CheckCircle2 size={12} className="text-emerald-400" />}
                      {step.status === 'partial' && <AlertTriangle size={12} className="text-amber-400" />}
                    </div>
                    {step.duration_ms != null && (
                      <span className="text-[10px] font-mono text-gray-500 flex items-center gap-1"><Clock size={10} />{step.duration_ms}ms</span>
                    )}
                  </div>

                  {/* Reasoning */}
                  {step.reasoning && <p className="text-[11px] text-gray-400 leading-relaxed mb-2 italic">{step.reasoning}</p>}

                  {/* SQL Agent Detail */}
                  {step.agent === 'sql' && step.sql && (
                    <pre className="text-[10px] font-mono text-cyan-400/70 bg-dark-800 rounded-lg p-2.5 overflow-x-auto mt-1 max-h-24 overflow-y-auto">{step.sql}</pre>
                  )}
                  {step.agent === 'sql' && step.rows !== undefined && (
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
                      <span className="flex items-center gap-1"><Rows3 size={10} />{step.rows} rows</span>
                      {step.tables_used && <span className="flex items-center gap-1"><Database size={10} />{step.tables_used.length} tables joined</span>}
                    </div>
                  )}

                  {/* Analysis Agent Detail */}
                  {step.agent === 'analysis' && step.findings && (
                    <div className="space-y-1.5 mt-1">
                      {step.findings.trends?.length > 0 && (
                        <div className="flex items-start gap-2 text-[10px]">
                          <TrendingUp size={10} className="text-emerald-400 mt-0.5 shrink-0" />
                          <div className="text-gray-400"><span className="text-emerald-400 font-semibold">{step.findings.trends_count} trend(s):</span> {step.findings.trends.join(' | ')}</div>
                        </div>
                      )}
                      {step.findings.outliers?.length > 0 && (
                        <div className="flex items-start gap-2 text-[10px]">
                          <AlertTriangle size={10} className="text-amber-400 mt-0.5 shrink-0" />
                          <div className="text-gray-400"><span className="text-amber-400 font-semibold">{step.findings.outliers_count} outlier(s):</span> {step.findings.outliers.join(' | ')}</div>
                        </div>
                      )}
                      {step.findings.risk_flags?.length > 0 && (
                        <div className="flex items-start gap-2 text-[10px]">
                          <XCircle size={10} className="text-rose-400 mt-0.5 shrink-0" />
                          <div className="text-gray-400"><span className="text-rose-400 font-semibold">{step.findings.risk_flags_count} risk flag(s):</span> {step.findings.risk_flags.join(' | ')}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Narrative Agent Detail */}
                  {step.agent === 'narrative' && (
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500">
                      {step.confidence && <ConfidenceBadge level={step.confidence} />}
                      {step.chart_selected && <span className="flex items-center gap-1 text-teal-400"><BarChart3 size={10} />Chart: {step.chart_selected}</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Agent Stepper (Timer-based, works on Vercel) ───

function AgentStepper() {
  const [activeStep, setActiveStep] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const t1 = setTimeout(() => setActiveStep(1), 2200)
    const t2 = setTimeout(() => setActiveStep(2), 4800)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setElapsed(e => e + 100), 100)
    return () => clearInterval(interval)
  }, [])

  const steps = [
    { icon: Database, label: 'SQL Agent', desc: 'Parsing question → generating PostgreSQL → executing against database...', color: 'cyan' },
    { icon: Activity, label: 'Analysis Agent', desc: 'Detecting trends, outliers & risk flags across data dimensions...', color: 'violet' },
    { icon: FileText, label: 'Narrative Agent', desc: 'Composing executive narrative with recommendations...', color: 'teal' },
  ]

  const colorMap = { cyan: 'text-cyan-400', violet: 'text-violet-400', teal: 'text-teal-400' }
  const bgMap = { cyan: 'bg-cyan-400', violet: 'bg-violet-400', teal: 'bg-teal-400' }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-dark-700 border border-dark-600 rounded-2xl p-5 max-w-lg">
      <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
        <div className="flex items-center gap-2">
          <Radio size={12} className="text-rose-400 animate-pulse" />
          <span className="font-mono uppercase tracking-wider">Multi-Agent Pipeline Active</span>
        </div>
        <span className="font-mono text-gray-600">{(elapsed / 1000).toFixed(1)}s</span>
      </div>
      <div className="space-y-2">
        {steps.map((step, i) => {
          const Icon = step.icon
          const isActive = i === activeStep
          const isDone = i < activeStep
          const isPending = i > activeStep
          return (
            <motion.div key={i} initial={{ opacity: 0.4 }} animate={{ opacity: isPending ? 0.3 : 1 }}
              className={`rounded-xl px-4 py-3 transition-all ${isActive ? 'bg-dark-600 border border-dark-600' : isDone ? 'bg-dark-600/30' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Icon size={16} className={isDone ? 'text-emerald-400' : isActive ? colorMap[step.color] : 'text-gray-600'} />
                  {isActive && (
                    <motion.div className={`absolute -inset-2 rounded-full ${bgMap[step.color]} opacity-20`}
                      animate={{ scale: [1, 1.6, 1], opacity: [0.2, 0.05, 0.2] }}
                      transition={{ duration: 1.2, repeat: Infinity }} />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-semibold ${isDone ? 'text-emerald-400' : isActive ? colorMap[step.color] : 'text-gray-600'}`}>
                      {step.label}
                    </span>
                    {isDone && <CheckCircle2 size={12} className="text-emerald-400" />}
                    {isActive && (
                      <div className="flex gap-0.5">
                        {[0, 1, 2].map(j => (
                          <motion.div key={j} className={`w-1 h-1 rounded-full ${bgMap[step.color]}`}
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 1, repeat: Infinity, delay: j * 0.2 }} />
                        ))}
                      </div>
                    )}
                  </div>
                  {(isActive || isDone) && (
                    <span className="text-[10px] text-gray-500">{isDone ? 'Complete' : step.desc}</span>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}

// ─── Conversation Memory Indicator ───

function ConversationBadge({ turnCount, conversationId }) {
  if (!turnCount || turnCount < 1) return null
  return (
    <div className="flex items-center gap-2 text-[10px] font-mono text-violet-400/70 bg-violet-400/5 border border-violet-400/10 rounded-full px-3 py-1">
      <MessageCircle size={10} />
      <span>Context: {turnCount} turn{turnCount > 1 ? 's' : ''}</span>
      <span className="text-dark-600">|</span>
      <span className="text-gray-600">{conversationId}</span>
    </div>
  )
}

// ─── Response Card (Copilot) ───

function ResponseCard({ res, onAsk, turnNumber, conversationId }) {
  const [sqlOpen, setSqlOpen] = useState(false)
  const [lineageOpen, setLineageOpen] = useState(false)
  const [traceOpen, setTraceOpen] = useState(true)
  const [shared, setShared] = useState(false)
  const chartIcon = { line: <LineChartIcon size={14} />, bar: <BarChart3 size={14} />, pie: <PieChartIcon size={14} />, table: <Table2 size={14} />, number: <Hash size={14} /> }

  async function handleShare() {
    try {
      const resp = await fetch(`${API}/api/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: res.sql ? 'Shared insight' : '', response: res }),
      })
      const { share_id } = await resp.json()
      const url = `${window.location.origin}?share=${share_id}`
      await navigator.clipboard.writeText(url)
      setShared(true)
      setTimeout(() => setShared(false), 3000)
    } catch {}
  }

  function handleExport() {
    const text = `Analytics Copilot Report\n${'='.repeat(40)}\n\nAnswer: ${res.answer}\n\nInsight: ${res.insight || 'N/A'}\n\nNarrative: ${res.narrative || 'N/A'}\n\nRecommendation: ${res.recommendation || 'N/A'}\n\nConfidence: ${res.confidence}\nTrust Score: ${res.trust_score}%\nRows: ${res.rows_returned}\nExecution: ${res.execution_time_ms}ms\n\nSQL:\n${res.sql}\n\nGenerated by Analytics Copilot — NTT DATA`
    const blob = new Blob([text], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `copilot-report-${Date.now()}.txt`
    a.click()
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      {/* Conversation context badge */}
      {turnNumber > 1 && (
        <div className="flex items-center gap-2">
          <ConversationBadge turnCount={turnNumber} conversationId={conversationId || res.conversation_id} />
        </div>
      )}

      {/* Answer + Narrative */}
      <div className="bg-dark-700 border border-dark-600 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <p className="text-sm leading-relaxed text-gray-200">{res.answer}</p>
          <div className="flex items-center gap-2 shrink-0">
            {res.trust_score > 0 && <TrustBadge score={res.trust_score} />}
            <ConfidenceBadge level={res.confidence} />
          </div>
        </div>
        {res.narrative && (
          <div className="text-xs text-gray-400 leading-relaxed mb-3 pl-3 border-l-2 border-violet-400/30 italic">
            {res.narrative}
          </div>
        )}
        {res.insight && <div className="flex items-start gap-2 text-xs text-teal-400/80 bg-teal-400/5 rounded-lg px-3 py-2"><Lightbulb size={13} className="mt-0.5 shrink-0" />{res.insight}</div>}
        {res.recommendation && (
          <div className="flex items-start gap-2 text-xs text-violet-400/80 bg-violet-400/5 rounded-lg px-3 py-2 mt-2">
            <Sparkles size={13} className="mt-0.5 shrink-0" />{res.recommendation}
          </div>
        )}
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

      {/* Toggles: SQL, Lineage, Agent Trace, Export, Share */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setSqlOpen(!sqlOpen)} className="flex items-center gap-1.5 text-[11px] font-mono text-gray-500 hover:text-cyan-400 transition-colors bg-dark-700 border border-dark-600 rounded-lg px-3 py-1.5">
          <Database size={12} />SQL {sqlOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {res.lineage?.length > 0 && (
          <button onClick={() => setLineageOpen(!lineageOpen)} className="flex items-center gap-1.5 text-[11px] font-mono text-gray-500 hover:text-teal-400 transition-colors bg-dark-700 border border-dark-600 rounded-lg px-3 py-1.5">
            <Shield size={12} />Lineage {lineageOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <button onClick={handleExport} className="flex items-center gap-1.5 text-[11px] font-mono text-gray-500 hover:text-amber-400 transition-colors bg-dark-700 border border-dark-600 rounded-lg px-3 py-1.5">
            <FileText size={12} />Export
          </button>
          <button onClick={handleShare} className="flex items-center gap-1.5 text-[11px] font-mono text-gray-500 hover:text-violet-400 transition-colors bg-dark-700 border border-dark-600 rounded-lg px-3 py-1.5">
            {shared ? <><Check size={12} className="text-emerald-400" />Copied!</> : <><Share2 size={12} />Share</>}
          </button>
        </div>
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

      {/* Agent Trace */}
      <AgentPanel trace={res.agent_trace} response={res} isOpen={traceOpen} onToggle={() => setTraceOpen(!traceOpen)} />

      {/* Follow-ups */}
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

// ─── Executive Dashboard ───

function KpiCard({ kpi }) {
  const fmtValue = (v, fmt) => {
    if (v == null) return '—'
    if (fmt === 'currency') return v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v.toFixed(0)}`
    if (fmt === 'percentage') return `${v.toFixed(1)}%`
    if (fmt === 'score') return v.toFixed(1)
    return v.toLocaleString()
  }

  const statusIcon = {
    on_track: <CheckCircle2 size={14} className="text-emerald-400" />,
    warning: <AlertTriangle size={14} className="text-amber-400" />,
    critical: <XCircle size={14} className="text-rose-400" />,
  }

  const sparkColor = kpi.status === 'critical' ? '#FF6B8A' : kpi.status === 'warning' ? '#FFB547' : '#00D4FF'

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-dark-700 border border-dark-600 rounded-2xl p-5 hover:border-dark-600/80 transition-colors">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">{kpi.display_name}</span>
        {statusIcon[kpi.status]}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <span className="font-display text-2xl text-gray-100 italic">{fmtValue(kpi.value, kpi.format)}</span>
          {kpi.change_pct != null && (
            <span className={`ml-2 text-xs font-mono ${kpi.change_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'} flex items-center gap-0.5 inline-flex`}>
              {kpi.change_pct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {kpi.change_pct >= 0 ? '+' : ''}{kpi.change_pct}%
            </span>
          )}
        </div>
        {kpi.target && <span className="text-[10px] text-gray-600 font-mono">target: {fmtValue(kpi.target, kpi.format)}</span>}
      </div>
      <div className="mt-3 h-10">
        <Sparkline data={kpi.sparkline} color={sparkColor} height={40} />
      </div>
    </motion.div>
  )
}

function InsightCard({ insight }) {
  const severityStyles = {
    positive: { bg: 'bg-emerald-400/5', border: 'border-emerald-400/20', icon: <TrendingUp size={14} className="text-emerald-400" /> },
    info: { bg: 'bg-cyan-400/5', border: 'border-cyan-400/20', icon: <Lightbulb size={14} className="text-cyan-400" /> },
    warning: { bg: 'bg-amber-400/5', border: 'border-amber-400/20', icon: <AlertTriangle size={14} className="text-amber-400" /> },
    critical: { bg: 'bg-rose-400/5', border: 'border-rose-400/20', icon: <XCircle size={14} className="text-rose-400" /> },
  }
  const s = severityStyles[insight.severity] || severityStyles.info
  return (
    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className={`${s.bg} ${s.border} border rounded-xl p-4`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{s.icon}</div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-200">{insight.title}</p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">{insight.description}</p>
          <span className="inline-flex items-center gap-1 mt-2 text-[9px] font-mono text-violet-400/70 bg-violet-400/10 px-1.5 py-0.5 rounded"><Brain size={8} />AI Agent Insight</span>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Anomaly Detection Card ───

function AnomalyCard({ anomaly, onInvestigate }) {
  const severityStyles = {
    critical: { bg: 'bg-rose-400/5', border: 'border-rose-400/30', icon: <XCircle size={16} className="text-rose-400" />, accent: 'text-rose-400', glow: 'shadow-rose-500/10' },
    warning: { bg: 'bg-amber-400/5', border: 'border-amber-400/30', icon: <AlertTriangle size={16} className="text-amber-400" />, accent: 'text-amber-400', glow: 'shadow-amber-500/10' },
    info: { bg: 'bg-cyan-400/5', border: 'border-cyan-400/30', icon: <Lightbulb size={16} className="text-cyan-400" />, accent: 'text-cyan-400', glow: 'shadow-cyan-500/10' },
  }
  const s = severityStyles[anomaly.severity] || severityStyles.info

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className={`${s.bg} ${s.border} border rounded-xl p-4 ${s.glow} shadow-lg`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{s.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-sm font-semibold ${s.accent}`}>{anomaly.title}</span>
            {anomaly.change_pct && (
              <span className={`text-[10px] font-mono ${anomaly.change_pct < 0 ? 'text-rose-400' : 'text-emerald-400'} bg-dark-800 px-1.5 py-0.5 rounded`}>
                {anomaly.change_pct > 0 ? '+' : ''}{anomaly.change_pct}%
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">{anomaly.description}</p>
          <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-gray-500">
            {anomaly.metric && <span className="bg-dark-800 px-1.5 py-0.5 rounded">{anomaly.metric}</span>}
            {anomaly.business_unit && anomaly.business_unit !== 'All' && (
              <span className="bg-dark-800 px-1.5 py-0.5 rounded">{anomaly.business_unit}</span>
            )}
          </div>
          {anomaly.suggested_query && (
            <button onClick={() => onInvestigate(anomaly.suggested_query)}
              className="mt-3 flex items-center gap-1.5 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 bg-cyan-400/10 hover:bg-cyan-400/15 border border-cyan-400/20 rounded-lg px-3 py-1.5 transition-all">
              <Search size={12} /> Investigate in Copilot
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function DashboardTab({ onNavigateToCopilot }) {
  const [kpiData, setKpiData] = useState(null)
  const [insights, setInsights] = useState(null)
  const [anomalies, setAnomalies] = useState(null)
  const [businessUnits, setBusinessUnits] = useState([])
  const [selectedBu, setSelectedBu] = useState('')
  const [loadingKpis, setLoadingKpis] = useState(true)
  const [loadingInsights, setLoadingInsights] = useState(true)
  const [loadingAnomalies, setLoadingAnomalies] = useState(true)

  useEffect(() => {
    fetch(`${API}/api/dashboard/business-units`).then(r => r.json()).then(setBusinessUnits).catch(() => {})
  }, [])

  useEffect(() => {
    setLoadingKpis(true)
    setLoadingInsights(true)
    setLoadingAnomalies(true)
    const buParam = selectedBu ? `?bu=${encodeURIComponent(selectedBu)}` : ''
    fetch(`${API}/api/dashboard/kpis${buParam}`)
      .then(r => r.json()).then(d => { setKpiData(d); setLoadingKpis(false) }).catch(() => setLoadingKpis(false))
    fetch(`${API}/api/dashboard/insights${buParam}`)
      .then(r => r.json()).then(d => { setInsights(d); setLoadingInsights(false) }).catch(() => setLoadingInsights(false))
    fetch(`${API}/api/dashboard/anomalies${buParam}`)
      .then(r => r.json()).then(d => { setAnomalies(d); setLoadingAnomalies(false) }).catch(() => setLoadingAnomalies(false))
  }, [selectedBu])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-3xl italic text-gray-100">Executive Dashboard</h2>
          <p className="text-xs text-gray-500 mt-1 font-mono">Real-time KPIs with AI-generated insights and anomaly detection</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-dark-700 border border-dark-600 rounded-lg px-3 py-1.5">
            <Filter size={12} className="text-gray-500" />
            <select value={selectedBu} onChange={e => setSelectedBu(e.target.value)} className="bg-transparent text-xs text-gray-300 outline-none cursor-pointer">
              <option value="">All Business Units</option>
              {businessUnits.map(bu => <option key={bu.id} value={bu.name}>{bu.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      {loadingKpis ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-36" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {kpiData?.kpis?.map((kpi, i) => <KpiCard key={kpi.key} kpi={kpi} />)}
        </div>
      )}

      {/* Anomaly Detection */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Radio size={16} className="text-rose-400" />
          <h3 className="text-sm font-semibold text-gray-200">Anomaly Detection</h3>
          <span className="text-[10px] font-mono text-gray-600 bg-dark-700 border border-dark-600 rounded-full px-2 py-0.5">AI-powered</span>
          {loadingAnomalies && <RefreshCw size={12} className="text-gray-500 animate-spin" />}
        </div>
        {loadingAnomalies ? (
          <div className="space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        ) : anomalies?.anomalies?.length > 0 ? (
          <div className="space-y-3">
            {anomalies.anomalies.map((a, i) => (
              <AnomalyCard key={i} anomaly={a} onInvestigate={(q) => onNavigateToCopilot(q)} />
            ))}
            <div className="flex items-center gap-2 text-[10px] font-mono text-gray-600">
              <Activity size={10} />
              <span>Scanned {anomalies.data_points_analyzed} data points at {new Date(anomalies.scan_timestamp).toLocaleTimeString()}</span>
            </div>
          </div>
        ) : (
          <div className="bg-emerald-400/5 border border-emerald-400/20 rounded-xl p-4 flex items-center gap-3 text-xs">
            <CheckCircle2 size={14} className="text-emerald-400" />
            <span className="text-emerald-400/80">No anomalies detected — all KPIs within expected ranges.</span>
          </div>
        )}
      </div>

      {/* AI Insights */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Brain size={16} className="text-violet-400" />
          <h3 className="text-sm font-semibold text-gray-200">AI-Generated Insights</h3>
          {loadingInsights && <RefreshCw size={12} className="text-gray-500 animate-spin" />}
        </div>
        {loadingInsights ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : (
          <div className="space-y-3">
            {insights?.insights?.map((ins, i) => <InsightCard key={i} insight={ins} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Governance Tab ───

function AuditEntryCard({ entry }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-dark-700 border border-dark-600 rounded-xl p-4">
      <div className="flex items-start justify-between gap-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-200 truncate">{entry.question}</p>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] font-mono text-gray-500 flex-wrap">
            <span>{entry.rows} rows</span>
            <span>{entry.execution_time_ms}ms</span>
            <ConfidenceBadge level={entry.confidence} />
            {entry.trust_score > 0 && <TrustBadge score={entry.trust_score} />}
            {entry.agent_breakdown && (
              <span className="text-violet-400/70 flex items-center gap-1"><Cpu size={10} />{entry.agent_breakdown.length} agents</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-mono text-gray-600">{new Date(entry.timestamp).toLocaleTimeString()}</span>
          {entry.agent_breakdown && (expanded ? <ChevronUp size={12} className="text-gray-600" /> : <ChevronDown size={12} className="text-gray-600" />)}
        </div>
      </div>
      <AnimatePresence>
        {expanded && entry.agent_breakdown && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-3 pt-3 border-t border-dark-600 space-y-2 overflow-hidden">
            {entry.agent_breakdown.map((ab, j) => {
              const agentColors = { sql: 'text-cyan-400', analysis: 'text-violet-400', narrative: 'text-teal-400' }
              const agentIcons = { sql: Database, analysis: Activity, narrative: FileText }
              const agentLabels = { sql: 'SQL Agent', analysis: 'Analysis Agent', narrative: 'Narrative Agent' }
              const Icon = agentIcons[ab.agent] || Cpu
              return (
                <div key={j} className="flex items-start gap-3 text-[11px]">
                  <Icon size={12} className={`${agentColors[ab.agent] || 'text-gray-400'} mt-0.5 shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono font-semibold ${agentColors[ab.agent] || 'text-gray-400'}`}>{agentLabels[ab.agent] || ab.agent}</span>
                      <span className="text-gray-600 flex items-center gap-1"><Clock size={10} />{ab.duration_ms}ms</span>
                    </div>
                    {ab.reasoning && <p className="text-gray-500 mt-0.5 italic text-[10px] leading-relaxed">{ab.reasoning}</p>}
                  </div>
                </div>
              )
            })}
            {entry.analysis_summary && (entry.analysis_summary.trends?.length > 0 || entry.analysis_summary.risk_flags?.length > 0) && (
              <div className="mt-2 pt-2 border-t border-dark-600 space-y-1">
                {entry.analysis_summary.trends?.map((t, k) => (
                  <div key={k} className="flex items-start gap-2 text-[10px]"><TrendingUp size={10} className="text-emerald-400 mt-0.5 shrink-0" /><span className="text-gray-400">{t}</span></div>
                ))}
                {entry.analysis_summary.risk_flags?.map((f, k) => (
                  <div key={k} className="flex items-start gap-2 text-[10px]"><AlertTriangle size={10} className="text-rose-400 mt-0.5 shrink-0" /><span className="text-gray-400">{f}</span></div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function GovernanceTab({ clientAuditLog = [] }) {
  const [quality, setQuality] = useState(null)
  const [serverAudit, setServerAudit] = useState([])
  const [lineageGraph, setLineageGraph] = useState(null)
  const [agentStats, setAgentStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('quality')

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/governance/quality`).then(r => r.json()),
      fetch(`${API}/api/governance/audit`).then(r => r.json()),
      fetch(`${API}/api/governance/lineage-graph`).then(r => r.json()),
      fetch(`${API}/api/governance/agent-stats`).then(r => r.json()),
    ]).then(([q, a, l, s]) => {
      setQuality(q)
      setServerAudit(a)
      setLineageGraph(l)
      setAgentStats(s)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Merge server-side audit with client-side (deduplicate by timestamp)
  const auditData = useMemo(() => {
    const serverTimestamps = new Set(serverAudit.map(e => e.timestamp))
    const uniqueClient = clientAuditLog.filter(e => !serverTimestamps.has(e.timestamp))
    const merged = [...uniqueClient, ...serverAudit]
    merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    return merged
  }, [serverAudit, clientAuditLog])

  // Compute agent stats from merged audit data (client + server)
  const mergedAgentStats = useMemo(() => {
    const allEntries = auditData
    if (!allEntries.length) return agentStats
    const total = allEntries.length
    const avgMs = Math.round(allEntries.reduce((s, e) => s + (e.execution_time_ms || 0), 0) / total)
    const agentTimes = { sql: [], analysis: [], narrative: [] }
    for (const entry of allEntries) {
      for (const ab of (entry.agent_breakdown || [])) {
        if (ab.agent in agentTimes) agentTimes[ab.agent].push(ab.duration_ms || 0)
      }
    }
    const agentAvg = Object.fromEntries(Object.entries(agentTimes).map(([k, v]) => [k, v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0]))
    const confDist = { high: 0, medium: 0, low: 0 }
    for (const e of allEntries) confDist[e.confidence || 'medium'] = (confDist[e.confidence || 'medium'] || 0) + 1
    const successful = allEntries.filter(e => (e.trust_score || 0) > 50).length
    return {
      total_queries: total,
      avg_response_ms: avgMs,
      success_rate: total ? Math.round((successful / total) * 1000) / 10 : 100,
      agent_avg_ms: agentAvg,
      queries_by_confidence: confDist,
      avg_trust_score: Math.round(allEntries.reduce((s, e) => s + (e.trust_score || 0), 0) / total * 10) / 10,
    }
  }, [auditData, agentStats])

  const sections = [
    { id: 'quality', label: 'Data Quality', icon: CheckCircle2 },
    { id: 'audit', label: 'Audit Log', icon: Eye },
    { id: 'agents', label: 'Agent Performance', icon: Cpu },
    { id: 'lineage', label: 'Lineage', icon: Share2 },
  ]

  if (loading) {
    return <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl italic text-gray-100">Data Governance</h2>
        <p className="text-xs text-gray-500 mt-1 font-mono">Quality monitoring, audit trail, and data lineage</p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2">
        {sections.map(s => {
          const Icon = s.icon
          return (
            <button key={s.id} onClick={() => setActiveSection(s.id)} className={`flex items-center gap-2 text-xs font-mono px-4 py-2 rounded-lg transition-all ${activeSection === s.id ? 'bg-cyan-400/10 text-cyan-400 border border-cyan-400/20' : 'text-gray-500 bg-dark-700 border border-dark-600 hover:text-gray-300'}`}>
              <Icon size={14} />{s.label}
            </button>
          )
        })}
      </div>

      {/* Quality Section */}
      {activeSection === 'quality' && quality && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="bg-dark-700 border border-dark-600 rounded-2xl p-5 flex items-center gap-6">
            <div>
              <span className="text-xs font-mono text-gray-500">OVERALL QUALITY</span>
              <div className="font-display text-4xl italic text-emerald-400">{(quality.overall_quality * 100).toFixed(1)}%</div>
            </div>
            <div className="flex-1 h-3 bg-dark-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 rounded-full transition-all" style={{ width: `${quality.overall_quality * 100}%` }} />
            </div>
            <span className="text-xs font-mono text-gray-500">{quality.total_tables} tables tracked</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quality.tables.map(t => {
              const freshnessColor = { fresh: 'text-emerald-400', aging: 'text-amber-400', stale: 'text-rose-400' }
              return (
                <div key={t.table_name} className="bg-dark-700 border border-dark-600 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm text-cyan-400">{t.table_name}</span>
                    <span className={`text-[10px] font-mono ${freshnessColor[t.freshness]}`}>{t.freshness}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                    <div>Source: <span className="text-gray-300">{t.source_system}</span></div>
                    <div>Refresh: <span className="text-gray-300">{t.refresh_frequency}</span></div>
                    <div>Quality: <span className={`font-mono ${t.quality_score >= 0.95 ? 'text-emerald-400' : 'text-amber-400'}`}>{(t.quality_score * 100).toFixed(0)}%</span></div>
                    <div>Owner: <span className="text-gray-300">{t.owner}</span></div>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* Audit Log Section */}
      {activeSection === 'audit' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {auditData.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Eye size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">No queries logged yet. Ask questions in the Copilot to build the audit trail.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {auditData.map((entry, i) => <AuditEntryCard key={i} entry={entry} />)}
            </div>
          )}
        </motion.div>
      )}

      {/* Agent Performance Section */}
      {activeSection === 'agents' && mergedAgentStats && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Queries', value: mergedAgentStats.total_queries, color: 'text-gray-100' },
              { label: 'Avg Response', value: `${mergedAgentStats.avg_response_ms}ms`, color: 'text-cyan-400' },
              { label: 'Success Rate', value: `${mergedAgentStats.success_rate}%`, color: 'text-emerald-400' },
              { label: 'Avg Trust', value: mergedAgentStats.avg_trust_score, color: 'text-violet-400' },
            ].map(card => (
              <div key={card.label} className="bg-dark-700 border border-dark-600 rounded-xl p-4">
                <span className="text-[10px] font-mono text-gray-500 uppercase">{card.label}</span>
                <div className={`font-display text-2xl italic mt-1 ${card.color}`}>{card.value}</div>
              </div>
            ))}
          </div>

          <div className="bg-dark-700 border border-dark-600 rounded-2xl p-5">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
              <Cpu size={14} className="text-violet-400" />
              <span className="font-mono uppercase tracking-wider">Agent Response Time (avg)</span>
            </div>
            <div className="space-y-3">
              {[
                { key: 'sql', label: 'SQL Agent', icon: Database, color: 'cyan' },
                { key: 'analysis', label: 'Analysis Agent', icon: Activity, color: 'violet' },
                { key: 'narrative', label: 'Narrative Agent', icon: FileText, color: 'teal' },
              ].map(agent => {
                const ms = mergedAgentStats.agent_avg_ms[agent.key] || 0
                const maxMs = Math.max(...Object.values(mergedAgentStats.agent_avg_ms), 1)
                const pct = (ms / maxMs) * 100
                const Icon = agent.icon
                const barColors = { cyan: 'bg-cyan-400', violet: 'bg-violet-400', teal: 'bg-teal-400' }
                const textColors = { cyan: 'text-cyan-400', violet: 'text-violet-400', teal: 'text-teal-400' }
                return (
                  <div key={agent.key} className="flex items-center gap-3">
                    <Icon size={14} className={textColors[agent.color]} />
                    <span className={`text-xs font-mono w-32 ${textColors[agent.color]}`}>{agent.label}</span>
                    <div className="flex-1 h-3 bg-dark-800 rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, delay: 0.2 }} className={`h-full ${barColors[agent.color]} rounded-full`} />
                    </div>
                    <span className="text-xs font-mono text-gray-400 w-16 text-right">{ms}ms</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-dark-700 border border-dark-600 rounded-2xl p-5">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
              <Shield size={14} className="text-emerald-400" />
              <span className="font-mono uppercase tracking-wider">Confidence Distribution</span>
            </div>
            <div className="flex items-center gap-4">
              {['high', 'medium', 'low'].map(level => {
                const count = mergedAgentStats.queries_by_confidence[level] || 0
                const colors = { high: 'text-emerald-400 bg-emerald-400/10', medium: 'text-amber-400 bg-amber-400/10', low: 'text-rose-400 bg-rose-400/10' }
                return (
                  <div key={level} className={`flex-1 rounded-xl p-3 ${colors[level]} text-center`}>
                    <div className="font-display text-2xl italic">{count}</div>
                    <div className="text-[10px] font-mono uppercase mt-1">{level}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* Lineage Section */}
      {activeSection === 'lineage' && lineageGraph && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="bg-dark-700 border border-dark-600 rounded-2xl p-6">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
              <Share2 size={14} className="text-violet-400" />
              <span className="font-mono uppercase tracking-wider">Data Flow Diagram</span>
            </div>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              {/* Sources */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-gray-600 uppercase">Sources</span>
                {lineageGraph.nodes.filter(n => n.type === 'source').map(n => (
                  <div key={n.id} className="bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2 text-xs text-amber-400 font-mono">{n.label}</div>
                ))}
              </div>
              <div className="flex flex-col items-center gap-1">{[...Array(3)].map((_, i) => <ArrowRight key={i} size={14} className="text-dark-600" />)}</div>
              {/* Tables */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-gray-600 uppercase">Data Lake</span>
                {lineageGraph.nodes.filter(n => n.type === 'table').map(n => (
                  <div key={n.id} className="bg-cyan-400/10 border border-cyan-400/20 rounded-lg px-3 py-2 text-xs text-cyan-400 font-mono flex items-center gap-2">
                    {n.label}
                    {n.quality && <span className="text-[10px] text-emerald-400">{(n.quality * 100).toFixed(0)}%</span>}
                  </div>
                ))}
              </div>
              <div className="flex flex-col items-center gap-1">{[...Array(3)].map((_, i) => <ArrowRight key={i} size={14} className="text-dark-600" />)}</div>
              {/* Consumer */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-gray-600 uppercase">Consumer</span>
                {lineageGraph.nodes.filter(n => n.type === 'consumer').map(n => (
                  <div key={n.id} className="bg-violet-400/10 border border-violet-400/20 rounded-lg px-3 py-2 text-xs text-violet-400 font-mono flex items-center gap-2">
                    <Brain size={12} />{n.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}

// ─── Copilot Chat Tab (SSE Streaming + Conversation Memory) ───

function CopilotTab({ initialQuestion, onQueryComplete }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [conversationId, setConversationId] = useState(null)
  const [turnCount, setTurnCount] = useState(0)
  const bottomRef = useRef(null)
  const initialAsked = useRef(false)

  useEffect(() => {
    fetch(`${API}/api/suggestions`).then(r => r.json()).then(setSuggestions).catch(() => {})
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Handle initial question from Dashboard anomaly "Investigate" button
  useEffect(() => {
    if (initialQuestion && !initialAsked.current) {
      initialAsked.current = true
      ask(initialQuestion)
    }
  }, [initialQuestion])

  const ask = useCallback(async (question) => {
    if (!question.trim()) return
    const q = question.trim()
    setInput('')
    setMessages(prev => [...prev, { type: 'user', text: q }])
    setLoading(true)

    const newTurn = turnCount + 1
    setTurnCount(newTurn)

    try {
      const res = await fetch(`${API}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, conversation_id: conversationId }),
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()
      if (data.conversation_id && !conversationId) {
        setConversationId(data.conversation_id)
      }
      setMessages(prev => [...prev, { type: 'response', data, turn: newTurn }])

      // Pass audit data to parent for Governance tab
      if (onQueryComplete) {
        onQueryComplete({
          timestamp: data.timestamp,
          question: q,
          sql: data.sql,
          rows: data.rows_returned,
          confidence: data.confidence,
          trust_score: data.trust_score,
          execution_time_ms: data.execution_time_ms,
          agents: ['sql', 'analysis', 'narrative'],
          agent_breakdown: data.agent_trace?.filter(t => t.status === 'success' || t.status === 'partial').map(t => ({
            agent: t.agent,
            status: t.status,
            duration_ms: t.duration_ms || 0,
            reasoning: t.reasoning || '',
          })) || [],
          analysis_summary: {
            trends: data.analysis?.trends?.slice(0, 3) || [],
            risk_flags: data.analysis?.risk_flags || [],
            outliers: data.analysis?.outliers?.slice(0, 2) || [],
          },
        })
      }
    } catch (err) {
      setMessages(prev => [...prev, { type: 'error', text: err.message }])
    } finally {
      setLoading(false)
    }
  }, [conversationId, turnCount, onQueryComplete])

  const empty = messages.length === 0 && !loading

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6">
          {empty && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-12 text-center">
              <h2 className="font-display text-4xl italic text-gray-200 mb-2">Ask anything about your data</h2>
              <p className="text-sm text-gray-500 mb-3">Multi-agent pipeline: SQL → Analysis → Narrative. Full transparency with live streaming.</p>
              <p className="text-xs text-gray-600 mb-10">Ask follow-up questions — the agents remember your conversation context.</p>
              <div className="grid grid-cols-2 gap-2 max-w-xl mx-auto">
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => ask(s)} className="text-left text-xs text-gray-400 bg-dark-700 hover:bg-dark-600 border border-dark-600 hover:border-cyan-400/20 rounded-xl px-4 py-3 transition-all hover:-translate-y-0.5">
                    <Sparkles size={12} className="text-cyan-400/50 mb-1.5" />{s}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-center gap-3 mt-10 flex-wrap">
                {['Multi-Agent AI', 'Live Streaming', 'Conversation Memory', 'Data Governance'].map(p => (
                  <span key={p} className="text-[10px] font-mono text-cyan-400/50 border border-cyan-400/10 rounded-full px-3 py-1">{p}</span>
                ))}
              </div>
            </motion.div>
          )}

          {messages.map((msg, i) => (
            <div key={i}>
              {msg.type === 'user' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex justify-end">
                  <div className="bg-cyan-400/10 border border-cyan-400/15 rounded-2xl rounded-br-md px-5 py-3 max-w-md">
                    <p className="text-sm text-gray-200">{msg.text}</p>
                  </div>
                </motion.div>
              )}
              {msg.type === 'response' && <ResponseCard res={msg.data} onAsk={ask} turnNumber={msg.turn} conversationId={conversationId} />}
              {msg.type === 'error' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-rose-400/10 border border-rose-400/15 rounded-2xl px-5 py-3">
                  <p className="text-sm text-rose-400">{msg.text}</p>
                </motion.div>
              )}
            </div>
          ))}

          {loading && <AgentStepper />}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 pt-4">
        {/* Conversation context indicator */}
        {conversationId && turnCount > 0 && (
          <div className="flex items-center gap-2 mb-2">
            <ConversationBadge turnCount={turnCount} conversationId={conversationId} />
            <span className="text-[10px] text-gray-600">Agents will use previous context to resolve references</span>
          </div>
        )}
        <div className="flex gap-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && ask(input)}
            placeholder={turnCount > 0 ? "Ask a follow-up (agents remember context)..." : "Ask a question about your data..."}
            className="flex-1 bg-dark-700 border border-dark-600 focus:border-cyan-400/30 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-500 outline-none transition-colors"
            disabled={loading}
          />
          <button onClick={() => ask(input)} disabled={loading || !input.trim()} className="bg-cyan-400 hover:bg-cyan-500 disabled:opacity-30 disabled:cursor-not-allowed text-dark-900 font-semibold rounded-xl px-5 py-3 transition-colors flex items-center gap-2 text-sm">
            <Send size={16} />Ask
          </button>
        </div>
        <p className="text-[10px] text-gray-600 mt-2 text-center font-mono">
          Live Streaming · SQL Agent → Analysis Agent → Narrative Agent · Conversation Memory Active
        </p>
      </div>
    </div>
  )
}

// ─── Main App ───

function SharedReportView({ shareId }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${API}/api/share/${shareId}`)
      .then(r => { if (!r.ok) throw new Error('Report not found'); return r.json() })
      .then(setReport)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [shareId])

  if (loading) return <div className="min-h-screen bg-dark-900 flex items-center justify-center"><Skeleton className="w-96 h-48" /></div>
  if (error) return <div className="min-h-screen bg-dark-900 flex items-center justify-center text-rose-400">{error}</div>

  return (
    <div className="min-h-screen bg-dark-900 text-white p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-violet-400 flex items-center justify-center"><Brain size={18} className="text-dark-900" /></div>
          <div>
            <h1 className="text-sm font-semibold">Shared Analytics Report</h1>
            <p className="text-[10px] text-gray-500 font-mono">Analytics Copilot — NTT DATA</p>
          </div>
          <button onClick={() => { window.location.href = window.location.origin }} className="ml-auto text-xs text-cyan-400 hover:text-cyan-300 font-mono">Open Copilot →</button>
        </div>
        {report?.response && <ResponseCard res={report.response} onAsk={() => { window.location.href = window.location.origin }} />}
      </div>
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [copilotInitialQuestion, setCopilotInitialQuestion] = useState(null)
  const [clientAuditLog, setClientAuditLog] = useState([])
  const shareId = useMemo(() => new URLSearchParams(window.location.search).get('share'), [])

  if (shareId) return <SharedReportView shareId={shareId} />

  function handleNavigateToCopilot(question) {
    setCopilotInitialQuestion(question)
    setActiveTab('copilot')
  }

  function handleQueryComplete(auditEntry) {
    setClientAuditLog(prev => [auditEntry, ...prev])
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-3 border-b border-dark-600 bg-dark-900/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-violet-400 flex items-center justify-center"><Brain size={18} className="text-dark-900" /></div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">Analytics Copilot</h1>
            <p className="text-[10px] text-gray-500 font-mono tracking-wider">AUTONOMOUS INTELLIGENCE · NTT DATA</p>
          </div>
        </div>

        {/* Tabs */}
        <nav className="ml-8 flex items-center gap-1">
          {TABS.map(tab => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 text-xs font-mono px-4 py-2 rounded-lg transition-all ${active ? 'bg-cyan-400/10 text-cyan-400 border border-cyan-400/20' : 'text-gray-500 hover:text-gray-300 border border-transparent'}`}>
                <Icon size={14} />{tab.label}
              </button>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-4 text-[10px] font-mono text-gray-500">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />GPT-4o</span>
          <span className="flex items-center gap-1"><Database size={10} />PostgreSQL</span>
          <span className="flex items-center gap-1"><Cpu size={10} />3 Agents</span>
          <span className="flex items-center gap-1"><Radio size={10} />Live Stream</span>
          <span className="flex items-center gap-1"><MessageCircle size={10} />Memory</span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-5xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && <motion.div key="dashboard" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}><DashboardTab onNavigateToCopilot={handleNavigateToCopilot} /></motion.div>}
            {activeTab === 'copilot' && <motion.div key="copilot" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="h-[calc(100vh-10rem)]"><CopilotTab initialQuestion={copilotInitialQuestion} onQueryComplete={handleQueryComplete} /></motion.div>}
            {activeTab === 'governance' && <motion.div key="governance" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}><GovernanceTab clientAuditLog={clientAuditLog} /></motion.div>}
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
