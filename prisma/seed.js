import { prisma, disconnectDatabase } from '../server/config/database.js'
import bcrypt from 'bcryptjs'
import { announcements, buildings, rooms, scheduleItems, sampleBookings, siteSettings } from '../src/data.js'

const demoPassword = process.env.DEMO_PASSWORD
if (!demoPassword || demoPassword.length < 10) throw new Error('Set DEMO_PASSWORD (at least 10 characters) before seeding demo users.')

const users = [
  ['student@campusiq.demo', 'CampusIQ Demo Student', 'STUDENT', 'CSE', 2, 4, 'A'],
  ['faculty@campusiq.demo', 'CampusIQ Demo Faculty', 'FACULTY', null, null, null, null],
  ['admin@campusiq.demo', 'CampusIQ Demo Admin', 'ADMIN', null, null, null, null],
]

async function main() {
  const passwordHash = await bcrypt.hash(demoPassword, 12)
  const seededUsers = []
  for (const [email, name, role, branch, year, semester, section] of users) {
    seededUsers.push(await prisma.user.upsert({ where: { email }, update: { name, role, branch, year, semester, section, isDemo: true }, create: { email, name, role, branch, year, semester, section, passwordHash, isDemo: true } }))
  }
  const buildingsByCode = new Map()
  for (const source of buildings) {
    const code = source.id === 'iet' ? 'IET' : 'DEEKSHA'
    const building = await prisma.building.upsert({ where: { isDemo_code: { isDemo: true, code } }, update: { name: source.name, description: source.subtitle, isActive: true }, create: { code, name: source.name, description: source.subtitle, isDemo: true } })
    buildingsByCode.set(source.id, building)
    for (let i = 0; i < source.floors.length; i++) {
      const floorSource = source.floors[i]
      const floor = await prisma.floor.upsert({ where: { buildingId_name: { buildingId: building.id, name: floorSource.name } }, update: { sortOrder: i }, create: { buildingId: building.id, name: floorSource.name, sortOrder: i } })
      for (const roomName of floorSource.rooms) {
        const roomSource = rooms.find((room) => room.name === roomName)
        await prisma.room.upsert({ where: { buildingId_code: { buildingId: building.id, code: roomName } }, update: { name: roomName, floorId: floor.id, roomType: floorSource.name === 'Facilities' ? 'facility' : 'classroom', status: roomSource?.status || 'available', capacity: roomSource?.capacity ?? null, isActive: true, isDemo: true }, create: { buildingId: building.id, floorId: floor.id, code: roomName, name: roomName, roomType: floorSource.name === 'Facilities' ? 'facility' : 'classroom', status: roomSource?.status || 'available', capacity: roomSource?.capacity ?? null, isDemo: true } })
      }
    }
  }
  const demoFaculty = seededUsers.find((user) => user.role === 'FACULTY')
  for (const item of scheduleItems) {
    const roomName = item.room
    const buildingSource = buildings.find((building) => building.floors.some((floor) => floor.rooms.includes(roomName)))
    if (!buildingSource) continue
    const building = buildingsByCode.get(buildingSource.id)
    const room = await prisma.room.findUnique({ where: { buildingId_code: { buildingId: building.id, code: roomName } } })
    if (!room) continue
    const subject = await prisma.subject.findFirst({ where: { name: item.subject, branch: item.branch.split(' · ')[0], isDemo: true } }) || await prisma.subject.create({ data: { name: item.subject, branch: item.branch.split(' · ')[0], semester: Number(item.branch.match(/Semester\s+(\d+)/i)?.[1]) || null, isDemo: true } })
    const [from, to] = item.time.split(' – ')
    const startsAt = new Date(`${item.date}T${from}:00+05:30`)
    const endsAt = new Date(`${item.date}T${to}:00+05:30`)
    const exists = await prisma.academicSchedule.findFirst({ where: { subjectId: subject.id, roomId: room.id, startsAt } })
    if (!exists) await prisma.academicSchedule.create({ data: { subjectId: subject.id, roomId: room.id, facultyId: demoFaculty.id, branch: subject.branch, semester: subject.semester, startsAt, endsAt, createdById: demoFaculty.id, isDemo: true } })
  }
  for (const [index, booking] of sampleBookings.entries()) {
    const buildingSource = buildings.find((building) => building.floors.some((floor) => floor.rooms.includes(booking.room)))
    if (!buildingSource) continue
    const building = buildingsByCode.get(buildingSource.id)
    const room = await prisma.room.findUnique({ where: { buildingId_code: { buildingId: building.id, code: booking.room } } })
    if (!room) continue
    const match = booking.date.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/)
    if (!match) continue
    const month = new Map('Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ').map((name, i) => [name.toLowerCase(), String(i + 1).padStart(2, '0')])).get(match[2].toLowerCase())
    const isoDate = `${match[3]}-${month}-${match[1].padStart(2, '0')}`
    const [from, to] = booking.time.split(' – ')
    const bookingDate = new Date(`${isoDate}T00:00:00Z`)
    const startsAt = new Date(`${isoDate}T${from}:00+05:30`)
    const endsAt = new Date(`${isoDate}T${to}:00+05:30`)
    const exists = await prisma.booking.findFirst({ where: { requesterId: seededUsers[1].id, roomId: room.id, bookingDate, details: booking.purpose } })
    if (!exists) await prisma.booking.create({ data: { requesterId: seededUsers[1].id, roomId: room.id, purpose: 'EVENT', details: booking.purpose, bookingDate, startAt: startsAt, endAt: endsAt, status: booking.status.toUpperCase(), isDemo: true, createdAt: new Date(Date.UTC(2026, 10, 1 + index)) } })
  }
  await prisma.siteSetting.upsert({ where: { key: 'campus' }, update: { value: siteSettings }, create: { key: 'campus', value: siteSettings } })
  for (const notice of announcements) {
    const existing = await prisma.announcement.findFirst({ where: { title: notice.title, isDemo: true } })
    if (!existing) await prisma.announcement.create({ data: { title: notice.title, body: notice.description || notice.title, category: notice.category, publishedAt: new Date(), createdById: seededUsers[2].id, isDemo: true } })
  }
  console.log('Seeded clearly labelled CampusIQ demo users and sample campus data. No capacities were invented.')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => disconnectDatabase())
