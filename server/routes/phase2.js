import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../config/database.js'
import { allowRoles, currentUser, requireAuth } from '../middleware/auth.js'
import { notifyUsers, writeAudit } from '../services/audit.js'

const router = Router()
const timeSlots = ['09:00 – 10:00', '10:00 – 11:00', '11:00 – 12:00', '12:00 – 13:00', '14:00 – 15:00', '15:00 – 16:00']
const bookingInclude = { room: { include: { building: true, floor: true } }, requester: { select: { id: true, name: true, email: true } }, reviewer: { select: { id: true, name: true } } }

function fail(status, message) { const error = new Error(message); error.status = status; return error }
function isoDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}
function slotDates(date, time) {
  if (!isoDay(date) || !timeSlots.includes(time)) throw fail(400, 'Choose a valid date and supported time slot.')
  const [start, end] = time.split(' – ')
  return { bookingDate: new Date(`${date}T00:00:00.000Z`), startAt: new Date(`${date}T${start}:00+05:30`), endAt: new Date(`${date}T${end}:00+05:30`) }
}
function audienceWhere(user) {
  return { AND: [
    { OR: [{ branch: null }, { branch: user.branch || '__none__' }] },
    { OR: [{ year: null }, { year: user.year || -1 }] },
    { OR: [{ semester: null }, { semester: user.semester || -1 }] },
    { OR: [{ section: null }, { section: user.section || '__none__' }] },
  ] }
}
router.use(requireAuth)

