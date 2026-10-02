function normalize(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function levenshtein(a, b) {
  const s = normalize(a)
  const t = normalize(b)
  if (s === t) return 0
  if (!s.length) return t.length
  if (!t.length) return s.length

  const prev = new Array(t.length + 1)
  const curr = new Array(t.length + 1)

  for (let j = 0; j <= t.length; j++) prev[j] = j

  for (let i = 1; i <= s.length; i++) {
    curr[0] = i
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= t.length; j++) prev[j] = curr[j]
  }

  return prev[t.length]
}

function findClosest(query, items) {
  const needle = normalize(query)
  if (!needle || !items?.length) return null

  let best = null
  let bestDistance = Infinity

  for (const item of items) {
    const distance = levenshtein(needle, item)
    if (distance < bestDistance) {
      bestDistance = distance
      best = item
    }
  }

  if (!best) return null

  const maxAllowed = Math.max(1, Math.floor(Math.max(needle.length, normalize(best).length) / 2))
  if (bestDistance > maxAllowed) return null

  return { item: best, distance: bestDistance }
}

module.exports = { findClosest, levenshtein, normalize }
