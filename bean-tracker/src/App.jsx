import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from './supabase.js'

// ── constants ────────────────────────────────────────────────────────────────
const MODIFIERS = [
  { label: 'Good',   value: 1.0,  color: '#4ade80', desc: 'Feeling well' },
  { label: 'Normal', value: 1.25, color: '#facc15', desc: 'Typical day' },
  { label: 'Rough',  value: 1.75, color: '#fb923c', desc: 'Higher effort' },
  { label: 'Flare',  value: 2.5,  color: '#f87171', desc: 'Everything costs more' },
]

const DEFAULT_ACTIVITIES = [
  { name: "Walk to partner's (10 min)", beans: 20, emoji: '🚶' },
  { name: 'Doing the dishes',           beans: 10, emoji: '🍽️' },
  { name: 'Short rest activity',        beans: 1,  emoji: '🌿' },
]

function round2(n) { return Math.round(n * 100) / 100 }

// ── styles ───────────────────────────────────────────────────────────────────
const C = {
  bg:      '#1a1025',
  surface: '#2d1b4e',
  border:  '#3d2a5e',
  purple:  '#6d28d9',
  blue:    '#1d4ed8',
  muted:   '#7c5fa0',
  text:    '#f0e8ff',
  sub:     '#c4b5d4',
  label:   '#a78bca',
}

const s = {
  card:  { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14 },
  inp:   { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '10px 12px', fontSize: 16, fontFamily: 'inherit', outline: 'none', width: '100%' },
  lbl:   { fontSize: 10, letterSpacing: 2, color: C.label, textTransform: 'uppercase' },
  btn:   (bg, col = C.text) => ({ background: bg, border: 'none', color: col, borderRadius: 10, padding: '10px 18px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', fontWeight: '500' }),
  ghost: { background: 'none', border: `1px solid ${C.border}`, borderRadius: 10, color: C.muted, cursor: 'pointer', padding: '8px 14px', fontSize: 14, fontFamily: 'inherit' },
}