router.get('/dashboard', async (req, res, next) => {
  try {
    const user = await currentUser(req)
    const [buildings, rooms, pendingBookings, scheduleCount, noticeCount] = await Promise.all([
      prisma.building.count({ where: { isActive: true, isDemo: user.isDemo } }), prisma.room.count({ where: { isActive: true, isDemo: user.isDemo } }),
      prisma.booking.count({ where: { isDemo: user.isDemo, ...(req.auth.role === 'ADMIN' ? {} : { requesterId: req.auth.id }), status: 'PENDING' } }),
      prisma.academicSchedule.count({ where: { isDemo: user.isDemo, startsAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
      prisma.examinationNotice.count({ where: { isDemo: user.isDemo, publishedAt: { not: null } } }),
    ])
    res.json({ stats: { buildings, rooms, pendingBookings, scheduleCount, noticeCount } })
  } catch (error) { next(error) }
})

router.get('/buildings', async (_req, res, next) => {
  try { const user = await currentUser(_req); res.json({ buildings: await prisma.building.findMany({ where: { isActive: true, isDemo: user.isDemo }, include: { floors: { orderBy: { sortOrder: 'asc' } }, rooms: { where: { isActive: true, isDemo: user.isDemo }, select: { id: true, code: true, name: true, roomType: true, capacity: true, floorId: true, isActive: true, isDemo: true } } }, orderBy: { name: 'asc' } }) }) } catch (error) { next(error) }
})

router.get('/rooms', async (req, res, next) => {
  try {
    const { building, floor, capacity, q = '', status = 'all', date, timeSlot } = req.query
    const user = await currentUser(req)
    const capacityWhere = capacity === 'unlisted' ? { capacity: null } : capacity ? { capacity: { gte: Number(capacity) } } : {}
    if (capacity && capacity !== 'unlisted' && (!Number.isInteger(Number(capacity)) || Number(capacity) < 1)) return res.status(400).json({ error: 'Capacity must be a positive integer or “unlisted”.' })
    const rooms = await prisma.room.findMany({ where: { isActive: true, isDemo: user.isDemo, building: { isActive: true, isDemo: user.isDemo, ...(building && building !== 'all' ? { code: { equals: String(building), mode: 'insensitive' } } : {}) }, ...(floor && floor !== 'all' ? { floor: { name: floor } } : {}), ...capacityWhere, ...(q ? { OR: [{ name: { contains: String(q), mode: 'insensitive' } }, { code: { contains: String(q), mode: 'insensitive' } }] } : {}) }, include: { building: true, floor: true }, orderBy: [{ building: { name: 'asc' } }, { code: 'asc' }] })
    if (!date || !timeSlot || timeSlot === 'Any time') {
      const result = rooms.map((room) => ({ ...room, status: room.status, buildingId: room.buildingId, buildingName: room.building.name, floor: room.floor?.name || '' }))
      const filtered = status === 'all' ? result : result.filter((room) => room.status === status)
      return res.json({ rooms: filtered, count: filtered.length })
    }
    if (!timeSlots.includes(timeSlot) || !isoDay(date)) return res.status(400).json({ error: 'Choose a valid date and time slot.' })
    const { startAt, endAt } = slotDates(date, timeSlot)
    const roomIds = rooms.map((room) => room.id)
    const [bookings, schedules] = await Promise.all([
      prisma.booking.findMany({ where: { isDemo: user.isDemo, roomId: { in: roomIds }, bookingDate: new Date(`${date}T00:00:00Z`), status: { in: ['PENDING', 'APPROVED'] }, startAt: { lt: endAt }, endAt: { gt: startAt } }, select: { roomId: true } }),
      prisma.academicSchedule.findMany({ where: { isDemo: user.isDemo, roomId: { in: roomIds }, startsAt: { lt: endAt }, endsAt: { gt: startAt } }, select: { roomId: true } }),
    ])
    const busy = new Set([...bookings, ...schedules].map((item) => item.roomId))
      const result = rooms.map((room) => ({ ...room, status: busy.has(room.id) ? 'occupied' : room.status, buildingId: room.buildingId, buildingName: room.building.name, floor: room.floor?.name || '' }))
    res.json({ rooms: status === 'all' ? result : result.filter((room) => room.status === status), count: status === 'all' ? result.length : result.filter((room) => room.status === status).length })
  } catch (error) { next(error) }
})

router.get('/subjects', async (req, res, next) => {
  try { const actor = await currentUser(req); res.json({ subjects: await prisma.subject.findMany({ where: { isDemo: actor.isDemo, ...(req.query.branch ? { branch: String(req.query.branch) } : {}), ...(req.query.semester ? { semester: Number(req.query.semester) } : {}) }, orderBy: { name: 'asc' } }) }) } catch (error) { next(error) }
})
router.post('/subjects', allowRoles('ADMIN', 'FACULTY'), async (req, res, next) => {
  try { const actor = await currentUser(req); const { name, code, branch, year, semester } = req.body || {}; if (!String(name || '').trim() || String(name).length > 160 || (code && String(code).length > 40)) return res.status(400).json({ error: 'Subject name is required and code must be 40 characters or fewer.' }); const subject = await prisma.subject.create({ data: { name: String(name).trim(), code: code || null, branch: branch || null, year: year ? Number(year) : null, semester: semester ? Number(semester) : null, isDemo: actor.isDemo } }); await prisma.$transaction((tx) => writeAudit(tx, { actorId: req.auth.id, action: 'SUBJECT_CREATED', entityType: 'Subject', entityId: subject.id, newData: subject })); res.status(201).json({ subject }) } catch (error) { next(error) }
})
router.get('/bookings', async (req, res, next) => {
  try {
    const user = await currentUser(req)
    const where = { isDemo: user.isDemo, ...(req.auth.role === 'ADMIN' ? {} : { requesterId: req.auth.id }) }
    const bookings = await prisma.booking.findMany({ where, include: bookingInclude, orderBy: [{ bookingDate: 'asc' }, { startAt: 'asc' }] })
    res.json({ bookings, count: bookings.length })
  } catch (error) { next(error) }
})

router.get('/bookings/:id/history', async (req, res, next) => {
  try {
    const actor = await currentUser(req)
    const booking = await prisma.booking.findFirst({ where: { id: req.params.id, isDemo: actor.isDemo, ...(req.auth.role === 'ADMIN' ? {} : { requesterId: req.auth.id }) }, select: { id: true } })
    if (!booking) return res.status(404).json({ error: 'Booking not found.' })
    res.json({ history: await prisma.auditLog.findMany({ where: { entityType: 'Booking', entityId: booking.id, actor: { isDemo: actor.isDemo } }, include: { actor: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'asc' } }) })
  } catch (error) { next(error) }
})

router.post('/bookings', allowRoles('FACULTY', 'ADMIN'), async (req, res, next) => {
  try {
    const { roomId, room: roomName, building: buildingCode, date, time, startAt: providedStart, endAt: providedEnd, purpose, notes = '' } = req.body || {}
    if (typeof notes !== 'string' || notes.length > 500) return res.status(400).json({ error: 'Notes must be at most 500 characters.' })
    if (!purpose || String(purpose).length > 500) return res.status(400).json({ error: 'Booking purpose is required (maximum 500 characters).' })
    const actor = await currentUser(req)
    let room = roomId ? await prisma.room.findFirst({ where: { id: roomId, isDemo: actor.isDemo } }) : await prisma.room.findFirst({ where: { OR: [{ code: String(roomName || '') }, { name: String(roomName || '') }], building: { code: { equals: String(buildingCode || ''), mode: 'insensitive' } }, isDemo: actor.isDemo, isActive: true } })
    if (!room || !room.isActive) return res.status(404).json({ error: 'Choose an active room.' })
    if (room.status !== 'available') return res.status(409).json({ error: 'This room is not marked available.' })
    let interval
    if (providedStart && providedEnd) {
      const startAt = new Date(providedStart); const endAt = new Date(providedEnd)
      if (Number.isNaN(+startAt) || Number.isNaN(+endAt) || endAt <= startAt) return res.status(400).json({ error: 'End time must be after start time.' })
      interval = { startAt, endAt, bookingDate: new Date(`${startAt.toISOString().slice(0, 10)}T00:00:00Z`) }
    } else interval = slotDates(date, time)
    const type = ({ lecture: 'LECTURE', practical: 'PRACTICAL', examination: 'EXAMINATION', event: 'EVENT' })[String(req.body.purposeType || '').toLowerCase()]
    if (!type) return res.status(400).json({ error: 'Choose a valid booking purpose type.' })
    const booking = await prisma.$transaction(async (tx) => {
      const overlap = await tx.booking.findFirst({ where: { isDemo: actor.isDemo, roomId: room.id, bookingDate: interval.bookingDate, status: { in: ['PENDING', 'APPROVED'] }, startAt: { lt: interval.endAt }, endAt: { gt: interval.startAt } } })
      const scheduled = await tx.academicSchedule.findFirst({ where: { isDemo: actor.isDemo, roomId: room.id, startsAt: { lt: interval.endAt }, endsAt: { gt: interval.startAt } } })
      if (overlap || scheduled) {
        const alternatives = await tx.room.findMany({ where: { id: { not: room.id }, buildingId: room.buildingId, isDemo: actor.isDemo, isActive: true, status: 'available', bookings: { none: { isDemo: actor.isDemo, bookingDate: interval.bookingDate, status: { in: ['PENDING', 'APPROVED'] }, startAt: { lt: interval.endAt }, endAt: { gt: interval.startAt } } }, schedules: { none: { isDemo: actor.isDemo, startsAt: { lt: interval.endAt }, endsAt: { gt: interval.startAt } } } }, take: 5, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, capacity: true } })
        throw Object.assign(fail(409, 'That room is not available for the requested time.'), { alternatives })
      }
      const saved = await tx.booking.create({ data: { requesterId: req.auth.id, roomId: room.id, purpose: type, details: String(purpose), bookingDate: interval.bookingDate, startAt: interval.startAt, endAt: interval.endAt, isDemo: actor.isDemo }, include: bookingInclude })
      await writeAudit(tx, { actorId: req.auth.id, action: 'BOOKING_CREATED', entityType: 'Booking', entityId: saved.id, newData: saved })
      return saved
    }, { isolationLevel: 'Serializable' })
    res.status(201).json({ booking })
  } catch (error) {
    if (error.code === 'P2034' || error.code === 'P2004' || error.code === '23P01') return res.status(409).json({ error: 'Another booking was saved for this room and time. Refresh availability and try another room.' })
    if (error.status === 409 && error.alternatives) return res.status(409).json({ error: error.message, alternatives: error.alternatives })
    next(error)
  }
})

router.patch('/bookings/:id/status', allowRoles('ADMIN'), async (req, res, next) => {
  try {
    const status = String(req.body?.status || '').toUpperCase()
    if (!['APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'].includes(status)) return res.status(400).json({ error: 'Choose a valid booking status.' })
    const actor = await currentUser(req)
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.booking.findFirst({ where: { id: req.params.id, isDemo: actor.isDemo }, include: bookingInclude })
      if (!before) throw fail(404, 'Booking not found.')
      if (status === 'APPROVED') {
        const [bookingConflict, scheduleConflict] = await Promise.all([
          tx.booking.findFirst({ where: { id: { not: before.id }, isDemo: actor.isDemo, roomId: before.roomId, bookingDate: before.bookingDate, status: { in: ['PENDING', 'APPROVED'] }, startAt: { lt: before.endAt }, endAt: { gt: before.startAt } } }),
          tx.academicSchedule.findFirst({ where: { isDemo: actor.isDemo, roomId: before.roomId, startsAt: { lt: before.endAt }, endsAt: { gt: before.startAt } } }),
        ])
        if (bookingConflict || scheduleConflict) throw fail(409, 'This booking conflicts with another booking or academic schedule and cannot be approved.')
      }
      const after = await tx.booking.update({ where: { id: before.id }, data: { status, reviewerId: req.auth.id, cancelledAt: status === 'CANCELLED' ? new Date() : before.cancelledAt }, include: bookingInclude })
      await writeAudit(tx, { actorId: req.auth.id, action: `BOOKING_${status}`, entityType: 'Booking', entityId: before.id, previousData: before, newData: after })
      await notifyUsers(tx, [before.requesterId], status === 'CANCELLED' ? 'BOOKING_CANCELLED' : 'BOOKING_STATUS', `Booking ${status.toLowerCase()}`, `Your booking for ${before.room.name} was ${status.toLowerCase()}.`, { bookingId: before.id })
      return after
    })
    res.json({ booking: result })
  } catch (error) { next(error) }
})

