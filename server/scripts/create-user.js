import 'dotenv/config'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import bcrypt from 'bcryptjs'
import { databaseEnabled, prisma, disconnectDatabase } from '../config/database.js'

if (!databaseEnabled) throw new Error('Set DATABASE_URL before provisioning a production account.')
const terminal = createInterface({ input: stdin, output: stdout })
try {
  const email = (await terminal.question('Email: ')).trim().toLowerCase()
  const name = (await terminal.question('Full name: ')).trim()
  const role = (await terminal.question('Role (STUDENT, FACULTY, ADMIN): ')).trim().toUpperCase()
  const password = await terminal.question('Password (10–128 characters): ')
  if (!/^\S+@\S+\.\S+$/.test(email) || !name || name.length > 140 || !['STUDENT', 'FACULTY', 'ADMIN'].includes(role) || password.length < 10 || password.length > 128) throw new Error('Enter a valid email, name, role, and password.')
  const user = await prisma.user.create({ data: { email, name, role, passwordHash: await bcrypt.hash(password, 12), isDemo: false }, select: { email: true, name: true, role: true, id: true } })
  console.log('Created account:', user.email, user.role)
} finally { terminal.close(); await disconnectDatabase() }
