export const databaseEnabled = Boolean(process.env.DATABASE_URL?.trim())
export let prisma = null
if (databaseEnabled) {
  const [{ PrismaClient }, { PrismaPg }] = await Promise.all([import('@prisma/client'), import('@prisma/adapter-pg')])
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
}

export async function disconnectDatabase() {
  if (prisma) await prisma.$disconnect()
}