router.patch('/bookings/:id/cancel', async (req, res, next) => {
  try {
    const actor = await currentUser(req)
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.booking.findFirst({ where: { id: req.params.id, isDemo: actor.isDemo }, include: bookingInclude })
      if (!before) throw fail(404, 'Booking not found.')
      if (req.auth.role !== 'ADMIN' && before.requesterId !== req.auth.id) throw fail(403, 'You can cancel only your own bookings.')
      if (!['PENDING', 'APPROVED'].includes(before.status)) throw fail(409, 'This booking can no longer be cancelled.')
      const after = await tx.booking.update({ where: { id: before.id }, data: { status: 'CANCELLED', cancelledAt: new Date() }, include: bookingInclude })
      await writeAudit(tx, { actorId: req.auth.id, action: 'BOOKING_CANCELLED', entityType: 'Booking', entityId: before.id, previousData: before, newData: after })
      await notifyUsers(tx, before.requesterId === req.auth.id ? [] : [before.requesterId], 'BOOKING_CANCELLED', 'Booking cancelled', `${before.room.name} booking was cancelled.`, { bookingId: before.id })
      return after
    })
    res.json({ booking: result })
  } catch (error) { next(error) }
})

router.patch('/bookings/:id/reschedule', allowRoles('FACULTY', 'ADMIN'), async (req, res, next) => {
  try {
    const actor = await currentUser(req)
    const { roomId, date, time } = req.body || {}; const interval = slotDates(date, time)
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.booking.findFirst({ where: { id: req.params.id, isDemo: actor.isDemo }, include: bookingInclude })
      if (!before) throw fail(404, 'Booking not found.')
      if (req.auth.role !== 'ADMIN' && before.requesterId !== req.auth.id) throw fail(403, 'You can reschedule only your own bookings.')
      if (!['PENDING', 'APPROVED'].includes(before.status)) throw fail(409, 'Only active bookings can be rescheduled.')
      const targetRoom = await tx.room.findFirst({ where: { id: roomId || before.roomId, isDemo: actor.isDemo } })
      if (!targetRoom?.isActive) throw fail(404, 'Choose an active room.')
      const [conflict, scheduled] = await Promise.all([
        tx.booking.findFirst({ where: { id: { not: before.id }, isDemo: actor.isDemo, roomId: targetRoom.id, bookingDate: interval.bookingDate, status: { in: ['PENDING', 'APPROVED'] }, startAt: { lt: interval.endAt }, endAt: { gt: interval.startAt } } }),
        tx.academicSchedule.findFirst({ where: { isDemo: actor.isDemo, roomId: targetRoom.id, startsAt: { lt: interval.endAt }, endsAt: { gt: interval.startAt } } }),
      ])
      if (conflict || scheduled) throw fail(409, 'The rescheduled room and time are unavailable.')
      const after = await tx.booking.update({ where: { id: before.id }, data: { roomId: targetRoom.id, ...interval }, include: bookingInclude })
      await writeAudit(tx, { actorId: req.auth.id, action: 'BOOKING_RESCHEDULED', entityType: 'Booking', entityId: before.id, previousData: before, newData: after })
      await notifyUsers(tx, [before.requesterId], 'BOOKING_STATUS', 'Booking rescheduled', `${before.room.name} booking details changed.`, { bookingId: before.id })
      return after
    }, { isolationLevel: 'Serializable' })
    res.json({ booking: result })
  } catch (error) { next(error) }
})

router.get('/schedule', async (req, res, next) => {
  try {
    const user = await currentUser(req)
    const where = { isDemo: user.isDemo, ...(req.query.date && isoDay(req.query.date) ? { startsAt: { gte: new Date(`${req.query.date}T00:00:00Z`), lt: new Date(new Date(`${req.query.date}T00:00:00Z`).getTime() + 86400000) } } : {}), ...(req.auth.role === 'STUDENT' ? audienceWhere(user) : {}), ...(req.query.branch ? { branch: String(req.query.branch) } : {}), ...(req.query.semester ? { semester: Number(req.query.semester) } : {}) }
    res.json({ schedule: await prisma.academicSchedule.findMany({ where, include: { subject: true, room: { include: { building: true } }, creator: { select: { name: true } }, faculty: { select: { name: true } } }, orderBy: { startsAt: 'asc' } }) })
  } catch (error) { next(error) }
})

router.post('/schedule', allowRoles('ADMIN', 'FACULTY'), async (req, res, next) => {
  try {
    const { subjectId, roomId, facultyId, branch, year, semester, section, startsAt, endsAt } = req.body || {}
    const start = new Date(startsAt); const end = new Date(endsAt)
    if (!subjectId || !roomId || Number.isNaN(+start) || Number.isNaN(+end) || end <= start) return res.status(400).json({ error: 'Subject, room, valid start and end time are required.' })
    const actor = await currentUser(req)
    const assignedFacultyId = facultyId || (req.auth.role === 'FACULTY' ? req.auth.id : null)
    const item = await prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({ where: { id: roomId, isActive: true, isDemo: actor.isDemo } })
      if (!room) throw fail(404, 'Choose an active room in your data set.')
      if (room.status !== 'available') throw fail(409, 'This room is not marked available.')
      if (!(await tx.subject.findFirst({ where: { id: subjectId, isDemo: actor.isDemo } }))) throw fail(404, 'Subject was not found in this data set.')
      if (assignedFacultyId && !(await tx.user.findFirst({ where: { id: assignedFacultyId, role: 'FACULTY', isDemo: actor.isDemo } }))) throw fail(400, 'Assigned faculty must be an active faculty account in this data set.')
      const [roomConflict, bookingConflict] = await Promise.all([
        tx.academicSchedule.findFirst({ where: { isDemo: actor.isDemo, roomId, startsAt: { lt: end }, endsAt: { gt: start } } }),
        tx.booking.findFirst({ where: { isDemo: actor.isDemo, roomId, status: { in: ['PENDING', 'APPROVED'] }, startAt: { lt: end }, endAt: { gt: start } } }),
      ])
      if (roomConflict || bookingConflict) throw fail(409, 'That room already has a scheduled activity or booking at this time.')
      const created = await tx.academicSchedule.create({ data: { subjectId, roomId, facultyId: assignedFacultyId, branch: branch || null, year: year ? Number(year) : null, semester: semester ? Number(semester) : null, section: section || null, startsAt: start, endsAt: end, createdById: req.auth.id, isDemo: actor.isDemo }, include: { subject: true, room: true } })
      const targeted = await tx.user.findMany({ where: { role: 'STUDENT', isDemo: actor.isDemo, ...audienceWhere({ branch, year, semester, section }) }, select: { id: true } })
      await notifyUsers(tx, targeted.map((user) => user.id), 'SCHEDULE_CHANGE', 'Academic schedule updated', `${created.subject.name} schedule was updated.`, { scheduleId: created.id })
      await writeAudit(tx, { actorId: req.auth.id, action: 'SCHEDULE_CREATED', entityType: 'AcademicSchedule', entityId: created.id, newData: created })
      return created
    }, { isolationLevel: 'Serializable' })
    res.status(201).json({ schedule: item })
  } catch (error) { next(error) }
})

