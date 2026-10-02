const { MongoClient } = require('mongodb')

let client
let db

async function connectDb() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('MONGODB_URI is required')
  }

  client = new MongoClient(uri)
  await client.connect()
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

module.exports = { connectDb, getDb }
