require('dotenv').config()

const express = require('express')
const { connectDb } = require('./db')
const {
  startWhatsApp,
  getConnectionStatus,
  getQrPng
} = require('./whatsapp')

const app = express()
const port = Number(process.env.PORT) || 3000

app.get('/health', (_req, res) => {
  const status = getConnectionStatus()
  res.status(200).json({
    ok: true,
    whatsapp: status.connected ? 'connected' : 'disconnected',
    hasQr: status.hasQr,
    groupJid: status.groupJid || null
  })
})

app.get('/qr', async (_req, res) => {
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
  await connectDb()
  console.log('MongoDB connected')

  await startWhatsApp()

  app.listen(port, () => {
    console.log(`HTTP listening on :${port}`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
