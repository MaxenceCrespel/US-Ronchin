import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PitchFormationEditor, type FormationPlayer } from '@/features/matches/PitchFormationEditor'

const players: FormationPlayer[] = [
  { userId: 'gk', firstName: 'Gardien', lastName: 'Un', x: 50, y: 92 },
  { userId: 'df', firstName: 'Def', lastName: 'Deux', x: 30, y: 70 },
  { userId: 'st', firstName: 'Buteur', lastName: 'Trois', x: 50, y: 18, label: 'BU' },
  { userId: 'gu', firstName: 'Adam', lastName: '', x: 70, y: 40 },
]

function mount(props: Partial<React.ComponentProps<typeof PitchFormationEditor>> = {}) {
  const onSwap = vi.fn()
  const view = render(<PitchFormationEditor players={players} onSwap={onSwap} {...props} />)
  const pitch = view.container.firstElementChild as HTMLElement
  // 200x200 pitch so percentages map 1:2 to pixels
  pitch.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON() {} })
  return { onSwap, pitch }
}
const dot = (name: RegExp) => screen.getByTitle(name)

describe('PitchFormationEditor', () => {
  it('shows initials (or the custom label) in each bubble, never a number or "undefined", plus the first name', () => {
    mount()
    expect(dot(/Gardien/).textContent).toBe('GU')
    expect(dot(/Def/).textContent).toBe('DD')
    expect(dot(/Adam/).textContent).toBe('A') // guest without a surname
    expect(dot(/Buteur/).textContent).toBe('BU') // label wins
    expect(screen.getByText('Def')).toBeInTheDocument()
  })

  it('dropping a player on a neighbour swaps their slots', () => {
    const { onSwap, pitch } = mount()
    fireEvent.pointerDown(dot(/Def/), { pointerId: 1 })
    fireEvent.pointerMove(pitch, { clientX: 100, clientY: 36 }) // on top of the striker (50%, 18%)
    fireEvent.pointerUp(pitch)
    expect(onSwap).toHaveBeenCalledWith('df', 'st')
  })

  it('dropping in the middle of nowhere swaps nothing', () => {
    const { onSwap, pitch } = mount()
    fireEvent.pointerDown(dot(/Def/), { pointerId: 1 })
    fireEvent.pointerMove(pitch, { clientX: 10, clientY: 120 })
    fireEvent.pointerUp(pitch)
    expect(onSwap).not.toHaveBeenCalled()
  })

  it('a cancelled gesture swaps nothing', () => {
    const { onSwap, pitch } = mount()
    fireEvent.pointerDown(dot(/Def/), { pointerId: 1 })
    fireEvent.pointerCancel(pitch)
    fireEvent.pointerUp(pitch)
    expect(onSwap).not.toHaveBeenCalled()
  })

  it('read-only pitches cannot be dragged', () => {
    const { onSwap, pitch } = mount({ readOnly: true })
    expect(dot(/Def/)).toBeDisabled()
    fireEvent.pointerDown(dot(/Def/), { pointerId: 1 })
    fireEvent.pointerMove(pitch, { clientX: 100, clientY: 36 })
    fireEvent.pointerUp(pitch)
    expect(onSwap).not.toHaveBeenCalled()
  })

  it('pick mode: taps pick a player instead of dragging, and dims the ones that do not fit', () => {
    const onPick = vi.fn()
    const { onSwap } = mount({ pickMode: { onPick, fitIds: new Set(['st']) } })
    fireEvent.pointerDown(dot(/Buteur/), { pointerId: 1 })
    expect(onPick).toHaveBeenCalledWith('st')
    expect(onSwap).not.toHaveBeenCalled()
    expect(dot(/Def/).parentElement).toHaveClass('opacity-30')
    expect(dot(/Buteur/).parentElement).not.toHaveClass('opacity-30')
  })
})
