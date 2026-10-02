const grocery = require('./grocery')
const { findClosest } = require('./fuzzy')
const pending = require('./pending')

function splitItems(text) {
  return String(text || '')
    .split(/[,|\n|\r]+/)
    .map((part) => grocery.normalizeItem(part))
    .filter(Boolean)
}

function formatList(items) {
  if (!items.length) {
    return 'הרשימה ריקה.'
  }
  return `רשימת קניות:\n${items.map((item, i) => `${i + 1}. ${item}`).join('\n')}`
}

function suggestionText(query, suggestion) {
  return `לא מצאתי "${query}". התכוונת ל"${suggestion}"? כן/לא`
}

async function handleMessage(sender, text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return null

  const pendingCurrent = await pending.peekCurrent(sender)

  if (pendingCurrent && (trimmed === 'כן' || trimmed === 'לא')) {
    return handleConfirmation(sender, trimmed === 'כן')
  }

  if (trimmed === '?') {
    await pending.clearPending(sender)
    const items = await grocery.getItems()
    return formatList(items)
  }

  if (trimmed === 'מחק' || trimmed.startsWith('מחק ') || trimmed.startsWith('מחק\n')) {
    const rest = trimmed === 'מחק' ? '' : trimmed.replace(/^מחק[\s\n\r]+/, '')
    const items = splitItems(rest)
    if (!items.length) {
      return 'כתוב מחק ואז פריטים, למשל: מחק חלב, לחם'
    }
    return handleDelete(sender, items)
  }

  await pending.clearPending(sender)
  const toAdd = splitItems(trimmed)
  if (!toAdd.length) return null

  const { added, items } = await grocery.addItems(toAdd)
  if (!added.length) {
    return `כבר ברשימה.\n\n${formatList(items)}`
  }
  return `נוסף: ${added.join(', ')}\n\n${formatList(items)}`
}

async function handleConfirmation(sender, yes) {
  const popped = await pending.popCurrent(sender)
  if (!popped?.current) {
    return 'אין מחיקה ממתינה.'
  }

  const { current, next } = popped
  const lines = []

  if (yes) {
    const removed = await grocery.removeItem(current.suggestion)
    if (removed) {
      lines.push(`נמחק: ${removed}`)
    } else {
      lines.push(`לא הצלחתי למחוק את "${current.suggestion}" (אולי כבר נמחק).`)
    }
  } else {
    lines.push(`לא מוחק את "${current.suggestion}".`)
  }

  if (next) {
    lines.push(suggestionText(next.query, next.suggestion))
  } else {
    lines.push(formatList(await grocery.getItems()))
  }

  return lines.join('\n\n')
}

async function handleDelete(sender, queries) {
  await pending.clearPending(sender)

  const removed = []
  const notFound = []
  const suggestions = []
  const suggestedItems = new Set()

  for (const query of queries) {
    const exact = await grocery.removeExact(query)
    if (exact) {
      removed.push(exact)
      continue
    }

    const items = (await grocery.getItems()).filter((item) => !suggestedItems.has(item))
    const closest = findClosest(query, items)
    if (closest) {
      suggestions.push({ query, suggestion: closest.item })
      suggestedItems.add(closest.item)
    } else {
      notFound.push(query)
    }
  }

  const lines = []
  if (removed.length) {
    lines.push(`נמחק: ${removed.join(', ')}`)
  }
  if (notFound.length) {
    lines.push(`לא נמצא: ${notFound.join(', ')}`)
  }

  if (suggestions.length) {
    await pending.setPending(sender, suggestions)
    lines.push(suggestionText(suggestions[0].query, suggestions[0].suggestion))
  } else if (!removed.length && !notFound.length) {
    lines.push('לא צוינו פריטים למחיקה.')
  } else if (!suggestions.length) {
    lines.push(formatList(await grocery.getItems()))
  }

  return lines.join('\n\n')
}

module.exports = { handleMessage, splitItems, formatList }
