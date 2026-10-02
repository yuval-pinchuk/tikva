require('dotenv').config({ quiet: true, path: '.env' })

const express = require('express')
const { connectDb, isDbConnected } = require('./db')
const {
  startWhatsApp,
  getConnectionStatus,
  getQrPng
} = require('./whatsapp')

const app = express()
const port = Number(process.env.PORT) || 3000

function requireEnv(name) {
  const value = process.env[name]
  if (!value || !String(value).trim()) {
    throw new Error(
      `Missing env var ${name}. On Render: Dashboard → your service → Environment → Add ${name}, then Manual Deploy.`
    )
  }
  return value
}

app.get('/health', (_req, res) => {
  const status = getConnectionStatus()
  res.status(200).json({
    ok: true,
    mongo: isDbConnected() ? 'connected' : 'disconnected',
    whatsapp: status.connected ? 'connected' : 'disconnected',
    hasQr: status.hasQr,
    groupJid: status.groupJid || null
  })
})

app.get('/qr', async (_req, res) => {
  if (!isDbConnected()) {
    res
      .status(503)
      .type('html')
      .send('<h1>Database not connected yet</h1><p>Check Render logs.</p>')
    return
  }

  const status = getConnectionStatus()
  if (status.connected) {
    res
      .status(200)
      .type('html')
      .send('<h1>WhatsApp already connected</h1><p>No QR needed.</p>')
    return
  }

  const png = await getQrPng()
  if (!png) {
    res
      .status(503)
      .type('html')
      .send('<h1>QR not ready yet</h1><p>Refresh in a few seconds.</p>')
    return
  }

  res.status(200).type('image/png').send(png)
})

app.get('/', (_req, res) => {
  res.type('html').send(`
    <h1>Tikva grocery bot</h1>
    <ul>
      <li><a href="/health">/health</a></li>
      <li><a href="/qr">/qr</a> — scan with WhatsApp → Linked Devices</li>
    </ul>
  `)
})

async function main() {
  requireEnv('MONGODB_URI')
  if (!process.env.ALLOWED_NUMBERS) {
    console.warn('ALLOWED_NUMBERS is not set — anyone in the grocery group can use the bot')
  }

  // Bind HTTP first so Render detects an open port
  await new Promise((resolve) => {
    app.listen(port, () => {
      console.log(`HTTP listening on :${port}`)
      resolve()
    })
  })

  await connectDb()
  console.log('MongoDB connected')

  await startWhatsApp()
  console.log('WhatsApp client starting')
}

main().catch((err) => {
  console.error('Startup failed:', err.message || err)
  process.exit(1)
})