router.put('/schedule/:id', allowRoles('ADMIN', 'FACULTY'), async (req, res, next) => {
  try {
    const actor = await currentUser(req)
    const before = await prisma.academicSchedule.findFirst({ where: { id: req.params.id, isDemo: actor.isDemo }, include: { room: true, subject: true } })
    if (!before) return res.status(404).json({ error: 'Schedule entry not found.' })
    if (req.auth.role === 'FACULTY' && before.facultyId !== req.auth.id && before.createdById !== req.auth.id) return res.status(403).json({ error: 'Faculty may edit only their own schedule entries.' })
    const { startsAt, endsAt, roomId, subjectId, facultyId, branch, year, semester, section } = req.body || {}
    const start = startsAt ? new Date(startsAt) : before.startsAt; const end = endsAt ? new Date(endsAt) : before.endsAt
    if (Number.isNaN(+start) || Number.isNaN(+end) || end <= start) return res.status(400).json({ error: 'End time must be after start time.' })
    const targetRoomId = roomId || before.roomId
    const updated = await prisma.$transaction(async (tx) => {
      const [room, roomConflict, bookingConflict] = await Promise.all([
        tx.room.findFirst({ where: { id: targetRoomId, isActive: true, isDemo: actor.isDemo } }),
        tx.academicSchedule.findFirst({ where: { id: { not: before.id }, isDemo: actor.isDemo, roomId: targetRoomId, startsAt: { lt: end }, endsAt: { gt: start } } }),
        tx.booking.findFirst({ where: { isDemo: actor.isDemo, roomId: targetRoomId, status: { in: ['PENDING', 'APPROVED'] }, startAt: { lt: end }, endAt: { gt: start } } }),
      ])
      if (!room) throw fail(404, 'Choose an active room in your data set.')
      if (room.status !== 'available') throw fail(409, 'This room is not marked available.')
      if (roomConflict || bookingConflict) throw fail(409, 'That room already has a scheduled activity or booking at this time.')
      const after = await tx.academicSchedule.update({ where: { id: before.id }, data: { startsAt: start, endsAt: end, roomId: targetRoomId, subjectId: subjectId || before.subjectId, facultyId: facultyId || before.facultyId, branch: branch ?? before.branch, year: year === undefined ? before.year : year ? Number(year) : null, semester: semester === undefined ? before.semester : semester ? Number(semester) : null, section: section ?? before.section }, include: { subject: true, room: true } })
      await writeAudit(tx, { actorId: req.auth.id, action: 'SCHEDULE_UPDATED', entityType: 'AcademicSchedule', entityId: before.id, previousData: before, newData: after })
      const students = await tx.user.findMany({ where: { role: 'STUDENT', isDemo: actor.isDemo, ...audienceWhere(after) }, select: { id: true } })
      await notifyUsers(tx, students.map((user) => user.id), 'SCHEDULE_CHANGE', 'Academic schedule updated', `${after.subject.name} schedule was updated.`, { scheduleId: after.id })
      return after
    }, { isolationLevel: 'Serializable' })
    res.json({ schedule: updated })
  } catch (error) { next(error) }
})

router.delete('/schedule/:id', allowRoles('ADMIN', 'FACULTY'), async (req, res, next) => {
  try {
    const actor = await currentUser(req)
    const before = await prisma.academicSchedule.findFirst({ where: { id: req.params.id, isDemo: actor.isDemo } })
    if (!before) return res.status(404).json({ error: 'Schedule entry not found.' })
    if (req.auth.role === 'FACULTY' && before.facultyId !== req.auth.id && before.createdById !== req.auth.id) return res.status(403).json({ error: 'Faculty may delete only their own schedule entries.' })
    await prisma.$transaction(async (tx) => { await writeAudit(tx, { actorId: req.auth.id, action: 'SCHEDULE_DELETED', entityType: 'AcademicSchedule', entityId: before.id, previousData: before }); await tx.academicSchedule.delete({ where: { id: before.id } }) })
    res.status(204).end()
  } catch (error) { next(error) }
})

