require('dotenv').config({ quiet: true, path: '.env' })

const express = require('express')
const { connectDb, isDbConnected } = require('./db')
const {
  startWhatsApp,
  getConnectionStatus,
  getQrPng,
  resetSession
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

function qrPageHtml(status) {
  const refresh = status.connected ? '' : '<meta http-equiv="refresh" content="5">'
  let body

  if (status.connected) {
    body = `
      <h1>מחובר / Connected</h1>
      <p>WhatsApp already linked. No QR needed.</p>
    `
  } else if (status.hasQr) {
    body = `
      <h1>סרוק את הקוד / Scan QR</h1>
      <p>WhatsApp → Linked Devices → Link a device</p>
      <p><img src="/qr.png?t=${Date.now()}" alt="WhatsApp QR" width="320" height="320" /></p>
      <p>הקוד מתחדש אוטומטית כל כמה שניות.</p>
    `
  } else {
    body = `
      <h1>ממתין לקוד… / Waiting for QR</h1>
      <p>רענון אוטומטי בעוד כמה שניות. אם זה נמשך — נסו <code>POST /reset-session</code>.</p>
    `
  }

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  ${refresh}
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tikva QR</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 28rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    img { display: block; margin: 1rem auto; border: 1px solid #ddd; }
    code { background: #f2f2f2; padding: 0.1rem 0.3rem; }
  </style>
</head>
<body>${body}</body>
</html>`
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

  res.status(200).type('html').send(qrPageHtml(getConnectionStatus()))
})

app.get('/qr.png', async (_req, res) => {
  if (!isDbConnected()) {
    res.status(503).send('Database not connected')
    return
  }

  const png = await getQrPng()
  if (!png) {
    res.status(503).send('QR not ready')
    return
  }

  res.status(200).type('image/png').send(png)
})

app.post('/reset-session', async (req, res) => {
  const expected = process.env.SESSION_RESET_SECRET
  if (!expected) {
    res.status(503).json({
      ok: false,
      message: 'SESSION_RESET_SECRET is not set on this server'
    })
    return
  }

  const provided = req.get('x-reset-secret') || req.query.secret
  if (!provided || provided !== expected) {
    res.status(401).json({ ok: false, message: 'Unauthorized' })
    return
  }

  if (!isDbConnected()) {
    res.status(503).json({ ok: false, message: 'Database not connected' })
    return
  }

  try {
    const result = await resetSession()
    res.status(result.ok ? 200 : 409).json(result)
  } catch (err) {
    console.error('reset-session failed', err)
    res.status(500).json({ ok: false, message: err.message || 'Reset failed' })
  }
})

app.get('/', (_req, res) => {
  res.type('html').send(`
    <h1>Tikva grocery bot</h1>
    <ul>
      <li><a href="/health">/health</a></li>
      <li><a href="/qr">/qr</a> — scan with WhatsApp → Linked Devices</li>
    </ul>
    <p>If linking is stuck, use <code>POST /reset-session</code> with your <code>SESSION_RESET_SECRET</code> (debugging).</p>
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
