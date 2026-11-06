import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma, databaseEnabled } from '../config/database.js'
import { currentUser, requireAuth, signToken } from '../middleware/auth.js'

const router = Router()
const demoPassword = process.env.DEMO_PASSWORD || 'CampusIQ-demo!'
const demoDataDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data')
const demoUsersFile = path.join(demoDataDirectory, 'users.json')
let demoUsersPromise
let demoUserMutation = Promise.resolve()

async function readRegisteredDemoUsers() {
  try { return JSON.parse(await readFile(demoUsersFile, 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return []; throw error }
}

async function saveRegisteredDemoUsers(users) {
  await mkdir(demoDataDirectory, { recursive: true })
  const temporaryFile = `${demoUsersFile}.tmp`
  await writeFile(temporaryFile, `${JSON.stringify(users, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await rename(temporaryFile, demoUsersFile)
}

function demoUsers() {
  if (!demoUsersPromise) demoUsersPromise = Promise.all([
    ['student@campusiq.demo', 'CampusIQ Student', 'STUDENT', 'CSE', 2, 4],
    ['faculty@campusiq.demo', 'CampusIQ Faculty', 'FACULTY', null, null, null],
    ['admin@campusiq.demo', 'CampusIQ Admin', 'ADMIN', null, null, null],
  ].map(async ([email, name, role, branch, year, semester]) => ({
    id: `demo-${role.toLowerCase()}`, email, name, role, branch, year, semester,
    section: role === 'STUDENT' ? 'A' : null, isDemo: true,
    passwordHash: await bcrypt.hash(demoPassword, 10), isActive: true,
  }))).then(async (builtIn) => {
    const registered = await readRegisteredDemoUsers()
    const overrides = new Map(registered.map((item) => [item.id, item]))
    return [...builtIn.map((item) => overrides.get(item.id) || item), ...registered.filter((item) => !builtIn.some((base) => base.id === item.id))]
  })
  return demoUsersPromise
}

function publicUser(user) {
  const { passwordHash, ...safe } = user
  return safe
}

router.post('/register', async (req, res, next) => {
  try {
    if (req.body?.role && req.body.role !== 'STUDENT') return res.status(403).json({ error: 'Self-registration is only available to students.' })
    const email = String(req.body?.email || '').trim().toLowerCase()
    const name = String(req.body?.name || '').trim()
    const password = String(req.body?.password || '')
    if (!/^\S+@\S+\.\S+$/.test(email) || !name || name.length > 140 || password.length < 10 || password.length > 128) {
      return res.status(400).json({ error: 'Provide a valid email, name, and password of at least 10 characters.' })
    }
    if (!databaseEnabled) {
      const registration = demoUserMutation.then(async () => {
        const users = await demoUsers()
        if (users.some((item) => item.email === email)) throw Object.assign(new Error('An account with this email already exists.'), { status: 409 })
        const user = { id: `demo-${randomUUID()}`, email, name, role: 'STUDENT', branch: null, year: null, semester: null, section: null, isDemo: true, isActive: true, passwordHash: await bcrypt.hash(password, 12) }
        const savedUsers = await readRegisteredDemoUsers()
        await saveRegisteredDemoUsers([...savedUsers, user])
        demoUsersPromise = null
        return user
      })
      demoUserMutation = registration.catch(() => undefined)
      const user = await registration
      return res.status(201).json({ user: publicUser(user), token: signToken(user) })
    }
    const user = await prisma.user.create({ data: { email, name, role: 'STUDENT', passwordHash: await bcrypt.hash(password, 12) } })
    res.status(201).json({ user: publicUser(user), token: signToken(user) })
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'An account with this email already exists.' })
    next(error)
  }
})

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' })
    const user = databaseEnabled
      ? await prisma.user.findUnique({ where: { email } })
      : (await demoUsers()).find((item) => item.email === email)
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Email or password is incorrect.' })
    }
    res.json({ user: publicUser(user), token: signToken(user), expiresIn: 28800 })
  } catch (error) { next(error) }
})

router.post('/logout', requireAuth, (_req, res) => res.json({ message: 'Signed out. Remove the bearer token from the client.' }))

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = databaseEnabled ? await currentUser(req) : (await demoUsers()).find((item) => item.id === req.auth.id)
    if (!user?.isActive) return res.status(401).json({ error: 'This account is inactive.' })
    res.json({ user })
  } catch (error) { next(error) }
})

router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    if (!name || name.length > 140) return res.status(400).json({ error: 'Name is required and must be at most 140 characters.' })
    if (!databaseEnabled) {
      const users = await readRegisteredDemoUsers()
      const index = users.findIndex((item) => item.id === req.auth.id)
      const source = (await demoUsers()).find((item) => item.id === req.auth.id)
      if (!source) return res.status(404).json({ error: 'Profile not found.' })
      const updated = { ...source, name }
      if (index === -1) users.push(updated); else users[index] = updated
      await saveRegisteredDemoUsers(users); demoUsersPromise = null
      return res.json({ user: publicUser(updated) })
    }
    const user = await prisma.user.update({ where: { id: req.auth.id }, data: { name }, select: { id: true, email: true, name: true, role: true, branch: true, year: true, semester: true, section: true, isDemo: true } })
    res.json({ user })
  } catch (error) { next(error) }
})

router.patch('/password', requireAuth, async (req, res, next) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '')
    const newPassword = String(req.body?.newPassword || '')
    if (newPassword.length < 10 || newPassword.length > 128) return res.status(400).json({ error: 'New password must be between 10 and 128 characters.' })
    const user = databaseEnabled ? await prisma.user.findUnique({ where: { id: req.auth.id } }) : (await demoUsers()).find((item) => item.id === req.auth.id)
    if (!user || !await bcrypt.compare(currentPassword, user.passwordHash)) return res.status(401).json({ error: 'Current password is incorrect.' })
    const passwordHash = await bcrypt.hash(newPassword, 12)
    if (databaseEnabled) await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })
    else {
      const users = await readRegisteredDemoUsers()
      const index = users.findIndex((item) => item.id === user.id)
      const updated = { ...user, passwordHash }
      if (index === -1) users.push(updated); else users[index] = updated
      await saveRegisteredDemoUsers(users); demoUsersPromise = null
    }
    res.json({ message: 'Password updated. Sign in again on other devices.' })
  } catch (error) { next(error) }
})

export default router
