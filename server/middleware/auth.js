import jwt from 'jsonwebtoken'
import { databaseEnabled, prisma } from '../config/database.js'

const jwtSecret = process.env.JWT_SECRET
if (databaseEnabled && (!jwtSecret || jwtSecret.length < 32)) throw new Error('Set a JWT_SECRET with at least 32 characters before enabling PostgreSQL mode.')
const signingKey = jwtSecret || `demo-only-${process.pid}-${Date.now()}`

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email, name: user.name, branch: user.branch, year: user.year, semester: user.semester, section: user.section, isDemo: user.isDemo || false }, signingKey, { expiresIn: '8h', issuer: 'campusiq' })
}

export function requireAuth(request, response, next) {
  const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return response.status(401).json({ error: 'Sign in to continue.' })
  let payload
  try { payload = jwt.verify(token, signingKey, { issuer: 'campusiq' }) }
  catch { return response.status(401).json({ error: 'Session expired. Sign in again.' }) }
  request.auth = { id: payload.sub, role: payload.role, email: payload.email, name: payload.name, branch: payload.branch, year: payload.year, semester: payload.semester, section: payload.section, isDemo: payload.isDemo || false }
  if (!prisma) return next()
  prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, role: true, email: true, name: true, branch: true, year: true, semester: true, section: true, isDemo: true, isActive: true } })
    .then((user) => {
      if (!user?.isActive) return response.status(401).json({ error: 'This account is inactive. Contact an administrator.' })
      request.auth = { ...user }
      next()
    })
    .catch(next)
}

export function allowRoles(...roles) {
  return (request, response, next) => {
    if (!request.auth) return response.status(401).json({ error: 'Sign in to continue.' })
    if (!roles.includes(request.auth.role)) return response.status(403).json({ error: 'You do not have permission to do this.' })
    next()
  }
}

export async function currentUser(request) {
  if (!prisma) return { ...request.auth, isActive: true }
  return prisma.user.findUnique({ where: { id: request.auth.id }, select: { id: true, email: true, name: true, role: true, branch: true, year: true, semester: true, section: true, isActive: true, isDemo: true } })
}
