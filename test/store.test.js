import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBookingDate, timeRangesOverlap } from '../server/store.js'

test('adjacent classroom bookings do not overlap', () => {
  assert.equal(timeRangesOverlap('09:00 – 10:00', '10:00 – 11:00'), false)
})

test('partially overlapping classroom bookings conflict', () => {
  assert.equal(timeRangesOverlap('09:00 – 10:00', '09:45 – 10:30'), true)
})

test('overlap detection is symmetric', () => {
  const first = timeRangesOverlap('14:00 – 15:00', '14:30 – 15:30')
  const second = timeRangesOverlap('14:30 – 15:30', '14:00 – 15:00')
  assert.equal(first, true)
  assert.equal(second, first)
})

test('demo booking dates normalize without guessing missing fields', () => {
  assert.equal(normalizeBookingDate('05 Nov 2026'), '2026-11-05')
  assert.equal(normalizeBookingDate('2026-11-05'), '2026-11-05')
  assert.equal(normalizeBookingDate('not a date'), null)
})
