import { useEffect, useState } from 'react'
import { CalendarBlank, CaretDown, CaretLeft, CaretRight, CaretUp } from '@phosphor-icons/react'
import { DayPicker, type DateRange } from 'react-day-picker'
import 'react-day-picker/style.css'
import type { RangeDays } from '../ranges'
import { presetLabel, RANGE_PRESETS } from '../ranges'
import { MenuItem } from './Menu'

const DAY = 86400000
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmtShort = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
// Every preset ends at the corpus endDate, so the printed span is always
// `endDate - N days` through `endDate`. Single-day presets are not offered (a
// one-day window empties the Activity-over-time series and has no
// activation-eligible members), which is why no preset needs a one-date form.
const fmtRange = (from: Date, to: Date) => `${fmtShort(from)} - ${fmtShort(to)}`
const PickChevron = ({ orientation }: { orientation?: 'up' | 'down' | 'left' | 'right' }) =>
  orientation === 'left' ? <CaretLeft size={20} color="var(--content-secondary)"/> :
  orientation === 'right' ? <CaretRight size={20} color="var(--content-secondary)"/> :
  orientation === 'up' ? <CaretUp size={20} color="var(--content-secondary)"/> :
  <CaretDown size={20} color="var(--content-secondary)"/>

export function DateRangePicker({ range, custom, endDate, onSelectPreset, onSelectRange }: {
  range: RangeDays
  custom: { from: Date; to: Date } | null
  endDate: Date
  onSelectPreset: (d: RangeDays) => void
  onSelectRange: (from: Date, to: Date) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [sel, setSel] = useState<DateRange | undefined>(undefined)
  const [hoverRange, setHoverRange] = useState<DateRange | undefined>(undefined)
  const minDate = new Date(endDate.getTime() - 90 * DAY)
  const from = custom ? custom.from : new Date(endDate.getTime() - range * DAY)
  const to = custom ? custom.to : endDate
  // Both the closed trigger and the open rows read their label and their dates
  // from the same preset descriptor, so the trigger can never print
  // "Last 84 days" for the row the user just clicked.
  const label = custom ? 'Custom range' : presetLabel(range)
  const value = fmtRange(from, to)

  const open = () => {
    setSel({ from, to })
    setPickerOpen(o => !o)
  }
  const choose = (d: RangeDays) => { onSelectPreset(d); setPickerOpen(false) }
  const hoverPreset = (d: RangeDays) => setHoverRange({ from: new Date(endDate.getTime() - d * DAY), to: endDate })
  const clearHover = () => setHoverRange(undefined)
  const onSelect = (next: DateRange | undefined) => {
    setSel(next)
    if (next?.from && next?.to) { onSelectRange(next.from, next.to); setPickerOpen(false) }
  }

  useEffect(() => {
    if (!pickerOpen) return
    const onDown = (e: MouseEvent) => { const t = e.target as HTMLElement; if (!t.closest('.date-control, .dc-popover')) setPickerOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickerOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [pickerOpen])

  return (
    <div className="date-control">
      <CalendarBlank size={16} color="var(--content-tertiary)"/>
      <span className="dc-label">{label}</span>
      <span className="dc-value">{value}</span>
      <button className="dc-trigger" aria-label="Reporting period" aria-haspopup="dialog" aria-expanded={pickerOpen} onClick={open}/>
      {pickerOpen && (
        <div className="dc-popover" role="dialog" aria-label="Choose reporting period">
          <div className="dc-list" role="listbox">
            {RANGE_PRESETS.map(p => (
              <MenuItem
                key={p.days}
                label={p.label}
                trailing={fmtRange(new Date(endDate.getTime() - p.days * DAY), endDate)}
                selected={!custom && range === p.days}
                onSelect={() => choose(p.days)}
                onMouseEnter={() => hoverPreset(p.days)}
                onMouseLeave={clearHover}
              />
            ))}
          </div>
          <div className="dc-calendar">
            <DayPicker
              components={{ Chevron: PickChevron }}
              mode="range"
              navLayout="around"
              selected={hoverRange ?? sel}
              onSelect={onSelect}
              defaultMonth={new Date(endDate.getTime() - 30 * DAY)}
              startMonth={minDate}
              endMonth={endDate}
              weekStartsOn={1}
              showOutsideDays
              today={endDate}
              disabled={[{ before: minDate }, { after: endDate }]}
            />
          </div>
        </div>
      )}
    </div>
  )
}
