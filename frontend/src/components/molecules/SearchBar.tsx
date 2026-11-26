import { useEffect, useRef, useState } from 'react'
import { Button } from '../atoms/Button'
import { Input } from '../atoms/Input'

export interface SearchBarProps {
  /** The committed search term — the pop-up re-renders it when the page
      clears everything, so the draft follows it back to blank. */
  value: string
  /** Applies after a 300ms debounce while typing, immediately on clear. */
  onChange: (term: string) => void
  placeholder: string
  ariaLabel: string
}

const DEBOUNCE_MS = 300

export function SearchBar({ value, onChange, placeholder, ariaLabel }: SearchBarProps) {
  const [draft, setDraft] = useState(value)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    // Only an outside value change (page clears the filter) may rewrite the
    // draft. While a settle is still pending, the user is typing — the prop
    // may lag behind their keystrokes, and applying it here would resurrect
    // an older word over what they are entering (the catch-up race).
    if (timer.current === null) {
      setDraft(value)
    }
  }, [value])

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  function edit(next: string): void {
    setDraft(next)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => onChange(next), DEBOUNCE_MS)
  }

  function clear(): void {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    setDraft('')
    if (value !== '') onChange('')
  }

  return (
    <>
      <Input
        type="search"
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(event) => edit(event.target.value)}
      />
      {draft !== '' ? (
        <Button variant="ghost" size="sm" onClick={clear} aria-label={`Clear ${ariaLabel}`}>
          Clear
        </Button>
      ) : null}
    </>
  )
}
