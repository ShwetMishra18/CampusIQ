import express from 'express'
import swaggerUi from 'swagger-ui-express'
import { openApiDocument } from './openapi.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { statusLabels } from '../src/data.js'
import { ensureCatalog, getCatalog, saveCatalogCollection } from './catalog-store.js'
import { addBooking, changeBookingStatus, ensureStore, listBookings, normalizeBookingDate, timeRangesOverlap } from './store.js'
import authRouter from './routes/auth.js'
import phaseTwoRouter from './routes/phase2.js'
import { allowRoles, requireAuth } from './middleware/auth.js'
import { databaseEnabled, disconnectDatabase } from './config/database.js'

const app = express()
const port = Number(process.env.PORT || 4000)
const projectDirectory = path.dirname(fileURLToPath(import.meta.url))
const distDirectory = path.resolve(projectDirectory, '../dist')
const roomTimeSlots = ['09:00 – 10:00', '10:00 – 11:00', '11:00 – 12:00', '12:00 – 13:00', '14:00 – 15:00', '15:00 – 16:00']
const allowedBookingStatuses = new Set(['Pending', 'Approved', 'Rejected', 'Completed'])

function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date())
}

function toMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function validISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

app.disable('x-powered-by')
const allowedFrontendOrigins = new Set((process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean))
app.use((request, response, next) => {
  const origin = request.headers.origin
  if (origin && allowedFrontendOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  }
  if (request.method === 'OPTIONS') return response.sendStatus(origin && !allowedFrontendOrigins.has(origin) ? 403 : 204)
  next()
})
app.use(express.json({ limit: '32kb' }))
app.use('/api/auth', authRouter)
app.get('/api-docs.json', (_request, response) => response.json(openApiDocument))
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument))
app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'CampusIQ API', storage: databaseEnabled ? 'postgresql' : 'demo-json', timestamp: new Date().toISOString() })
})

if (databaseEnabled) app.use('/api', phaseTwoRouter)

app.get('/api/admin/catalog', async (_request, response, next) => {
  try {
    response.json({ catalog: await getCatalog() })
  } catch (error) {
    next(error)
  }
})

app.put('/api/admin/catalog/:collection', requireAuth, allowRoles('ADMIN'), async (request, response, next) => {
  try {
    const catalog = await saveCatalogCollection(request.params.collection, request.body?.value)
    response.json({ catalog, message: `${request.params.collection} changes saved.` })
  } catch (error) {
    next(error)
  }
})

app.get('/api/buildings', async (_request, response, next) => {
  try {
    response.json({ buildings: (await getCatalog()).buildings })
  } catch (error) {
    next(error)
  }
})

app.get('/api/rooms', async (request, response, next) => {
  try {
  const catalog = await getCatalog()
  const { building, floor, status, q = '', date, timeSlot, capacity } = request.query
  if (capacity && capacity !== 'unlisted' && (!Number.isInteger(Number(capacity)) || Number(capacity) < 1)) return response.status(400).json({ error: 'Capacity must be a positive integer or “unlisted”.' })
  if (timeSlot && timeSlot !== 'Any time' && !roomTimeSlots.includes(timeSlot)) {
    return response.status(400).json({ error: 'Choose one of the supported time slots.' })
  }
  const interval = typeof timeSlot === 'string' && timeSlot !== 'Any time'
    ? timeSlot.split(' – ').map(toMinutes)
    : null

  const filtered = catalog.rooms.map((room) => {
    if (!interval) return room
    const stableStatus = ['maintenance', 'reserved'].includes(room.status) ? room.status : 'available'
    const scheduled = date === todayISO() && catalog.schedule.some((item) => {
      if (item.room !== room.name || (item.date && item.date !== date)) return false
      const [start, end] = item.time.split(' – ').map(toMinutes)
      return interval[0] < end && start < interval[1]
    })
    return { ...room, status: scheduled ? 'occupied' : stableStatus }
  }).filter((room) =>
    (!building || building === 'all' || room.building === building) &&
    (!floor || floor === 'all' || room.floor === floor) &&
    (!status || status === 'all' || room.status === status) &&
    (!q || room.name.toLowerCase().includes(String(q).toLowerCase())) &&
    (!capacity || (capacity === 'unlisted' ? room.capacity == null : room.capacity != null && room.capacity >= Number(capacity))),
  )

  response.json({ rooms: filtered, count: filtered.length, statusLabels })
  } catch (error) {
    next(error)
  }
})

app.get('/api/schedule', async (_request, response, next) => {
  try {
    response.json({ schedule: (await getCatalog()).schedule })
  } catch (error) {
    next(error)
  }
})

