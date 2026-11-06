import { useEffect, useRef, useState } from 'react'
import { addListItem, createCatalogItem, createList, getAssistantStatus, getCatalog, getList, getLists, sendAssistantMessage, updateListItem } from './api/httpApi.js'
import { applyProposal, assistantErrorText, assistantReply, canConfirm, itemLabel, listOptionLabel, loadAllLists, matchBought, resolveProposal, usedUpText } from './assistantActions.js'
import { NavIcon } from './Brand.jsx'
import { useDataCache } from './dataCache.jsx'

const MESSAGE_MAX = 300
const UNAVAILABLE = "The assistant isn't available right now. You can still use CartCheck as usual."
const HELP_EXAMPLE = 'What can you do?'
const FILL_EXAMPLES = ['Add eggs and rice to my list', 'Make a Weekly list']
const api = { addListItem, createCatalogItem, createList, getLists, updateListItem }

const names = (items) => items.map(itemLabel).join(', ')

function ListPicker({ step, index, onChoose, disabled }) {
  const id = `assistant-list-${index}`
  return <div className="assistant-step">
    {step.list.notFound && <p>I couldn't find {step.list.notFound}.</p>}
    <label htmlFor={id}>{step.type === 'mark_bought' ? 'Mark bought on' : 'Add to'}</label>
    <select id={id} value={step.list.listId ?? ''} onChange={(event) => onChoose(index, event.target.value)} disabled={disabled}>
      <option value="" disabled>Choose a list</option>
      {step.list.options.map((option) => <option key={option.id} value={option.id}>{listOptionLabel(option, step.list.options)}</option>)}
    </select>
  </div>
}

function ProposalStep({ step, index, onChoose, disabled }) {
  if (step.type === 'create_list') {
    return <div className="assistant-step"><p>Create list: {step.name}</p>{step.items.length > 0 && <p>Add: {names(step.items)}</p>}</div>
  }
  if (step.type === 'add_catalog_items') {
    const added = step.items.filter((item) => !item.product)
    const existing = step.items.filter((item) => item.product)
    return <div className="assistant-step">
      {added.length > 0 && <p>Add to catalog: {added.map((item) => item.name).join(', ')}</p>}
      {existing.length > 0 && <p className="assistant-quiet">Already in your catalog: {existing.map((item) => item.name).join(', ')}</p>}
    </div>
  }
  const picker = step.list.pickerNeeded && <ListPicker step={step} index={index} onChoose={onChoose} disabled={disabled} />
  const target = !step.list.pickerNeeded && step.list.options.find((option) => option.id === step.list.listId)
  if (step.type === 'add_items') {
    return <>{picker}<div className="assistant-step">{target && <p>Add to: {target.name}</p>}<p>Add: {names(step.items)}</p></div></>
  }
  const { match } = step
  return <>{picker}<div className="assistant-step">
    {target && <p>On list: {target.name}</p>}
    {!match && step.list.listId && <p className="assistant-quiet">Checking the list…</p>}
    {!match && !step.list.listId && <p>Mark bought: {step.itemNames.join(', ')}</p>}
    {match?.found.length > 0 && <p>Mark bought: {match.found.map((item) => item.name).join(', ')}</p>}
    {match?.alreadyBought.length > 0 && <p className="assistant-quiet">Already bought: {match.alreadyBought.join(', ')}</p>}
    {match?.missing.length > 0 && <p className="assistant-quiet">Not on this list: {match.missing.join(', ')}</p>}
  </div></>
}

function ResultMessage({ result, onOpenList }) {
  return <div className="assistant-card">
    {result.saved.length > 0 && <p>Saved: {result.saved.join(', ')}</p>}
    {result.skipped.length > 0 && <p>Left as it was: {result.skipped.join(', ')}</p>}
    {result.failed.length > 0 && <p className="alert">Couldn't save: {result.failed.join(', ')}. Check My Lists before trying again.</p>}
    {result.listId && <button className="text-button" type="button" onClick={() => onOpenList(result.listId)}>Open list</button>}
  </div>
}

export default function Assistant({ currentListId, preferredCurrency, otherSavesPending, hidden, onOpenList, onPendingChange }) {
  const cache = useDataCache()
  const dialog = useRef(null)
  const input = useRef(null)
  const body = useRef(null)
  const card = useRef(null)
  const nextId = useRef(0)
  const mounted = useRef(true)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [proposal, setProposal] = useState(null)
  const [saving, setSaving] = useState(false)

  const add = (message) => setMessages((current) => [...current, { id: nextId.current++, ...message }])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; onPendingChange(false) }
  }, [onPendingChange])

  useEffect(() => {
    if (!open) return
    if (!dialog.current.open) dialog.current.showModal()
    input.current?.focus()
    if (status) return
    getAssistantStatus().then((next) => { if (mounted.current) setStatus(next) }).catch((caught) => {
      if (caught.name !== 'AbortError' && mounted.current) setStatus({ enabled: false })
    })
  }, [open, status])

  // Reopening asks again, so a brief failure doesn't last until a reload.
  useEffect(() => {
    if (!open) setStatus((current) => (current?.enabled ? current : null))
  }, [open])

  useEffect(() => {
    if (body.current) body.current.scrollTop = body.current.scrollHeight
  }, [messages, proposal, sending, open])

  useEffect(() => {
    if (proposal && !saving) card.current?.querySelector('select:not(:disabled), button:not(:disabled)')?.focus()
    // Only a newly arrived card takes focus; choosing a list keeps it where it is.
  }, [proposal?.id])

  function close() {
    dialog.current?.close()
    setOpen(false)
  }

  async function matchStep(step) {
    if (step.type !== 'mark_bought' || !step.list.listId) return step
    return { ...step, match: matchBought(step.itemNames, await getList(step.list.listId)) }
  }

  async function buildProposal(actions) {
    const [lists, catalog] = await Promise.all([
      actions.some((action) => action.type === 'add_items' || action.type === 'mark_bought') ? loadAllLists(api) : [],
      getCatalog(),
    ])
    const { steps } = resolveProposal(actions, { lists, products: catalog.items ?? catalog, currentListId })
    // Remembered so a chosen list keeps its picker, in case the shopper wants to change it.
    const marked = steps.map((step) => (step.list ? { ...step, list: { ...step.list, pickerNeeded: !step.list.listId } } : step))
    return { id: nextId.current++, steps: await Promise.all(marked.map(matchStep)) }
  }

  async function send(event) {
    event.preventDefault()
    const message = text.trim()
    if (!message || sending || saving) return
    setText('')
    setProposal(null)
    setSending(true)
    add({ mine: true, text: message })
    try {
      const reply = await sendAssistantMessage(message)
      if (!mounted.current) return
      setStatus((current) => ({ ...current, enabled: true, ...reply.usage }))
      if (reply.intent !== 'act') add({ text: assistantReply(reply.intent) })
      else {
        const next = await buildProposal(reply.actions)
        if (mounted.current) setProposal(next)
      }
    } catch (caught) {
      if (caught.name === 'AbortError' || !mounted.current) return
      if (caught.code === 'ASSISTANT_DAILY_LIMIT') setStatus((current) => ({ ...current, remaining: 0 }))
      add({ error: true, text: assistantErrorText(caught) })
    } finally {
      if (mounted.current) {
        setSending(false)
        input.current?.focus()
      }
    }
  }

  async function chooseList(index, listId) {
    const update = (changes) => setProposal((current) => current && ({
      ...current,
      steps: current.steps.map((step, position) => (position === index ? { ...step, ...changes(step) } : step)),
    }))
    update((step) => ({ list: { ...step.list, listId }, match: undefined }))
    const step = proposal.steps[index]
    if (step.type !== 'mark_bought') return
    try {
      const detail = await getList(listId)
      if (mounted.current) update((current) => (current.list.listId === listId ? { match: matchBought(step.itemNames, detail) } : {}))
    } catch (caught) {
      if (caught.name !== 'AbortError' && mounted.current) add({ error: true, text: assistantErrorText(caught) })
    }
  }

  async function confirm() {
    if (!proposal || saving || otherSavesPending || !canConfirm(proposal)) return
    setSaving(true)
    onPendingChange(true)
    try {
      const result = await applyProposal(proposal, { api, cache, preferredCurrency })
      if (!mounted.current) return
      setProposal(null)
      add({ result })
    } catch (caught) {
      if (caught.name === 'AbortError' || !mounted.current) return
      add({ error: true, text: assistantErrorText(caught) })
    } finally {
      if (mounted.current) {
        setSaving(false)
        onPendingChange(false)
        input.current?.focus()
      }
    }
  }

  const usedUp = status?.enabled && status.remaining === 0
  const entryDisabled = !status?.enabled || usedUp

  return <>
    {!hidden && <button className="assistant-launcher" type="button" aria-label="Open CartCheck Assistant" aria-haspopup="dialog" onClick={() => setOpen(true)}><NavIcon destination="assistant" /></button>}
    {open && <dialog ref={dialog} className="assistant-dialog" aria-labelledby="assistant-title" onClose={() => setOpen(false)}>
      <div className="assistant-head">
        <h2 id="assistant-title">CartCheck Assistant</h2>
        <button className="assistant-close" type="button" aria-label="Close" onClick={close}><NavIcon destination="close" /></button>
      </div>
      <div className="assistant-body" ref={body}>
        {status?.enabled && <p className="assistant-notice">Demo: {status.limit} messages per day. Messages are sent to Google Gemini and may be used to improve its products. Don't enter personal information.</p>}
        {status && !status.enabled && <p className="assistant-notice" role="status">{UNAVAILABLE}</p>}
        {!status && <p className="assistant-notice" role="status">Loading…</p>}
        {status?.enabled && !messages.length && !proposal && <div className="assistant-examples">
          <button className="assistant-example" type="button" onClick={() => { add({ mine: true, text: HELP_EXAMPLE }); add({ text: assistantReply('help') }) }}>{HELP_EXAMPLE}</button>
          {!usedUp && FILL_EXAMPLES.map((example) => <button className="assistant-example" type="button" key={example} onClick={() => { setText(example); input.current?.focus() }}>{example}</button>)}
        </div>}
        <div className="assistant-log" role="log" aria-label="Conversation">
          {messages.map((message) => {
            if (message.result) return <ResultMessage key={message.id} result={message.result} onOpenList={(id) => { close(); onOpenList(id) }} />
            if (message.error) return <p key={message.id} className="alert">{message.text}</p>
            return <p key={message.id} className={message.mine ? 'assistant-mine' : undefined}>{message.text}</p>
          })}
          {sending && <p className="assistant-waiting">Working on it. This can take a few seconds.</p>}
          {proposal && <div className="assistant-card" ref={card}>
            {proposal.steps.map((step, index) => <ProposalStep key={index} step={step} index={index} onChoose={chooseList} disabled={saving} />)}
            {otherSavesPending && <p className="assistant-quiet">Waiting for your other changes to save…</p>}
            <div className="assistant-actions">
              <button className="catalog-button secondary" type="button" onClick={() => { setProposal(null); input.current?.focus() }} disabled={saving}>Cancel</button>
              {(canConfirm(proposal) || proposal.steps.some((step) => step.type !== 'mark_bought' || !step.match)) && <button className="catalog-button primary" type="button" onClick={confirm} disabled={saving || otherSavesPending || !canConfirm(proposal)}>{saving ? 'Saving…' : 'Confirm'}</button>}
            </div>
          </div>}
        </div>
      </div>
      {status?.enabled && <form className="assistant-foot" onSubmit={send}>
        {usedUp && <p className="assistant-notice" role="status">{usedUpText(status)}</p>}
        <div className="assistant-meta"><span>{status.remaining} of {status.limit} left today</span><span>{text.length}/{MESSAGE_MAX}</span></div>
        <label htmlFor="assistant-input">Tell the assistant what to do</label>
        <div className="assistant-entry">
          <input id="assistant-input" ref={input} type="text" autoComplete="off" maxLength={MESSAGE_MAX} value={text} onChange={(event) => setText(event.target.value)} disabled={entryDisabled} />
          <button className="assistant-send" type="submit" aria-label="Send" disabled={entryDisabled || sending || saving || !text.trim()}><NavIcon destination="send" /></button>
        </div>
      </form>}
    </dialog>}
  </>
}