router.get('/examinations', requireAuth, async (req, res, next) => {
  try { const user = await currentUser(req); const where = { isDemo: user.isDemo, ...(req.auth.role === 'ADMIN' ? {} : { publishedAt: { not: null }, ...audienceWhere(user) }) }; res.json({ notices: await prisma.examinationNotice.findMany({ where, orderBy: [{ publishedAt: 'desc' }, { examDate: 'asc' }] }) }) } catch (error) { next(error) }
})
router.post('/examinations', allowRoles('ADMIN'), async (req, res, next) => {
  try {
    const actor = await currentUser(req)
    const { title, body, examDate, venue, branch, year, semester, section, publish = true } = req.body || {}
    if (!String(title || '').trim() || !String(body || '').trim() || (examDate && !isoDay(examDate))) return res.status(400).json({ error: 'Title, notice text and an optional valid exam date are required.' })
    const notice = await prisma.$transaction(async (tx) => {
      const created = await tx.examinationNotice.create({ data: { title: String(title).trim(), body: String(body).trim(), examDate: examDate ? new Date(examDate + 'T00:00:00Z') : null, venue: venue || null, branch: branch || null, year: year ? Number(year) : null, semester: semester ? Number(semester) : null, section: section || null, publishedAt: publish ? new Date() : null, createdById: req.auth.id, isDemo: actor.isDemo } })
      if (publish) { const students = await tx.user.findMany({ where: { role: 'STUDENT', isDemo: actor.isDemo, ...audienceWhere(created) }, select: { id: true } }); await notifyUsers(tx, students.map((item) => item.id), 'NOTICE_PUBLISHED', created.title, 'A new examination notice has been published.', { examinationNoticeId: created.id }) }
      await writeAudit(tx, { actorId: req.auth.id, action: 'EXAM_NOTICE_CREATED', entityType: 'ExaminationNotice', entityId: created.id, newData: created })
      return created
    })
    res.status(201).json({ notice })
  } catch (error) { next(error) }
})
router.put('/examinations/:id', allowRoles('ADMIN'), async (req, res, next) => {
  try {
    const actor = await currentUser(req)
    const before = await prisma.examinationNotice.findFirst({ where: { id: req.params.id, isDemo: actor.isDemo } })
    if (!before) return res.status(404).json({ error: 'Notice not found.' })
    const data = { ...req.body }; delete data.isDemo; delete data.createdById; delete data.id; delete data.publish
    if (data.examDate) { if (!isoDay(data.examDate)) return res.status(400).json({ error: 'Exam date must be a valid calendar date.' }); data.examDate = new Date(data.examDate + 'T00:00:00Z') }
    if (typeof req.body?.publish === 'boolean') data.publishedAt = req.body.publish ? (before.publishedAt || new Date()) : null
    const after = await prisma.$transaction(async (tx) => {
      const updated = await tx.examinationNotice.update({ where: { id: before.id }, data: { ...data, updatedAt: new Date() } })
      await writeAudit(tx, { actorId: req.auth.id, action: 'EXAM_NOTICE_UPDATED', entityType: 'ExaminationNotice', entityId: updated.id, previousData: before, newData: updated })
      if (before.venue !== updated.venue && updated.publishedAt) { const students = await tx.user.findMany({ where: { role: 'STUDENT', isDemo: actor.isDemo, ...audienceWhere(updated) }, select: { id: true } }); await notifyUsers(tx, students.map((item) => item.id), 'VENUE_CHANGE', 'Examination venue changed', updated.title + ': venue changed to ' + (updated.venue || 'to be announced') + '.', { examinationNoticeId: updated.id }) }
      return updated
    })
    res.json({ notice: after })
  } catch (error) { next(error) }
})
router.delete('/examinations/:id', allowRoles('ADMIN'), async (req, res, next) => {
  try { const actor = await currentUser(req); const before = await prisma.examinationNotice.findFirst({ where: { id: req.params.id, isDemo: actor.isDemo } }); if (!before) return res.status(404).json({ error: 'Notice not found.' }); await prisma.$transaction(async (tx) => { await writeAudit(tx, { actorId: req.auth.id, action: 'EXAM_NOTICE_DELETED', entityType: 'ExaminationNotice', entityId: before.id, previousData: before }); await tx.examinationNotice.delete({ where: { id: before.id } }) }); res.status(204).end() } catch (error) { next(error) }
})
router.get('/announcements', async (req, res, next) => {
  try { const user = await currentUser(req); const where = { isDemo: user.isDemo, ...(req.auth.role === 'ADMIN' ? {} : { publishedAt: { not: null }, ...(req.auth.role === 'STUDENT' ? audienceWhere(user) : {}) }) }; if (req.query.category) where.category = String(req.query.category); res.json({ announcements: await prisma.announcement.findMany({ where, orderBy: { publishedAt: 'desc' } }) }) } catch (error) { next(error) }
})
router.post('/announcements', allowRoles('ADMIN'), async (req, res, next) => {
  try {
    const actor = await currentUser(req)
    const { title, body, category, branch, year, semester, section, publish = true } = req.body || {}
    if (!String(title || '').trim() || !String(body || '').trim() || !String(category || '').trim()) return res.status(400).json({ error: 'Title, body and category are required.' })
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.announcement.create({ data: { title: String(title).trim(), body: String(body).trim(), category: String(category).trim(), branch: branch || null, year: year ? Number(year) : null, semester: semester ? Number(semester) : null, section: section || null, publishedAt: publish ? new Date() : null, createdById: req.auth.id, isDemo: actor.isDemo } })
      await writeAudit(tx, { actorId: req.auth.id, action: 'ANNOUNCEMENT_CREATED', entityType: 'Announcement', entityId: created.id, newData: created })
      if (publish) { const students = await tx.user.findMany({ where: { role: 'STUDENT', isDemo: actor.isDemo, ...audienceWhere(created) }, select: { id: true } }); await notifyUsers(tx, students.map((row) => row.id), 'NOTICE_PUBLISHED', created.title, 'A new campus announcement has been published.') }
      return created
    })
    res.status(201).json({ announcement: item })
  } catch (error) { next(error) }
})
router.put('/announcements/:id', allowRoles('ADMIN'), async (req, res, next) => {
  try {
    const actor = await currentUser(req)
    const before = await prisma.announcement.findFirst({ where: { id: req.params.id, isDemo: actor.isDemo } })
    if (!before) return res.status(404).json({ error: 'Announcement not found.' })
    const data = { ...req.body }; delete data.id; delete data.createdById; delete data.isDemo; delete data.publish
    if (typeof req.body?.publish === 'boolean') data.publishedAt = req.body.publish ? (before.publishedAt || new Date()) : null
    const after = await prisma.$transaction(async (tx) => { const updated = await tx.announcement.update({ where: { id: before.id }, data }); await writeAudit(tx, { actorId: req.auth.id, action: 'ANNOUNCEMENT_UPDATED', entityType: 'Announcement', entityId: updated.id, previousData: before, newData: updated }); if (!before.publishedAt && updated.publishedAt) { const students = await tx.user.findMany({ where: { role: 'STUDENT', isDemo: actor.isDemo, ...audienceWhere(updated) }, select: { id: true } }); await notifyUsers(tx, students.map((row) => row.id), 'NOTICE_PUBLISHED', updated.title, 'A new campus announcement has been published.') } return updated })
    res.json({ announcement: after })
  } catch (error) { next(error) }
})
router.delete('/announcements/:id', allowRoles('ADMIN'), async (req, res, next) => {
  try { const actor = await currentUser(req); const before = await prisma.announcement.findFirst({ where: { id: req.params.id, isDemo: actor.isDemo } }); if (!before) return res.status(404).json({ error: 'Announcement not found.' }); await prisma.$transaction(async (tx) => { await writeAudit(tx, { actorId: req.auth.id, action: 'ANNOUNCEMENT_DELETED', entityType: 'Announcement', entityId: before.id, previousData: before }); await tx.announcement.delete({ where: { id: before.id } }) }); res.status(204).end() } catch (error) { next(error) }
})
router.get('/notifications', async (req, res, next) => { try { res.json({ notifications: await prisma.notification.findMany({ where: { userId: req.auth.id }, orderBy: { createdAt: 'desc' }, take: 100 }) }) } catch (error) { next(error) } })
router.patch('/notifications/:id/read', async (req, res, next) => { try { const item = await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.auth.id }, data: { isRead: true } }); if (!item.count) return res.status(404).json({ error: 'Notification not found.' }); res.json({ message: 'Notification marked as read.' }) } catch (error) { next(error) } })

router.get('/admin/catalog', async (_req, res, next) => {
  try {
    const user = await currentUser(_req)
    const [buildings, rooms, schedule, announcements, examinations, setting] = await Promise.all([
      prisma.building.findMany({ where: { isActive: true, isDemo: user.isDemo }, include: { floors: { orderBy: { sortOrder: 'asc' } } } }),
      prisma.room.findMany({ where: { isActive: true, isDemo: user.isDemo, building: { isActive: true, isDemo: user.isDemo } }, include: { building: true, floor: true } }),
      prisma.academicSchedule.findMany({ where: { isDemo: user.isDemo, ...(req.auth.role === 'STUDENT' ? audienceWhere(user) : {}) }, include: { subject: true, room: true, creator: { select: { name: true } }, faculty: { select: { name: true } } } }),
      prisma.announcement.findMany({ where: { isDemo: user.isDemo, ...(req.auth.role === 'ADMIN' ? {} : { publishedAt: { not: null }, ...(req.auth.role === 'STUDENT' ? audienceWhere(user) : {}) }) } }),
      prisma.examinationNotice.findMany({ where: { isDemo: user.isDemo, ...(req.auth.role === 'ADMIN' ? {} : { publishedAt: { not: null }, ...audienceWhere(user) }) } }),
      prisma.siteSetting.findUnique({ where: { key: 'campus' } }),
    ])
    res.json({ catalog: { buildings, rooms, schedule, announcements, examinations, settings: setting?.value, demoMode: user.isDemo } })
  } catch (error) { next(error) }
})

