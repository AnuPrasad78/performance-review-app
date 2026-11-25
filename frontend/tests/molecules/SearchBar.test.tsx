import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { SearchBar } from '../../src/components/molecules/SearchBar'

function Harness({ onSearch }: { onSearch: (term: string) => void }) {
  const [term, setTerm] = useState('')
  return (
    <SearchBar
      value={term}
      onChange={(next) => {
        setTerm(next)
        onSearch(next)
      }}
      placeholder="Name or designation"
      ariaLabel="Search by employee name or designation"
    />
  )
}

describe('SearchBar', () => {
  it('debounces typing so the word lands after the 300ms settle', async () => {
    const searches: string[] = []
    render(<Harness onSearch={(next) => searches.push(next)} />)
    const user = userEvent.setup()
    const input = screen.getByRole('searchbox', { name: 'Search by employee name or designation' })

    await user.type(input, 'ash')
    expect(searches).toEqual([])

    await waitFor(() => expect(searches).toEqual(['ash']), { timeout: 1000 })
  })

  it('one word reaches the subscriber per settle, not per keystroke', async () => {
    const searches: string[] = []
    render(<Harness onSearch={(next) => searches.push(next)} />)
    const user = userEvent.setup()
    const input = screen.getByRole('searchbox', { name: 'Search by employee name or designation' })

    await user.type(input, 'ash')
    await waitFor(() => expect(searches).toEqual(['ash']), { timeout: 1000 })

    await user.clear(input)
    await user.type(input, 'bi')
    await waitFor(() => expect(searches).toEqual(['ash', 'bi']), { timeout: 1000 })
  })

  it('the clear button applies immediately and drops the draft', async () => {
    const searches: string[] = []
    render(<Harness onSearch={(next) => searches.push(next)} />)
    const user = userEvent.setup()
    const input = screen.getByRole('searchbox', { name: 'Search by employee name or designation' })

    await user.type(input, 'ash')
    await waitFor(() => expect(searches).toEqual(['ash']), { timeout: 1000 })

    await user.click(screen.getByRole('button', { name: 'Clear Search by employee name or designation' }))

    expect(input).toHaveValue('')
    expect(searches).toEqual(['ash', ''])
    // Clearing folded the button away too — nothing left to clear.
    expect(screen.queryByRole('button', { name: 'Clear Search by employee name or designation' })).not.toBeInTheDocument()
  })
})
