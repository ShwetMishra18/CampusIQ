import { prisma } from '../config/database.js'

function jsonValue(value) { return value == null ? null : JSON.parse(JSON.stringify(value)) }

export async function writeAudit(tx, { actorId, action, entityType, entityId, previousData = null, newData = null }) {
  if (!prisma || !actorId) return
  await tx.auditLog.create({ data: { actorId, action, entityType, entityId: String(entityId), previousData: jsonValue(previousData), newData: jsonValue(newData) } })
}

export async function notifyUsers(tx, userIds, type, title, body, links = {}) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return
  await tx.notification.createMany({ data: ids.map((userId) => ({ userId, type, title, body, ...links })) })
}
