const { getDb } = require('./db')

const LIST_ID = 'global'

function collection() {
  return getDb().collection('grocery')
}

async function getItems() {
  const doc = await collection().findOne({ _id: LIST_ID })
  return doc?.items || []
}

async function addItems(rawItems) {
  const items = [...new Set(rawItems.map(normalizeItem).filter(Boolean))]
  if (!items.length) {
    return { added: [], items: await getItems() }
  }

  const existing = await getItems()
  const existingSet = new Set(existing.map((i) => i.toLowerCase()))
  const added = items.filter((item) => !existingSet.has(item.toLowerCase()))

  if (added.length) {
    await collection().updateOne(
      { _id: LIST_ID },
      { $addToSet: { items: { $each: added } } },
      { upsert: true }
    )
  }

  return { added, items: await getItems() }
}

async function removeExact(item) {
  const needle = normalizeItem(item)
  if (!needle) return false

  const current = await getItems()
  const match = current.find((i) => i.toLowerCase() === needle.toLowerCase())
  if (!match) return false

  await collection().updateOne({ _id: LIST_ID }, { $pull: { items: match } })
  return match
}

async function removeItem(item) {
  return removeExact(item)
}

function normalizeItem(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

module.exports = {
  getItems,
  addItems,
  removeExact,
  removeItem,
  normalizeItem
}
