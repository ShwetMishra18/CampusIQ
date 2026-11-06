import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sampleBookings } from '../src/data.js'

const dataDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')
const bookingsFile = path.join(dataDirectory, 'bookings.json')
let mutationQueue = Promise.resolve()

const monthNumbers = new Map([
  ['jan', '01'], ['feb', '02'], ['mar', '03'], ['apr', '04'], ['may', '05'], ['jun', '06'],
  ['jul', '07'], ['aug', '08'], ['sep', '09'], ['oct', '10'], ['nov', '11'], ['dec', '12'],
])

function dateToISO(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const match = value.match(/^(\d{1,2})\s+([a-z]{3})\s+(\d{4})$/i)
  if (!match) return null
  const month = monthNumbers.get(match[2].toLowerCase())
  if (!month) return null
  return `${match[3]}-${month}-${match[1].padStart(2, '0')}`
}

export function formatDate(value) {
  const date = new Date(`${value}T12:00:00+05:30`)
  if (Number.isNaN(date.valueOf())) return value
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(date)
}

function publicBooking(booking) {
  return { ...booking, dateISO: booking.date, date: formatDate(booking.date) }
}

async function readStoredBookings() {
  return JSON.parse(await readFile(bookingsFile, 'utf8'))
}

async function writeStoredBookings(bookings) {
  const temporaryFile = `${bookingsFile}.tmp`
  await writeFile(temporaryFile, `${JSON.stringify(bookings, null, 2)}\n`, 'utf8')
  await rename(temporaryFile, bookingsFile)
}

export async function ensureStore() {
  await mkdir(dataDirectory, { recursive: true })
  try {
    await readFile(bookingsFile, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    const seed = sampleBookings.map((booking, index) => ({
      id: `demo-${index + 1}`,
      room: booking.room,
      purpose: booking.purpose,
      date: dateToISO(booking.date),
      time: booking.time,
      status: booking.status,
      notes: '',
      createdAt: null,
    }))
    await writeStoredBookings(seed)
  }
}

export async function listBookings(auth = null) {
  const bookings = await readStoredBookings()
  return bookings
    .filter((booking) => !auth || auth.role === 'ADMIN' || booking.id?.startsWith('demo-') || booking.requesterId === auth.id)
    .toSorted((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .map(publicBooking)
}

function toMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

export function timeRangesOverlap(left, right) {
  const [leftStart, leftEnd] = left.split(' – ').map(toMinutes)
  const [rightStart, rightEnd] = right.split(' – ').map(toMinutes)
  return leftStart < rightEnd && rightStart < leftEnd
}

export async function addBooking(input) {
  const result = mutationQueue.then(async () => {
    const bookings = await readStoredBookings()
    const overlaps = bookings.find((existing) =>
      existing.room === input.room &&
      existing.date === input.date &&
      ['Pending', 'Approved'].includes(existing.status) &&
      timeRangesOverlap(existing.time, input.time),
    )
    if (overlaps) {
      const error = new Error('That room already has a pending or approved booking during this time.')
      error.status = 409
      throw error
    }
    const saved = {
      id: randomUUID(),
      ...input,
      status: 'Pending',
      createdAt: new Date().toISOString(),
    }
    await writeStoredBookings([saved, ...bookings])
    return publicBooking(saved)
  })
  mutationQueue = result.catch(() => undefined)
  return result
}

export async function changeBookingStatus(id, status) {
  const result = mutationQueue.then(async () => {
    const bookings = await readStoredBookings()
    const index = bookings.findIndex((booking) => booking.id === id)
    if (index === -1) return null
    bookings[index] = { ...bookings[index], status }
    await writeStoredBookings(bookings)
    return publicBooking(bookings[index])
  })
  mutationQueue = result.catch(() => undefined)
  return result
}

export function normalizeBookingDate(value) {
  return dateToISO(value)
}