// ── component ────────────────────────────────────────────────────────────────
export default function App() {
  const [activities, setActivities]   = useState([])
  const [dailyBudget, setDailyBudget] = useState(100)
  const [dayPlan, setDayPlan]         = useState([])
  const [modifier, setModifier]       = useState(MODIFIERS[1])
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState(null)
  const [tab, setTab]                 = useState('plan') // 'plan' | 'library' | 'rescale'

  // add form
  const [newName, setNewName]   = useState('')
  const [newBeans, setNewBeans] = useState('')
  const [newEmoji, setNewEmoji] = useState('✨')

  // inline edit
  const [editingId, setEditingId] = useState(null)
  const [editBeans, setEditBeans] = useState('')

  // rescale
  const [anchorId, setAnchorId]           = useState(null)
  const [anchorNew, setAnchorNew]         = useState('')
  const [rescaleSearch, setRescaleSearch] = useState('')
  const [confirmRescale, setConfirmRescale] = useState(false)

  // ── Supabase: load ──────────────────────────────────────────────────────
  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('bean_config')
        .select('*')
        .eq('id', 1)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        setActivities(data.activities || [])
        setDailyBudget(data.daily_budget || 100)
      } else {
        // first run — seed defaults
        const seeded = DEFAULT_ACTIVITIES.map((a, i) => ({ ...a, id: i + 1 }))
        setActivities(seeded)
        await saveToDb(seeded, 100)
      }
    } catch (e) {
      setError('Could not connect to database. Check your Supabase config.')
      console.error(e)
    }
    setLoading(false)
  }

  // ── Supabase: save ──────────────────────────────────────────────────────
  const saveToDb = useCallback(async (acts, budget) => {
    setSaving(true)
    try {
      await supabase
        .from('bean_config')
        .upsert({ id: 1, activities: acts, daily_budget: budget, updated_at: new Date().toISOString() })
    } catch (e) {
      console.error('Save failed', e)
    }
    setSaving(false)
  }, [])

  // auto-save whenever activities or budget change
  useEffect(() => {
    if (!loading && activities.length > 0) {
      saveToDb(activities, dailyBudget)
    }
  }, [activities, dailyBudget])

  // ── realtime sync ───────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('bean_config_changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bean_config' }, payload => {
        if (payload.new) {
          setActivities(payload.new.activities || [])
          setDailyBudget(payload.new.daily_budget || 100)
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  // ── day plan helpers ────────────────────────────────────────────────────
  const totalSpent = dayPlan.reduce((sum, item) => sum + Math.round(item.beans * modifier.value), 0)
  const remaining  = dailyBudget - totalSpent
  const pct        = Math.min(100, (totalSpent / dailyBudget) * 100)
  const barColor   = pct < 60 ? '#4ade80' : pct < 85 ? '#facc15' : '#f87171'

  function addToPlan(activity) {
    setDayPlan(prev => [...prev, { ...activity, instanceId: Date.now() + Math.random() }])
  }
  function removeFromPlan(instanceId) {
    setDayPlan(prev => prev.filter(i => i.instanceId !== instanceId))
  }

  // ── activity CRUD ───────────────────────────────────────────────────────
  function addActivity() {
    if (!newName.trim() || !newBeans) return
    const maxId = activities.reduce((m, a) => Math.max(m, a.id || 0), 0)
    const next = [...activities, { id: maxId + 1, name: newName.trim(), beans: parseFloat(newBeans), emoji: newEmoji || '✨' }]
    setActivities(next)
    setNewName(''); setNewBeans(''); setNewEmoji('✨')
    setTab('library')
  }

  function deleteActivity(id) {
    setActivities(prev => prev.filter(a => a.id !== id))
    setDayPlan(prev => prev.filter(a => a.id !== id))
  }

  function saveEdit(id) {
    const val = parseFloat(editBeans)
    if (isNaN(val) || val <= 0) return
    setActivities(prev => prev.map(a => a.id === id ? { ...a, beans: val } : a))
    setDayPlan(prev => prev.map(a => a.id === id ? { ...a, beans: val } : a))
    setEditingId(null)
  }

  // ── rescale ─────────────────────────────────────────────────────────────
  const rescaleMultiplier = useMemo(() => {
    if (!anchorId || !anchorNew) return null
    const anchor = activities.find(a => a.id === anchorId)
    if (!anchor || anchor.beans === 0) return null
    const nv = parseFloat(anchorNew)
    if (isNaN(nv) || nv <= 0) return null
    return nv / anchor.beans
  }, [anchorId, anchorNew, activities])

  const rescalePreview = useMemo(() => {
    if (!rescaleMultiplier) return []
    return activities.map(a => ({ ...a, newBeans: round2(a.beans * rescaleMultiplier) }))
  }, [activities, rescaleMultiplier])

  function applyRescale() {
    if (!rescaleMultiplier) return
    const updated = activities.map(a => ({ ...a, beans: round2(a.beans * rescaleMultiplier) }))
    const newBudget = round2(dailyBudget * rescaleMultiplier)
    setActivities(updated)
    setDailyBudget(newBudget)
    setDayPlan(prev => prev.map(item => {
      const src = updated.find(a => a.id === item.id)
      return src ? { ...item, beans: src.beans } : item
    }))
    setAnchorId(null); setAnchorNew(''); setConfirmRescale(false); setTab('library')
  }

  const filteredForRescale = activities.filter(a =>
    a.name.toLowerCase().includes(rescaleSearch.toLowerCase())
  )

  // ── render ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: 'Georgia, serif', color: C.muted }}>
      <div style={{ fontSize: 48 }}>🫘</div>
      <div style={{ fontSize: 14, letterSpacing: 2 }}>LOADING…</div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: 'Georgia, serif', color: C.text, padding: 24 }}>
      <div style={{ fontSize: 48 }}>⚠️</div>
      <div style={{ color: '#f87171', textAlign: 'center', lineHeight: 1.6 }}>{error}</div>
      <button onClick={loadData} style={s.btn(C.purple)}>Retry</button>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Georgia','Times New Roman',serif", maxWidth: 480, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ background: 'linear-gradient(135deg,#2d1b4e 0%,#1a1025 100%)', borderBottom: `1px solid ${C.border}`, padding: '24px 20px 16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 'normal', letterSpacing: 2, color: '#e9d5ff' }}>🫘 Bean Budget</div>
            <div style={{ fontSize: 11, color: C.label, letterSpacing: 1, marginTop: 2 }}>energy tracker · fibromyalgia</div>
          </div>
          <div style={{ fontSize: 11, color: saving ? '#facc15' : C.muted, letterSpacing: 1 }}>
            {saving ? '💾 saving…' : '✓ synced'}
          </div>
        </div>

        {/* Budget bar */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'baseline' }}>
            <span style={{ fontSize: 11, color: C.label, letterSpacing: 1 }}>TODAY'S BEANS</span>
            <span style={{ fontSize: 18, color: remaining >= 0 ? C.text : '#f87171', fontWeight: 'bold' }}>
              {Math.max(0, remaining)}
              <span style={{ fontSize: 12, color: C.muted, fontWeight: 'normal' }}> / {dailyBudget}</span>
            </span>
          </div>
          <div style={{ background: '#1a1025', borderRadius: 6, height: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 6, transition: 'width 0.4s ease, background 0.4s ease', boxShadow: `0 0 8px ${barColor}88` }} />
          </div>
        </div>

        {/* Modifier pills */}
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {MODIFIERS.map(m => (
            <button key={m.label} onClick={() => setModifier(m)} style={{
              padding: '5px 12px', borderRadius: 20, fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
              border: `1.5px solid ${modifier.label === m.label ? m.color : 'transparent'}`,
              background: modifier.label === m.label ? m.color + '22' : C.surface,
              color: modifier.label === m.label ? m.color : C.sub,
              transition: 'all 0.15s'
            }}>
              {m.label} <span style={{ opacity: 0.65, fontSize: 10 }}>×{m.value}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, background: C.bg, position: 'sticky', top: 160, zIndex: 9 }}>
        {[['plan', '📅 Plan'], ['library', '📚 Library'], ['rescale', '⚖ Rescale']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            flex: 1, padding: '12px 4px', background: 'none', border: 'none', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer',
            color: tab === key ? '#e9d5ff' : C.muted,
            borderBottom: `2px solid ${tab === key ? C.purple : 'transparent'}`,
            transition: 'all 0.15s'
          }}>{label}</button>
        ))}
      </div>

      <div style={{ padding: '16px 16px 100px' }}>

        {/* ══ TAB: PLAN ══ */}
        {tab === 'plan' && (
          <div>
            {pct > 85 && (
              <div style={{ background: '#f8717122', border: '1px solid #f87171', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#fca5a5' }}>
                ⚠ Running low on beans — consider resting
              </div>
            )}

            {dayPlan.length === 0 ? (
              <div style={{ background: '#2d1b4e44', border: `1px dashed ${C.border}`, borderRadius: 12, padding: 28, textAlign: 'center', color: C.muted, fontSize: 14, fontStyle: 'italic' }}>
                Go to Library to add activities to your plan
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dayPlan.map(item => {
                  const cost = Math.round(item.beans * modifier.value)
                  return (
                    <div key={item.instanceId} style={{ ...s.card, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 15 }}>{item.emoji} {item.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 8 }}>
                        <span style={{ color: C.text, fontWeight: 'bold', fontSize: 15 }}>{cost}🫘</span>
                        {modifier.value !== 1 && <span style={{ fontSize: 11, color: C.muted }}>({item.beans})</span>}
                        <button onClick={() => removeFromPlan(item.instanceId)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 2px' }}>×</button>
                      </div>
                    </div>
                  )
                })}
                <button onClick={() => setDayPlan([])} style={{ ...s.ghost, marginTop: 4, width: '100%' }}>clear plan</button>
              </div>
            )}

            {/* quick-add from library */}
            <div style={{ marginTop: 20 }}>
              <div style={{ ...s.lbl, marginBottom: 10 }}>quick add</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activities.slice(0, 8).map(a => (
                  <button key={a.id} onClick={() => addToPlan(a)} style={{
                    ...s.card, padding: '11px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    cursor: 'pointer', background: C.surface, border: `1px solid ${C.border}`, fontFamily: 'inherit', textAlign: 'left'
                  }}>
                    <span style={{ color: C.sub, fontSize: 14 }}>{a.emoji} {a.name}</span>
                    <span style={{ color: C.muted, fontSize: 13, flexShrink: 0, marginLeft: 8 }}>
                      {Math.round(a.beans * modifier.value)}🫘
                    </span>
                  </button>
                ))}
                {activities.length > 8 && (
                  <button onClick={() => setTab('library')} style={{ ...s.ghost, width: '100%' }}>
                    + {activities.length - 8} more in Library
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══ TAB: LIBRARY ══ */}
        {tab === 'library' && (
          <div>
            {/* Add form */}
            <div style={{ ...s.card, border: `1px solid ${C.purple}44`, padding: 16, marginBottom: 16 }}>
              <div style={{ ...s.lbl, marginBottom: 12 }}>add activity</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input value={newEmoji} onChange={e => setNewEmoji(e.target.value)} maxLength={2}
                  style={{ ...s.inp, width: 52, textAlign: 'center', fontSize: 20, padding: 10, flexShrink: 0 }} />
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Activity name"
                  onKeyDown={e => e.key === 'Enter' && addActivity()}
                  style={{ ...s.inp, flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" value={newBeans} onChange={e => setNewBeans(e.target.value)} placeholder="Base beans"
                  onKeyDown={e => e.key === 'Enter' && addActivity()}
                  style={{ ...s.inp, flex: 1 }} />
                <button onClick={addActivity} style={{ ...s.btn(C.purple), flexShrink: 0 }}>Add</button>
              </div>
            </div>

            {/* Activity list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activities.map(activity => (
                <div key={activity.id} style={{ ...s.card, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, color: C.sub, flex: 1, marginRight: 8 }}>{activity.emoji} {activity.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {editingId === activity.id ? (
                        <>
                          <input type="number" value={editBeans} onChange={e => setEditBeans(e.target.value)} autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(activity.id); if (e.key === 'Escape') setEditingId(null) }}
                            style={{ ...s.inp, width: 70, padding: '6px 8px', fontSize: 14 }} />
                          <button onClick={() => saveEdit(activity.id)} style={s.btn(C.purple, C.text)}>✓</button>
                        </>
                      ) : (
                        <button onClick={() => { setEditingId(activity.id); setEditBeans(String(activity.beans)) }} style={{
                          background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, color: C.label, cursor: 'pointer', fontSize: 13, padding: '5px 10px', fontFamily: 'inherit'
                        }}>{activity.beans}🫘</button>
                      )}
                      <button onClick={() => addToPlan(activity)} style={s.btn('#4c1d95')}>+ plan</button>
                      <button onClick={() => deleteActivity(activity.id)} style={{ background: 'none', border: 'none', color: '#5e4a7a', cursor: 'pointer', fontSize: 20, padding: '0 2px' }}>×</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ TAB: RESCALE ══ */}
        {tab === 'rescale' && (
          <div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 20, lineHeight: 1.6 }}>
              Pick one activity as your anchor, give it a new value — every other activity and your daily budget shifts proportionally.
            </div>

            {/* Step 1 */}
            <div style={{ ...s.lbl, marginBottom: 8 }}>step 1 — choose anchor</div>
            <input value={rescaleSearch} onChange={e => setRescaleSearch(e.target.value)}
              placeholder="Search activities…"
              style={{ ...s.inp, marginBottom: 10 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
              {filteredForRescale.map(a => (
                <button key={a.id} onClick={() => { setAnchorId(a.id); setAnchorNew(''); setConfirmRescale(false) }} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: anchorId === a.id ? '#1e3a5f' : C.bg,
                  border: `1px solid ${anchorId === a.id ? '#3b82f6' : C.border}`,
                  borderRadius: 10, padding: '11px 14px', cursor: 'pointer', fontFamily: 'inherit',
                  color: anchorId === a.id ? '#93c5fd' : C.sub, fontSize: 14, textAlign: 'left', width: '100%'
                }}>
                  <span>{a.emoji} {a.name}</span>
                  <span style={{ color: anchorId === a.id ? '#60a5fa' : C.muted, fontSize: 13 }}>{a.beans}🫘</span>
                </button>
              ))}
            </div>

            {/* Step 2 */}
            {anchorId && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ ...s.lbl, marginBottom: 8 }}>
                  step 2 — new value for {activities.find(a => a.id === anchorId)?.emoji} {activities.find(a => a.id === anchorId)?.name}
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="number" value={anchorNew} onChange={e => { setAnchorNew(e.target.value); setConfirmRescale(false) }}
                    placeholder="e.g. 200"
                    style={{ ...s.inp, fontSize: 20, flex: 1 }} />
                  {rescaleMultiplier && (
                    <span style={{ fontSize: 13, color: C.muted, flexShrink: 0 }}>×{round2(rescaleMultiplier)}</span>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: preview */}
            {rescalePreview.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ ...s.lbl, marginBottom: 8 }}>step 3 — preview</div>
                <div style={{ background: '#12091e', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                    <span style={{ fontSize: 13, color: C.muted }}>📊 Daily budget</span>
                    <span style={{ fontSize: 13, color: C.muted }}>
                      {dailyBudget} → <b style={{ color: '#93c5fd' }}>{round2(dailyBudget * rescaleMultiplier)}🫘</b>
                    </span>
                  </div>
                  <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                    {rescalePreview.map(a => (
                      <div key={a.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 14px', borderBottom: `1px solid #1e1530`,
                        background: a.id === anchorId ? '#1a2a3f' : 'transparent'
                      }}>
                        <span style={{ fontSize: 13, color: a.id === anchorId ? '#93c5fd' : C.sub }}>{a.emoji} {a.name}</span>
                        <span style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap', marginLeft: 8 }}>
                          {a.beans} → <b style={{ color: a.id === anchorId ? '#60a5fa' : C.text }}>{a.newBeans}🫘</b>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {rescaleMultiplier && !confirmRescale && (
              <button onClick={() => setConfirmRescale(true)} style={{ ...s.btn(C.blue, '#bfdbfe'), width: '100%' }}>
                Apply rescale →
              </button>
            )}
            {confirmRescale && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 13, color: '#facc15', textAlign: 'center' }}>
                  ⚠ Update all {activities.length} activities and budget?
                </div>
                <button onClick={applyRescale} style={{ ...s.btn('#15803d', '#bbf7d0'), width: '100%' }}>Yes, rescale everything</button>
                <button onClick={() => setConfirmRescale(false)} style={{ ...s.ghost, width: '100%' }}>Go back</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom safe area spacer for iOS ── */}
      <div style={{ height: 'env(safe-area-inset-bottom, 16px)' }} />
    </div>
  )
}
