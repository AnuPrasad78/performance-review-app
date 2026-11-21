import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ReviewScoreSelector } from '../../src/components/molecules/ReviewScoreSelector'

function Harness({ onChange }: { onChange: (value: number) => void }) {
  const [value, setValue] = useState<number | null>(null)
  return (
    <ReviewScoreSelector
      values={[1, 2, 3, 4, 5]}
      value={value}
      onChange={(selected) => {
        setValue(selected)
        onChange(selected)
      }}
      ariaLabel="Score from 1 to 5"
    />
  )
}

describe('ReviewScoreSelector', () => {
  it('fires onChange with the selected value and marks it active', async () => {
    const user = userEvent.setup()
    const selections: number[] = []
    render(<Harness onChange={(value) => selections.push(value)} />)

    await user.click(screen.getByRole('button', { name: '4' }))

    expect(selections).toEqual([4])
    expect(screen.getByRole('button', { name: '4' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '3' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders disabled chips without interacting', async () => {
    const user = userEvent.setup()
    const selections: number[] = []
    render(
      <ReviewScoreSelector
        values={[1, 2, 3, 4, 5]}
        value={null}
        onChange={(value) => selections.push(value)}
        ariaLabel="Score from 1 to 5"
        disabled
      />,
    )

    await user.click(screen.getByRole('button', { name: '2' }))

    expect(selections).toEqual([])
  })
})
