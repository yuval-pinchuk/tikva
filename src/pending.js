const { getDb } = require('./db')

function collection() {
  return getDb().collection('pending')
}

async function getPending(sender) {
  return collection().findOne({ sender })
}

async function setPending(sender, queue) {
  if (!queue.length) {
    await clearPending(sender)
    return null
  }

  await collection().updateOne(
    { sender },
    { $set: { sender, queue, updatedAt: new Date() } },
    { upsert: true }
  )
  return queue[0]
}

async function clearPending(sender) {
  await collection().deleteOne({ sender })
}

async function popCurrent(sender) {
  const doc = await getPending(sender)
  if (!doc?.queue?.length) return null

  const [current, ...rest] = doc.queue
  await setPending(sender, rest)
  return { current, next: rest[0] || null }
}

async function peekCurrent(sender) {
  const doc = await getPending(sender)
  if (!doc?.queue?.length) return null
  return doc.queue[0]
}

module.exports = {
  getPending,
  setPending,
  clearPending,
  popCurrent,
  peekCurrent
}
