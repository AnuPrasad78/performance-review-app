import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { ColumnFilterMenu } from '../../src/components/molecules/ColumnFilterMenu'

const OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'India', label: 'India' },
  { value: 'Singapore', label: 'Singapore' },
]

function renderMenu(value = '', onChange = vi.fn()) {
  render(
    <ColumnFilterMenu
      label="Location"
      control={{ value, options: OPTIONS, onChange }}
    />,
  )
  return { onChange }
}

describe('ColumnFilterMenu', () => {
  it('opens the value list from the funnel and applies a choice in one click', async () => {
    const user = userEvent.setup()
    const { onChange } = renderMenu()

    expect(screen.queryByRole('dialog', { name: 'Filter by Location' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Filter by Location' }))
    expect(screen.getByRole('dialog', { name: 'Filter by Location' })).toBeInTheDocument()

    await user.click(within(screen.getByRole('dialog', { name: 'Filter by Location' })).getByRole('button', { name: 'Singapore' }))

    expect(onChange).toHaveBeenCalledWith('Singapore')
    expect(screen.queryByRole('dialog', { name: 'Filter by Location' })).not.toBeInTheDocument()
  })

  it('marks the word in force and lets "Any" drop the word back', async () => {
    const user = userEvent.setup()
    const { onChange } = renderMenu('India')

    const trigger = screen.getByRole('button', { name: 'Filter by Location' })
    expect(trigger).toHaveClass('table-filter-trigger--active')

    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Filter by Location' })
    expect(within(dialog).getByRole('button', { name: 'India' })).toHaveClass(
      'table-filter-popover__option--chosen',
    )

    await user.click(within(dialog).getByRole('button', { name: 'Any' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('a panel past the viewport edge flips leftward instead of overflowing', async () => {
    const user = userEvent.setup()
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect')
    // The trigger sits flush against the table's far right edge.
    rect.mockReturnValue({ left: window.innerWidth - 20, right: window.innerWidth + 40, top: 8, bottom: 20, width: 60, height: 12, x: window.innerWidth - 20, y: 8 } as DOMRect)
    try {
      renderMenu()
      await user.click(screen.getByRole('button', { name: 'Filter by Location' }))
      expect(screen.getByRole('dialog', { name: 'Filter by Location' })).toHaveClass('table-filter-popover--flip')
    } finally {
      rect.mockRestore()
    }
  })

  it('a panel within the viewport opens in its usual direction', async () => {
    const user = userEvent.setup()
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect')
    rect.mockReturnValue({ left: 0, right: 300, top: 8, bottom: 20, width: 300, height: 12, x: 0, y: 8 } as DOMRect)
    try {
      renderMenu()
      await user.click(screen.getByRole('button', { name: 'Filter by Location' }))
      expect(screen.getByRole('dialog', { name: 'Filter by Location' })).not.toHaveClass('table-filter-popover--flip')
    } finally {
      rect.mockRestore()
    }
  })

  it('Escape folds the list without committing anything', async () => {
    const user = userEvent.setup()
    const { onChange } = renderMenu()

    await user.click(screen.getByRole('button', { name: 'Filter by Location' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: 'Filter by Location' })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('a click on the backdrop closes without a choice', async () => {
    const user = userEvent.setup()
    const { onChange } = renderMenu()

    await user.click(screen.getByRole('button', { name: 'Filter by Location' }))
    await user.click(document.querySelector('.popover-backdrop') as HTMLElement)

    expect(screen.queryByRole('dialog', { name: 'Filter by Location' })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })
})