app.get('/api/announcements', async (request, response, next) => {
  try {
  const catalog = await getCatalog()
  const { category, q = '' } = request.query
  const filtered = catalog.announcements.filter((notice) =>
    (!category || category === 'All categories' || notice.category === category) &&
    (!q || `${notice.title} ${notice.category}`.toLowerCase().includes(String(q).toLowerCase())),
  )
  response.json({ announcements: filtered, count: filtered.length })
  } catch (error) {
    next(error)
  }
})

app.get('/api/bookings', requireAuth, async (request, response, next) => {
  try {
    const bookings = await listBookings(request.auth)
    response.json({ bookings, count: bookings.length })
  } catch (error) {
    next(error)
  }
})

app.post('/api/bookings', requireAuth, allowRoles('FACULTY', 'ADMIN'), async (request, response, next) => {
  try {
    const catalog = await getCatalog()
    const body = request.body || {}
    const roomName = typeof body.room === 'string' ? body.room.trim() : ''
    const purpose = typeof body.purpose === 'string' ? body.purpose.trim() : ''
    const bookingDate = normalizeBookingDate(String(body.date || ''))
    const time = typeof body.time === 'string' ? body.time : ''
    const buildingId = typeof body.building === 'string' ? body.building : ''
    const selectedRoom = catalog.rooms.find((room) => room.name === roomName)

    if (!roomName || !purpose || !bookingDate || !time || !buildingId) {
      return response.status(400).json({ error: 'Building, room, date, time slot, and purpose are required.' })
    }
    if (!validISODate(bookingDate)) {
      return response.status(400).json({ error: 'Please provide a valid booking date.' })
    }
    if (bookingDate < todayISO()) {
      return response.status(400).json({ error: 'The booking date must be today or later.' })
    }
    if (!catalog.buildings.some((building) => building.id === buildingId) || !selectedRoom || selectedRoom.building !== buildingId) {
      return response.status(400).json({ error: 'Choose a room from the selected building.' })
    }
    if (!roomTimeSlots.includes(time)) {
      return response.status(400).json({ error: 'Choose one of the available time slots.' })
    }
    if (purpose.length > 160) {
      return response.status(400).json({ error: 'Booking purpose must be 160 characters or fewer.' })
    }
    if (typeof body.notes === 'string' && body.notes.length > 500) {
      return response.status(400).json({ error: 'Additional notes must be 500 characters or fewer.' })
    }
    if (selectedRoom.status === 'maintenance') {
      return response.status(409).json({ error: 'This room is marked under maintenance in the sample campus data.' })
    }
    if (catalog.schedule.some((item) => item.room === roomName && (!item.date || item.date === bookingDate) && timeRangesOverlap(item.time, time))) {
      return response.status(409).json({ error: 'This room has a timetable activity during that time slot.' })
    }

    const saved = await addBooking({
      room: roomName,
      building: buildingId,
      purpose,
      date: bookingDate,
      time,
      notes: typeof body.notes === 'string' ? body.notes.trim() : '',
      requesterId: request.auth.id,
    })
    response.status(201).json({ booking: saved, message: 'Booking request saved.' })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/bookings/:id/status', requireAuth, allowRoles('ADMIN'), async (request, response, next) => {
  try {
    const inputStatus = String(request.body?.status || '').toUpperCase()
    const statuses = new Map([...allowedBookingStatuses].map((value) => [value.toUpperCase(), value]))
    const status = statuses.get(inputStatus)
    if (!status) {
      return response.status(400).json({ error: 'Status must be Pending, Approved, Rejected, or Completed.' })
    }
    const booking = await changeBookingStatus(request.params.id, status)
    if (!booking) return response.status(404).json({ error: 'Booking not found.' })
    response.json({ booking })
  } catch (error) {
    next(error)
  }
})

app.use(express.static(distDirectory))
app.get(/^(?!\/api(?:\/|$)).*/, (request, response, next) => {
  response.sendFile(path.join(distDirectory, 'index.html'), (error) => {
    if (error) next()
  })
})

app.use((error, _request, response, _next) => {
  console.error('[CampusIQ API]', error)
  const status = Number(error.status) || 500
  response.status(status).json({ error: status === 500 ? 'The server could not complete the request.' : error.message })
})

await Promise.all([ensureStore(), ensureCatalog()])
const server = app.listen(port, process.env.HOST || '0.0.0.0', () => {
  console.log(`CampusIQ API ready at http://127.0.0.1:${port}`)
  console.log(databaseEnabled ? 'Storage: PostgreSQL via Prisma' : 'Storage: labelled DEMO JSON mode (DATABASE_URL is unset)')
})

async function shutdown() {
  server.close(async () => { await disconnectDatabase(); process.exit(0) })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