router.put('/admin/catalog/:collection', allowRoles('ADMIN'), async (req, res, next) => {
  try {
    const actor = await currentUser(req)
    const { collection } = req.params
    const value = req.body?.value
    const result = await prisma.$transaction(async (tx) => {
      if (collection === 'settings') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail(400, 'Settings must be an object.')
        const before = await tx.siteSetting.findUnique({ where: { key: 'campus' } })
        const after = await tx.siteSetting.upsert({ where: { key: 'campus' }, update: { value }, create: { key: 'campus', value } })
        await writeAudit(tx, { actorId: req.auth.id, action: 'SITE_SETTINGS_UPDATED', entityType: 'SiteSetting', entityId: 'campus', previousData: before, newData: after })
        return
      }
      if (!Array.isArray(value)) throw fail(400, 'The selected catalog section must be an array.')
      if (collection === 'buildings') {
        const previous = await tx.building.findMany({ where: { isDemo: actor.isDemo } })
        const retained = new Set()
        for (const item of value) {
          const name = String(item?.name || '').trim()
          const code = String(item?.shortName || item?.id || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '')
          if (!name || !code) throw fail(400, 'Every building needs a name and short code.')
          const existing = previous.find((row) => row.code.toLowerCase() === String(item.id || '').toLowerCase()) || previous.find((row) => row.code === code)
          const building = existing
            ? await tx.building.update({ where: { id: existing.id }, data: { code, name, description: item.subtitle || null, isActive: true } })
            : await tx.building.create({ data: { code, name, description: item.subtitle || null, isDemo: actor.isDemo } })
          retained.add(building.id)
          for (const [index, sourceFloor] of (item.floors || []).entries()) {
            const floorName = typeof sourceFloor === 'string' ? sourceFloor : sourceFloor.name
            if (!floorName) continue
            await tx.floor.upsert({ where: { buildingId_name: { buildingId: building.id, name: floorName } }, update: { sortOrder: index }, create: { buildingId: building.id, name: floorName, sortOrder: index } })
          }
          await writeAudit(tx, { actorId: req.auth.id, action: existing ? 'BUILDING_UPDATED' : 'BUILDING_CREATED', entityType: 'Building', entityId: building.id, previousData: existing, newData: building })
        }
        for (const building of previous) if (!retained.has(building.id) && building.isActive) await tx.building.update({ where: { id: building.id }, data: { isActive: false } })
        return
      }
      if (collection === 'rooms') {
        const previous = await tx.room.findMany({ where: { isDemo: actor.isDemo } })
        const retained = new Set()
        for (const item of value) {
          const buildingCode = String(item?.building || '').trim()
          const name = String(item?.name || '').trim()
          const code = String(item?.code || item?.name || '').trim()
          const status = String(item?.status || 'available').toLowerCase()
          const capacity = item?.capacity === '' || item?.capacity == null ? null : Number(item.capacity)
          if (!name || !buildingCode || !['available', 'occupied', 'reserved', 'maintenance'].includes(status) || (capacity !== null && (!Number.isInteger(capacity) || capacity < 1))) throw fail(400, 'Rooms need a name, building, valid status, and a positive capacity or blank capacity.')
          const building = await tx.building.findFirst({ where: { isDemo: actor.isDemo, code: { equals: buildingCode, mode: 'insensitive' }, isActive: true } })
          if (!building) throw fail(400, `Building “${buildingCode}” does not exist.`)
          const floorName = String(item.floor || '').trim()
          const floor = floorName ? await tx.floor.upsert({ where: { buildingId_name: { buildingId: building.id, name: floorName } }, update: {}, create: { buildingId: building.id, name: floorName } }) : null
          const existing = item.id ? previous.find((row) => row.id === item.id) : previous.find((row) => row.buildingId === building.id && row.code === code)
          const data = { buildingId: building.id, floorId: floor?.id || null, code, name, roomType: item.roomType || (floorName.toLowerCase().includes('facilit') ? 'facility' : 'classroom'), status, capacity, isActive: true }
          const room = existing ? await tx.room.update({ where: { id: existing.id }, data }) : await tx.room.create({ data: { ...data, isDemo: actor.isDemo } })
          retained.add(room.id)
          await writeAudit(tx, { actorId: req.auth.id, action: existing ? 'ROOM_UPDATED' : 'ROOM_CREATED', entityType: 'Room', entityId: room.id, previousData: existing, newData: room })
        }
        for (const room of previous) if (!retained.has(room.id) && room.isActive) await tx.room.update({ where: { id: room.id }, data: { isActive: false } })
        return
      }
      if (collection === 'schedule') {
        const previous = await tx.academicSchedule.findMany({ where: { isDemo: actor.isDemo }, include: { subject: true, room: true } })
        const retained = new Set()
        for (const item of value) {
          const subjectName = String(item?.subject || '').trim()
          const roomName = String(item?.room || '').trim()
          const date = String(item?.date || '')
          const [from, to] = String(item?.time || '').split(' – ')
          if (!subjectName || !roomName || !isoDay(date) || !from || !to) throw fail(400, 'Schedule entries need a subject, room, date and valid time range.')
          const start = new Date(`${date}T${from}:00+05:30`)
          const end = new Date(`${date}T${to}:00+05:30`)
          if (Number.isNaN(+start) || Number.isNaN(+end) || end <= start) throw fail(400, 'Schedule end time must be after its start time.')
          const branch = String(item.branch || '').split(' · ')[0].trim() || null
          const semester = Number(item.branch?.match(/Semester\s+(\d+)/i)?.[1]) || null
          const buildingCode = String(item.building || '').trim()
          const room = await tx.room.findFirst({ where: { isDemo: actor.isDemo, isActive: true, code: roomName, ...(buildingCode ? { building: { code: { equals: buildingCode, mode: 'insensitive' } } } : {}) } })
          if (!room) throw fail(400, `Room “${roomName}” does not exist in this dataset.`)
          const subject = await tx.subject.findFirst({ where: { name: subjectName, branch, isDemo: actor.isDemo } }) || await tx.subject.create({ data: { name: subjectName, branch, semester, isDemo: actor.isDemo } })
          const existing = item.id ? previous.find((row) => row.id === item.id) : null
          const conflict = await tx.academicSchedule.findFirst({ where: { isDemo: actor.isDemo, roomId: room.id, ...(existing ? { id: { not: existing.id } } : {}), startsAt: { lt: end }, endsAt: { gt: start } } })
          const booked = await tx.booking.findFirst({ where: { isDemo: actor.isDemo, roomId: room.id, status: { in: ['PENDING', 'APPROVED'] }, startAt: { lt: end }, endAt: { gt: start } } })
          if (conflict || booked) throw fail(409, `Room “${roomName}” is already allocated for that time.`)
          const faculty = item.faculty ? await tx.user.findFirst({ where: { role: 'FACULTY', isDemo: actor.isDemo, name: String(item.faculty).trim() }, select: { id: true } }) : null
          const data = { subjectId: subject.id, roomId: room.id, facultyId: faculty?.id || null, branch, semester, startsAt: start, endsAt: end, createdById: req.auth.id, isDemo: actor.isDemo }
          const schedule = existing ? await tx.academicSchedule.update({ where: { id: existing.id }, data }) : await tx.academicSchedule.create({ data })
          retained.add(schedule.id)
          const affected = await tx.user.findMany({ where: { role: 'STUDENT', isDemo: actor.isDemo, ...audienceWhere(schedule) }, select: { id: true } })
          await notifyUsers(tx, affected.map((student) => student.id), 'SCHEDULE_CHANGE', 'Academic schedule updated', `${subjectName} schedule was updated.`, { scheduleId: schedule.id })
          await writeAudit(tx, { actorId: req.auth.id, action: existing ? 'SCHEDULE_UPDATED' : 'SCHEDULE_CREATED', entityType: 'AcademicSchedule', entityId: schedule.id, previousData: existing, newData: schedule })
        }
        for (const schedule of previous) if (!retained.has(schedule.id)) {
          await writeAudit(tx, { actorId: req.auth.id, action: 'SCHEDULE_DELETED', entityType: 'AcademicSchedule', entityId: schedule.id, previousData: schedule })
          await tx.academicSchedule.delete({ where: { id: schedule.id } })
        }
        return
      }
      if (collection === 'announcements') {
        const previousAnnouncements = await tx.announcement.findMany({ where: { isDemo: actor.isDemo } })
        const previousExaminations = await tx.examinationNotice.findMany({ where: { isDemo: actor.isDemo } })
        const retainedAnnouncements = new Set()
        const retainedExaminations = new Set()
        for (const item of value) {
          const title = String(item?.title || '').trim()
          if (!title) throw fail(400, 'Notices need a title.')
          if (item.kind === 'examination' || item.category === 'Examination') {
            const existing = item.id ? previousExaminations.find((row) => row.id === item.id) : null
            const parsedDate = item.examDate || (item.date ? new Date(item.date) : null)
            const data = { title, body: String(item.body || item.description || title), examDate: parsedDate && !Number.isNaN(+new Date(parsedDate)) ? new Date(parsedDate) : null, venue: item.venue || null, branch: item.branch || null, semester: item.semester ? Number(item.semester) : null, section: item.section || null, publishedAt: item.status === 'Draft' ? null : (existing?.publishedAt || new Date()), createdById: req.auth.id, isDemo: actor.isDemo }
            const notice = existing ? await tx.examinationNotice.update({ where: { id: existing.id }, data }) : await tx.examinationNotice.create({ data })
            retainedExaminations.add(notice.id)
            await writeAudit(tx, { actorId: req.auth.id, action: existing ? 'EXAM_NOTICE_UPDATED' : 'EXAM_NOTICE_CREATED', entityType: 'ExaminationNotice', entityId: notice.id, previousData: existing, newData: notice })
            if (existing && existing.venue !== notice.venue) {
              const students = await tx.user.findMany({ where: { role: 'STUDENT', ...audienceWhere(notice), isDemo: actor.isDemo }, select: { id: true } })
              await notifyUsers(tx, students.map((student) => student.id), 'VENUE_CHANGE', 'Examination venue changed', `${notice.title}: venue changed to ${notice.venue || 'to be announced'}.`, { examinationNoticeId: notice.id })
            }
            continue
          }
          const category = String(item.category || 'Academic').trim()
          const existing = item.id ? previousAnnouncements.find((row) => row.id === item.id) : null
          const data = { title, body: String(item.body || item.description || title), category, publishedAt: item.status === 'Draft' ? null : (existing?.publishedAt || new Date()), branch: item.branch || null, year: item.year ? Number(item.year) : null, semester: item.semester ? Number(item.semester) : null, section: item.section || null, createdById: req.auth.id, isDemo: actor.isDemo }
          const announcement = existing ? await tx.announcement.update({ where: { id: existing.id }, data }) : await tx.announcement.create({ data })
          retainedAnnouncements.add(announcement.id)
          await writeAudit(tx, { actorId: req.auth.id, action: existing ? 'ANNOUNCEMENT_UPDATED' : 'ANNOUNCEMENT_CREATED', entityType: 'Announcement', entityId: announcement.id, previousData: existing, newData: announcement })
          if (!existing && announcement.publishedAt) { const students = await tx.user.findMany({ where: { role: 'STUDENT', isDemo: actor.isDemo, ...audienceWhere(announcement) }, select: { id: true } }); await notifyUsers(tx, students.map((student) => student.id), 'NOTICE_PUBLISHED', announcement.title, 'A new campus announcement has been published.') }
        }
        for (const old of previousAnnouncements) if (!retainedAnnouncements.has(old.id)) { await writeAudit(tx, { actorId: req.auth.id, action: 'ANNOUNCEMENT_DELETED', entityType: 'Announcement', entityId: old.id, previousData: old }); await tx.announcement.delete({ where: { id: old.id } }) }
        for (const old of previousExaminations) if (!retainedExaminations.has(old.id)) { await writeAudit(tx, { actorId: req.auth.id, action: 'EXAM_NOTICE_DELETED', entityType: 'ExaminationNotice', entityId: old.id, previousData: old }); await tx.examinationNotice.delete({ where: { id: old.id } }) }
        return
      }
      throw fail(404, 'This catalog section is not editable in the database.')
    }, { isolationLevel: 'Serializable' })
    res.json({ message: `${collection} changes saved to PostgreSQL.` })
  } catch (error) { next(error) }
})

