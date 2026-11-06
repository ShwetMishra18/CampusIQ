import { siteSettings } from './data'

const tokenKey = 'campusiq-token'
const demoKey = 'campusiq-user'

function timeLabel(value) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata', hour12: false }).format(new Date(value))
}

function normalizeRoom(item) {
  if (!item || typeof item.building === 'string') return item
  return { ...item, building: item.building?.code?.toLowerCase() || item.buildingId?.toLowerCase(), buildingName: item.building?.name || item.buildingName || item.building?.code || '', floor: item.floor?.name || item.floorName || '', status: item.status || 'available' }
}

function normalizeBooking(item) {
  if (!item.room || typeof item.room === 'string') return item
  const dateISO = String(item.bookingDate).slice(0, 10)
  return { ...item, room: item.room.name, building: item.room.building?.code, purpose: item.details, dateISO, date: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(`${dateISO}T12:00:00+05:30`)), time: `${timeLabel(item.startAt)} – ${timeLabel(item.endAt)}`, status: item.status[0] + item.status.slice(1).toLowerCase(), createdAt: item.createdAt || null }
}

function normalizeCatalog(catalog) {
  if (!catalog.buildings?.some((item) => item.code)) return catalog
  const buildingCode = new Map(catalog.buildings.map((item) => [item.id, item.code]))
  const mappedBuildings = catalog.buildings.map((item) => ({ ...item, id: item.code.toLowerCase(), shortName: item.code, subtitle: item.description || '', floors: item.floors.map((floor) => ({ ...floor, rooms: catalog.rooms.filter((room) => room.floorId === floor.id).map((room) => room.name) })) }))
  const mappedRooms = catalog.rooms.map((item) => ({ ...item, building: buildingCode.get(item.buildingId)?.toLowerCase(), buildingName: item.building?.name || buildingCode.get(item.buildingId), floor: item.floor?.name || '', status: item.status || 'available' }))
  const mappedSchedule = catalog.schedule.map((item) => ({ ...item, subject: item.subject.name, faculty: item.faculty?.name || item.creator?.name || 'Faculty', room: item.room.name, date: String(item.startsAt).slice(0, 10), time: `${timeLabel(item.startsAt)} – ${timeLabel(item.endsAt)}`, branch: [item.branch, item.semester ? `Semester ${item.semester}` : ''].filter(Boolean).join(' · '), color: 'blue' }))
  const mappedAnnouncements = [...catalog.announcements.map((item) => ({ ...item, kind: 'announcement', status: item.publishedAt ? 'Published' : 'Draft' })), ...(catalog.examinations || []).map((item) => ({ ...item, kind: 'examination', category: 'Examination', date: item.examDate ? String(item.examDate).slice(0, 10) : '', status: item.publishedAt ? 'Published' : 'Draft', tone: 'gold' }))].map((item) => ({ ...item, date: item.examDate ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(`${String(item.examDate).slice(0,10)}T12:00:00+05:30`)) : item.publishedAt ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(item.publishedAt)) : item.date, status: item.status || 'Published', tone: item.tone || 'blue' }))
  return { ...catalog, buildings: mappedBuildings, rooms: mappedRooms, schedule: mappedSchedule, announcements: mappedAnnouncements, settings: catalog.settings || siteSettings, demoMode: catalog.demoMode ?? true }
}

async function request(path, options = {}) {
  let response
  const token = globalThis.localStorage?.getItem(tokenKey)
  try {
    response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } })
  } catch {
    throw new Error('The CampusIQ API is offline. Start the app with `npm run dev:all`.')
  }
  const payload = await response.json().catch(() => ({}))
  if (response.status === 401 && token) {
    globalThis.localStorage?.removeItem(tokenKey)
    globalThis.localStorage?.removeItem(demoKey)
    globalThis.dispatchEvent?.(new CustomEvent('campusiq:auth-expired'))
  }
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed with status ${response.status}.`)
    error.status = response.status
    error.alternatives = payload.alternatives || []
    throw error
  }
  return payload
}

export const campusApi = {
  tokenKey,
  readUser: () => { try { return JSON.parse(globalThis.localStorage?.getItem(demoKey) || 'null') } catch { return null } },
  login: async (credentials) => { const result = await request('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) }); globalThis.localStorage?.setItem(tokenKey, result.token); globalThis.localStorage?.setItem(demoKey, JSON.stringify(result.user)); return result },
  register: async (details) => { const result = await request('/api/auth/register', { method: 'POST', body: JSON.stringify(details) }); globalThis.localStorage?.setItem(tokenKey, result.token); globalThis.localStorage?.setItem(demoKey, JSON.stringify(result.user)); return result },
  me: async () => (await request('/api/auth/me')).user,
  logout: async () => { try { await request('/api/auth/logout', { method: 'POST' }) } finally { globalThis.localStorage?.removeItem(tokenKey); globalThis.localStorage?.removeItem(demoKey) } },
  updateProfile: async (value) => { const user = (await request('/api/auth/me', { method: 'PATCH', body: JSON.stringify(value) })).user; globalThis.localStorage?.setItem(demoKey, JSON.stringify(user)); return user },
  changePassword: (value) => request('/api/auth/password', { method: 'PATCH', body: JSON.stringify(value) }),
  health: () => request('/api/health'),
  getCatalog: async () => normalizeCatalog((await request('/api/admin/catalog')).catalog),
  getBuildings: async () => (await request('/api/buildings')).buildings,
  getRooms: async (filters = {}) => (await request(`/api/rooms${new URLSearchParams(Object.entries(filters).filter(([, value]) => value && value !== 'all')).size ? `?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value && value !== 'all'))}` : ''}`)).rooms.map(normalizeRoom),
  getSchedule: async () => (await request('/api/schedule')).schedule,
  getAnnouncements: async () => (await request('/api/announcements')).announcements,
  getBookings: async () => (await request('/api/bookings')).bookings.map(normalizeBooking),
  createBooking: async (booking) => normalizeBooking((await request('/api/bookings', { method: 'POST', body: JSON.stringify(booking) })).booking),
  updateBookingStatus: async (id, status) => normalizeBooking((await request(`/api/bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: status.toUpperCase() }) })).booking),
  cancelBooking: async (id) => normalizeBooking((await request(`/api/bookings/${id}/cancel`, { method: 'PATCH' })).booking),
  rescheduleBooking: async (id, value) => normalizeBooking((await request(`/api/bookings/${id}/reschedule`, { method: 'PATCH', body: JSON.stringify(value) })).booking),
  saveCatalog: async (collection, value) => { await request(`/api/admin/catalog/${collection}`, { method: 'PUT', body: JSON.stringify({ value }) }); return normalizeCatalog((await request('/api/admin/catalog')).catalog) },
  getDashboard: async () => (await request('/api/dashboard')).stats,
  getNotifications: async () => (await request('/api/notifications')).notifications || [],
  markNotificationRead: async (id) => request(`/api/notifications/${id}/read`, { method: 'PATCH' }),
}
