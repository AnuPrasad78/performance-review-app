import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TableQueryControls, type TableFilterSpec } from '../../src/components/molecules/TableQueryControls'

const ORG_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'Delivery', label: 'Delivery' },
  { value: 'Quality', label: 'Quality' },
]

const FILTERS: readonly TableFilterSpec[] = [
  { key: 'org', label: 'Org', options: ORG_OPTIONS, value: '' },
]

const SORT_FIELDS = [
  { value: 'employeeName', label: 'Name' },
  { value: 'org', label: 'Org' },
]

type Props = React.ComponentProps<typeof TableQueryControls>

function baseProps(): Props {
  return {
    search: '',
    onSearchChange: () => {},
    filters: FILTERS,
    onFilterChange: () => {},
    sortFields: SORT_FIELDS,
    sortField: 'employeeName',
    sortOrder: 'asc',
    onSortFieldChange: () => {},
    onSortOrderChange: () => {},
    onClear: () => {},
  }
}

describe('TableQueryControls', () => {
  it('opens and closes through the trigger, then through the backdrop', async () => {
    const user = userEvent.setup()
    render(<TableQueryControls {...baseProps()} />)

    const trigger = screen.getByRole('button', { name: /Search, filter and sort/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog', { name: 'Search, filter and sort' })).not.toBeInTheDocument()

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: 'Search, filter and sort' })).toBeInTheDocument()

    await user.click(document.querySelector('.popover-backdrop') as HTMLElement)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog', { name: 'Search, filter and sort' })).not.toBeInTheDocument()
  })

  it('Escape folds the pop-up away without committing anything', async () => {
    const userEscapes: boolean[] = []
    render(
      <TableQueryControls
        {...baseProps()}
        onSearchChange={() => userEscapes.push(true)}
      />,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /Search, filter and sort/ }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: 'Search, filter and sort' })).not.toBeInTheDocument()
    expect(userEscapes).toEqual([])
  })

  it('routes each word of the composed query to its route, live', async () => {
    const changes: string[] = []
    render(
      <TableQueryControls
        {...baseProps()}
        onSearchChange={(term) => changes.push(`search:${term}`)}
        onFilterChange={(key, value) => changes.push(`${key}:${value}`)}
        onSortFieldChange={(field) => changes.push(`sortField:${field}`)}
        onSortOrderChange={(order) => changes.push(`sortOrder:${order}`)}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Search, filter and sort/ }))

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by Org' }), 'Quality')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'org')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort direction' }), 'desc')
    await user.type(
      screen.getByRole('searchbox', { name: 'Search by employee name or designation' }),
      'ash',
    )

    // The select words land at once; the search word rides its debounce.
    await waitFor(() => {
      expect(changes).toEqual(['org:Quality', 'sortField:org', 'sortOrder:desc', 'search:ash'])
    })
  })

  it('clear all clears the words and leaves the pop-up at hand', async () => {
    const cleared: boolean[] = []
    render(<TableQueryControls {...baseProps()} onClear={() => cleared.push(true)} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /Search, filter and sort/ }))
    await user.click(screen.getByRole('button', { name: 'Clear all' }))

    expect(cleared).toEqual([true])
    expect(screen.getByRole('dialog', { name: 'Search, filter and sort' })).toBeInTheDocument()
  })

  it('renders one dropdown per filter, live values riding the spec', async () => {
    render(
      <TableQueryControls
        {...baseProps()}
        filters={[
          { key: 'org', label: 'Org', options: ORG_OPTIONS, value: 'Quality' },
          { key: 'location', label: 'Location', options: ORG_OPTIONS, value: '' },
        ]}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Search, filter and sort/ }))

    expect(screen.getByRole('combobox', { name: 'Filter by Org' })).toHaveValue('Quality')
    expect(screen.getByRole('combobox', { name: 'Filter by Location' })).toHaveValue('')
  })
})