router.get('/admin/audit', allowRoles('ADMIN'), async (req, res, next) => {
  try { res.json({ auditLogs: await prisma.auditLog.findMany({ where: { actor: { isDemo: req.auth.isDemo } }, include: { actor: { select: { id: true, name: true, email: true, role: true } } }, orderBy: { createdAt: 'desc' }, take: 250 }) }) } catch (error) { next(error) }
})

router.get('/admin/users', allowRoles('ADMIN'), async (req, res, next) => {
  try { res.json({ users: await prisma.user.findMany({ where: { isDemo: req.auth.isDemo }, select: { id: true, email: true, name: true, role: true, branch: true, year: true, semester: true, section: true, isActive: true, isDemo: true, createdAt: true }, orderBy: { name: 'asc' } }) }) } catch (error) { next(error) }
})

router.post('/admin/users', allowRoles('ADMIN'), async (req, res, next) => {
  try {
    const actor = await currentUser(req)
    const { email, name, role, password, branch, year, semester, section } = req.body || {}
    const normalizedEmail = String(email || '').trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || !String(name || '').trim() || String(name).length > 140 || !['STUDENT', 'FACULTY', 'ADMIN'].includes(role) || String(password || '').length < 10 || String(password).length > 128) return res.status(400).json({ error: 'Provide a valid email, name, role and password of at least 10 characters.' })
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { email: normalizedEmail, name: String(name).trim(), role, passwordHash: await bcrypt.hash(password, 12), branch: branch || null, year: year ? Number(year) : null, semester: semester ? Number(semester) : null, section: section || null, isDemo: actor.isDemo }, select: { id: true, email: true, name: true, role: true, branch: true, year: true, semester: true, section: true, isActive: true, isDemo: true, createdAt: true } })
      await writeAudit(tx, { actorId: req.auth.id, action: 'USER_CREATED', entityType: 'User', entityId: created.id, newData: created })
      return created
    })
    res.status(201).json({ user })
  } catch (error) { if (error.code === 'P2002') return res.status(409).json({ error: 'An account with this email already exists.' }); next(error) }
})

