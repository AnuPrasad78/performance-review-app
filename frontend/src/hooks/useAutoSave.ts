import { useEffect, useRef, useState } from 'react'
import type { SelfEvaluationApiResult, SelfEvaluationPartial } from '../lib/types'

/** Pausing auto-save for the review editor.

The rules that make auto-save safe rather than merely eager:

- Serialization: a save issues only when no request is in flight, so a field
  can never be overwritten by an *older* snapshot arriving last (the classic
  last-write-wins trap of naive autosaves).
- Change-coalescing: edits during the pause window or mid-flight only set the
  dirty flag; nothing is sent until the current drain point. The payload is
  always built **at send time** from the caller's latest state, never captured
  at trigger time.
- Flush points: `flush()` (the explicit button, and Submit) drains a pending
  save immediately and resolves after any in-flight save finishes, so a
  submit never races its own preamble. Unmounting flushes too as a
  best-effort final save. */

interface AutoSaveOptions {
  delayMs: number
  /** Built at send time so the payload always reflects the newest draft. */
  currentPayload: () => SelfEvaluationPartial
  perform: (payload: SelfEvaluationPartial) => Promise<SelfEvaluationApiResult>
  onSaved: (data: Extract<SelfEvaluationApiResult, { ok: true }>) => void
  onError: (detail: string) => void
}

export function useAutoSave(options: AutoSaveOptions): {
  requestSave: () => void
  flush: () => Promise<void>
  saving: boolean
} {
  // The callbacks are read through currentOptions at send time, so only the
  // frozen delay is destructured — the rest would be unused locals.
  const { delayMs } = options
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)
  const inFlight = useRef(false)
  const [saving, setSaving] = useState(false)
  const currentOptions = useRef(options)
  currentOptions.current = options

  const clearTimer = (): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  async function run(): Promise<void> {
    if (inFlight.current || !dirty.current) return
    const payload = currentOptions.current.currentPayload()
    dirty.current = false
    inFlight.current = true
    setSaving(true)
    const result = await currentOptions.current.perform(payload)
    inFlight.current = false
    if (result.ok) currentOptions.current.onSaved(result)
    else currentOptions.current.onError(result.detail)
    // A change during the request re-arms immediately: the drain continues.
    if (dirty.current) await run()
    else setSaving(false)
  }

  /** Mark content changed and schedule the pause-window save. */
  const requestSave = (): void => {
    dirty.current = true
    clearTimer()
    if (!inFlight.current) timer.current = setTimeout(() => void run(), delayMs)
  }

  /** Save now (if anything is pending) and drain any in-flight save. */
  const flush = (): Promise<void> => {
    clearTimer()
    dirty.current = true
    return run()
  }

  useEffect(() => {
    // Best-effort final save on unmount; an in-flight request completes alone.
    return () => {
      clearTimer()
      if (dirty.current && !inFlight.current) {
        dirty.current = false
        void run()
      }
    }
  }, [])

  return { requestSave, flush, saving }
}
