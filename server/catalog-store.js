import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { announcements, buildings, rooms, scheduleItems, siteSettings } from '../src/data.js'

const dataDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')
const catalogFile = path.join(dataDirectory, 'catalog.json')
const editableCollections = new Set(['buildings', 'rooms', 'schedule', 'announcements', 'settings'])
let mutationQueue = Promise.resolve()

async function writeCatalog(catalog) {
  const temporaryFile = `${catalogFile}.tmp`
  await writeFile(temporaryFile, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  await rename(temporaryFile, catalogFile)
}

export async function ensureCatalog() {
  await mkdir(dataDirectory, { recursive: true })
  try {
    const stored = JSON.parse(await readFile(catalogFile, 'utf8'))
    const migrated = {
      buildings: stored.buildings || buildings,
      rooms: stored.rooms || rooms,
      schedule: (stored.schedule || scheduleItems).map((item) => ({ ...scheduleItems.find((seed) => seed.subject === item.subject), ...item })),
      announcements: stored.announcements || announcements,
      settings: { ...siteSettings, ...(stored.settings || {}) },
    }
    if (JSON.stringify(stored) !== JSON.stringify(migrated)) await writeCatalog(migrated)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    await writeCatalog({ buildings, rooms, schedule: scheduleItems, announcements, settings: siteSettings })
  }
}

export async function getCatalog() {
  return JSON.parse(await readFile(catalogFile, 'utf8'))
}

function validationError(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

function validateCatalogUpdate(catalog, collection, value) {
  if (!editableCollections.has(collection)) throw validationError('This information section cannot be edited.')
  if (collection === 'settings') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw validationError('Settings must be an object.')
    const required = ['university', 'institute', 'location', 'productName', 'tagline', 'academicTerm', 'displayName', 'role']
    for (const field of required) {
      if (typeof value[field] !== 'string' || !value[field].trim()) throw validationError(`${field} is required.`)
      if (value[field].length > 140) throw validationError(`${field} must be 140 characters or fewer.`)
    }
    return
  }

  if (!Array.isArray(value)) throw validationError(`${collection} must be an array.`)
  if (value.length > 500) throw validationError(`${collection} is limited to 500 records.`)

  if (collection === 'buildings') {
    if (!value.length) throw validationError('Keep at least one building in the campus directory.')
    if (value.some((item) => !item.id?.trim() || !item.name?.trim() || !item.shortName?.trim() || !item.subtitle?.trim())) {
      throw validationError('Each building needs an ID, name, short name, and subtitle.')
    }
    if (new Set(value.map((item) => item.id)).size !== value.length) throw validationError('Building IDs must be unique.')
    const buildingIds = new Set(value.map((item) => item.id))
    if (catalog.rooms.some((room) => !buildingIds.has(room.building))) {
      throw validationError('Move or delete rooms from a building before removing that building.')
    }
  }

  if (collection === 'rooms') {
    if (value.some((item) => !item.name?.trim() || !item.building?.trim() || !item.floor?.trim() || !['available', 'occupied', 'reserved', 'maintenance'].includes(item.status))) {
      throw validationError('Each space needs a name, building, floor, and valid status.')
    }
    if (new Set(value.map((item) => item.name)).size !== value.length) throw validationError('Space names must be unique.')
    const buildingIds = new Set(catalog.buildings.map((building) => building.id))
    if (value.some((room) => !buildingIds.has(room.building))) throw validationError('Every space must belong to an existing building.')
    if (value.some((room) => room.capacity !== null && room.capacity !== '' && (!Number.isFinite(Number(room.capacity)) || Number(room.capacity) < 1))) {
      throw validationError('Capacity must be a positive number or left blank.')
    }
    const roomNames = new Set(value.map((room) => room.name))
    if (catalog.schedule.some((item) => !roomNames.has(item.room))) throw validationError('Update schedule entries before removing or renaming their rooms.')
  }

  if (collection === 'schedule') {
    if (value.some((item) => !item.subject?.trim() || !item.faculty?.trim() || !item.room?.trim() || !item.date?.trim() || !item.time?.trim() || !item.branch?.trim())) {
      throw validationError('Each schedule entry needs a subject, faculty member, room, date, time, and branch or section.')
    }
    const roomNames = new Set(catalog.rooms.map((room) => room.name))
    if (value.some((item) => !roomNames.has(item.room))) throw validationError('Update schedule entries before removing or renaming their rooms.')
  }

  if (collection === 'announcements') {
    if (value.some((item) => !item.title?.trim() || !item.category?.trim() || !item.date?.trim() || !item.status?.trim())) {
      throw validationError('Each announcement needs a title, category, date, and status.')
    }
  }
}

function syncBuildingFloors(buildingsList, roomsList) {
  return buildingsList.map((building) => {
    const previousOrder = building.floors.map((floor) => floor.name)
    const groupedRooms = new Map()
    for (const room of roomsList.filter((item) => item.building === building.id)) {
      if (!groupedRooms.has(room.floor)) groupedRooms.set(room.floor, [])
      groupedRooms.get(room.floor).push(room.name)
    }
    const names = [...groupedRooms.keys()].sort((a, b) => {
      const aIndex = previousOrder.indexOf(a)
      const bIndex = previousOrder.indexOf(b)
      if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
      return a.localeCompare(b)
    })
    return { ...building, floors: names.map((name) => ({ name, rooms: groupedRooms.get(name) })) }
  })
}

export async function saveCatalogCollection(collection, value) {
  const result = mutationQueue.then(async () => {
    const catalog = await getCatalog()
    validateCatalogUpdate(catalog, collection, value)
    if (collection === 'settings') {
      catalog.settings = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, item.trim()]))
    } else {
      catalog[collection] = collection === 'buildings'
        ? value.map((building) => ({ ...building, floors: Array.isArray(building.floors) ? building.floors : [] }))
        : value
      if (collection === 'rooms') catalog.buildings = syncBuildingFloors(catalog.buildings, value)
    }
    await writeCatalog(catalog)
    return catalog
  })
  mutationQueue = result.catch(() => undefined)
  return result
}