router.patch('/admin/users/:id', allowRoles('ADMIN'), async (req, res, next) => {
  try {
    const actor = await currentUser(req)
    const before = await prisma.user.findFirst({ where: { id: req.params.id, isDemo: actor.isDemo } })
    if (!before) return res.status(404).json({ error: 'User not found.' })
    const { name, role, branch, year, semester, section, isActive } = req.body || {}
    if (role !== undefined && !['STUDENT', 'FACULTY', 'ADMIN'].includes(role)) return res.status(400).json({ error: 'Choose a valid account role.' })
    if (name !== undefined && (!String(name).trim() || String(name).length > 140)) return res.status(400).json({ error: 'Name is required and must be at most 140 characters.' })
    const after = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: before.id }, data: { ...(name !== undefined ? { name: String(name).trim() } : {}), ...(role !== undefined ? { role } : {}), ...(branch !== undefined ? { branch: branch || null } : {}), ...(year !== undefined ? { year: year ? Number(year) : null } : {}), ...(semester !== undefined ? { semester: semester ? Number(semester) : null } : {}), ...(section !== undefined ? { section: section || null } : {}), ...(typeof isActive === 'boolean' ? { isActive } : {}) }, select: { id: true, email: true, name: true, role: true, branch: true, year: true, semester: true, section: true, isActive: true, isDemo: true, createdAt: true } })
      await writeAudit(tx, { actorId: req.auth.id, action: 'USER_UPDATED', entityType: 'User', entityId: updated.id, previousData: { ...before, passwordHash: undefined }, newData: updated })
      return updated
    })
    res.json({ user: after })
  } catch (error) { next(error) }
})

router.post('/admin/rooms', allowRoles('ADMIN'), async (req, res, next) => {
  try { const actor = await currentUser(req); const { buildingId, floorId, code, name, roomType = 'classroom', status = 'available', capacity = null } = req.body || {}; if (!buildingId || !code || !name || !['available', 'occupied', 'reserved', 'maintenance'].includes(status) || (capacity !== null && (!Number.isInteger(capacity) || capacity < 1))) return res.status(400).json({ error: 'Building, code, valid status and name are required. Capacity must be a positive integer or null.' }); const room = await prisma.$transaction(async (tx) => { const building = await tx.building.findFirst({ where: { id: buildingId, isDemo: actor.isDemo, isActive: true } }); if (!building) throw fail(404, 'Building not found in this data set.'); if (floorId && !(await tx.floor.findFirst({ where: { id: floorId, buildingId } }))) throw fail(400, 'Floor must belong to the selected building.'); const created = await tx.room.create({ data: { buildingId, floorId: floorId || null, code, name, roomType, status, capacity, isDemo: actor.isDemo } }); await writeAudit(tx, { actorId: req.auth.id, action: 'ROOM_CREATED', entityType: 'Room', entityId: created.id, newData: created }); return created }); res.status(201).json({ room }) } catch (error) { next(error) }
})
router.patch('/admin/rooms/:id', allowRoles('ADMIN'), async (req, res, next) => {
  try { const actor = await currentUser(req); const before = await prisma.room.findFirst({ where: { id: req.params.id, isDemo: actor.isDemo } }); if (!before) return res.status(404).json({ error: 'Room not found.' }); const data = { ...req.body }; if (data.capacity === '') data.capacity = null; if (data.capacity !== undefined && data.capacity !== null && (!Number.isInteger(data.capacity) || data.capacity < 1)) return res.status(400).json({ error: 'Capacity must be a positive integer or null.' }); if (data.status !== undefined && !['available', 'occupied', 'reserved', 'maintenance'].includes(data.status)) return res.status(400).json({ error: 'Choose a valid room status.' }); delete data.isDemo; const after = await prisma.$transaction(async (tx) => { const targetBuildingId = data.buildingId || before.buildingId; if (data.buildingId && !(await tx.building.findFirst({ where: { id: targetBuildingId, isDemo: actor.isDemo, isActive: true } }))) throw fail(404, 'Building not found in this data set.'); if (data.floorId && !(await tx.floor.findFirst({ where: { id: data.floorId, buildingId: targetBuildingId } }))) throw fail(400, 'Floor must belong to the selected building.'); const updated = await tx.room.update({ where: { id: before.id }, data }); await writeAudit(tx, { actorId: req.auth.id, action: 'ROOM_UPDATED', entityType: 'Room', entityId: updated.id, previousData: before, newData: updated }); return updated }); res.json({ room: after }) } catch (error) { next(error) }
})
router.delete('/admin/rooms/:id', allowRoles('ADMIN'), async (req, res, next) => {
  try { const actor = await currentUser(req); const before = await prisma.room.findFirst({ where: { id: req.params.id, isDemo: actor.isDemo } }); if (!before) return res.status(404).json({ error: 'Room not found.' }); const after = await prisma.$transaction(async (tx) => { const updated = await tx.room.update({ where: { id: before.id }, data: { isActive: false } }); await writeAudit(tx, { actorId: req.auth.id, action: 'ROOM_DEACTIVATED', entityType: 'Room', entityId: updated.id, previousData: before, newData: updated }); return updated }); res.json({ room: after }) } catch (error) { next(error) }
})

router.use((error, _req, res, _next) => {
  console.error('[CampusIQ database API]', error)
  if (res.headersSent) return
  const status = error.status || (['P2002', 'P2004', 'P2034'].includes(error.code) || error.code === '23P01' ? 409 : error.code === 'P2025' ? 404 : 500)
  res.status(status).json({ error: error.status || error.code ? error.message : 'The database request could not be completed.' })
})

export default router
