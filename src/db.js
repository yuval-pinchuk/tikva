const { MongoClient, ServerApiVersion } = require('mongodb')

let client
let db

function normalizeUri(raw) {
  let uri = String(raw || '').trim()
  // Render/dashboard pastes sometimes include wrapping quotes
  if (
    (uri.startsWith('"') && uri.endsWith('"')) ||
    (uri.startsWith("'") && uri.endsWith("'"))
  ) {
    uri = uri.slice(1, -1)
  }
  return uri.trim()
}

async function connectDb() {
  const uri = normalizeUri(process.env.MONGODB_URI)
  if (!uri) {
    throw new Error('MONGODB_URI is required')
  }

  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true
    },
    // Avoid bad IPv6 paths that often show up as TLS alert 80 on cloud hosts
    family: 4,
    autoSelectFamily: false,
    serverSelectionTimeoutMS: 20000
  })

  try {
    await client.connect()
    await client.db('admin').command({ ping: 1 })
  } catch (err) {
    const hint =
      'Check Atlas Network Access allows 0.0.0.0/0 (or Render outbound IPs), ' +
      'cluster is not paused, and MONGODB_URI password is URL-encoded if it has special characters.'
    throw new Error(`MongoDB connect failed: ${err.message}. ${hint}`)
  }

  db = client.db()
  await db.collection('auth').createIndex({ _id: 1 })
  await db.collection('pending').createIndex({ sender: 1 }, { unique: true })
  return db
}

function getDb() {
  if (!db) {
    throw new Error('Database not connected')
  }
  return db
}

function isDbConnected() {
  return Boolean(db)
}

module.exports = { connectDb, getDb, isDbConnected }
