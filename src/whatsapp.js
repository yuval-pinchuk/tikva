const makeWASocket = require('@whiskeysockets/baileys').default
const {
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
  isJidGroup
} = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const pino = require('pino')
const QRCode = require('qrcode')
const { useMongoAuthState } = require('./authState')
const { handleMessage } = require('./commands')

const logger = pino({ level: 'silent' })

let sock = null
let latestQr = null
let connected = false
let resolvedGroupJid = process.env.GROUP_JID || null
const sentByBot = new Set()
const groupMetaCache = new Map()

function getAllowedNumbers() {
  return new Set(
    String(process.env.ALLOWED_NUMBERS || '')
      .split(',')
      .map((n) => n.replace(/\D/g, ''))
      .filter(Boolean)
  )
}

function digitsFromJid(jid) {
  if (!jid) return ''
  return String(jid).split('@')[0].split(':')[0].replace(/\D/g, '')
}

function extractText(message) {
  if (!message) return null
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.ephemeralMessage?.message?.conversation ||
    message.ephemeralMessage?.message?.extendedTextMessage?.text ||
    message.viewOnceMessage?.message?.conversation ||
    message.viewOnceMessageV2?.message?.conversation ||
    null
  )
}

function getConnectionStatus() {
  return {
    connected,
    hasQr: Boolean(latestQr),
    groupJid: resolvedGroupJid
  }
}

async function getQrPng() {
  if (!latestQr) return null
  return QRCode.toBuffer(latestQr, { type: 'png', width: 320, margin: 2 })
}

async function sendReply(jid, text) {
  if (!sock || !text) return
  const result = await sock.sendMessage(jid, { text })
  if (result?.key?.id) {
    sentByBot.add(result.key.id)
    setTimeout(() => sentByBot.delete(result.key.id), 60_000)
  }
}

async function matchesTargetGroup(jid) {
  if (!isJidGroup(jid)) return false

  if (resolvedGroupJid && jid === resolvedGroupJid) return true

  const configuredJid = process.env.GROUP_JID
  if (configuredJid) {
    return jid === configuredJid
  }

  const groupName = (process.env.GROUP_NAME || 'קניות').trim()
  let meta = groupMetaCache.get(jid)
  if (!meta) {
    try {
      meta = await sock.groupMetadata(jid)
      groupMetaCache.set(jid, meta)
    } catch (err) {
      console.warn('Failed to fetch group metadata', jid, err.message)
      return false
    }
  }

  if (meta?.subject?.trim() === groupName) {
    resolvedGroupJid = jid
    console.log(`Resolved grocery group JID: ${jid} (subject="${meta.subject}")`)
    return true
  }

  return false
}

function numberMatchesAllowlist(digits, allowed) {
  if (!digits) return false
  if (allowed.has(digits)) return true
  // Israel local 0XXXXXXXXX vs 972XXXXXXXXX
  if (digits.startsWith('0') && allowed.has(`972${digits.slice(1)}`)) return true
  if (digits.startsWith('972') && allowed.has(`0${digits.slice(3)}`)) return true
  return false
}

function senderCandidates(msg) {
  // Prefer PN JIDs (participantAlt) over LID JIDs when WhatsApp uses linked IDs
  return [
    msg.key.participantAlt,
    msg.key.remoteJidAlt,
    msg.key.participant,
    msg.participant,
    msg.key.fromMe ? sock?.user?.id : null,
    msg.key.fromMe ? sock?.user?.lid : null
  ].filter(Boolean)
}

function isAllowedSender(msg) {
  const allowed = getAllowedNumbers()
  if (!allowed.size) {
    console.warn('ALLOWED_NUMBERS is empty — allowing all senders in the grocery group')
    return true
  }

  for (const candidate of senderCandidates(msg)) {
    if (numberMatchesAllowlist(digitsFromJid(candidate), allowed)) return true
  }

  return false
}

function resolveSenderId(msg) {
  for (const candidate of senderCandidates(msg)) {
    const digits = digitsFromJid(candidate)
    if (digits) return digits
  }
  return 'unknown'
}

async function handleIncoming(msg) {
  const jid = msg.key.remoteJid
  if (!jid || msg.key.remoteJid === 'status@broadcast') return
  if (msg.key.id && sentByBot.has(msg.key.id)) return

  const isGroup = await matchesTargetGroup(jid)
  if (!isGroup) return

  if (!isAllowedSender(msg)) {
    console.log('Ignored message from non-allowlisted sender', msg.key.participant || msg.key.remoteJid)
    return
  }

  const text = extractText(msg.message)
  if (!text) return

  const sender = resolveSenderId(msg)

  try {
    const reply = await handleMessage(sender, text)
    if (reply) {
      await sendReply(jid, reply)
    }
  } catch (err) {
    console.error('Command handling failed', err)
    await sendReply(jid, 'אירעה שגיאה. נסו שוב.')
  }
}

async function startWhatsApp() {
  const { state, saveCreds } = await useMongoAuthState()
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Tikva Grocery'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    getMessage: async () => undefined
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      latestQr = qr
      connected = false
      console.log('QR updated — open /qr to scan with Linked Devices')
    }

    if (connection === 'open') {
      latestQr = null
      connected = true
      console.log('WhatsApp connected')
    }

    if (connection === 'close') {
      connected = false
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode
      const loggedOut = statusCode === DisconnectReason.loggedOut
      console.log('WhatsApp disconnected', { statusCode, loggedOut })

      if (!loggedOut) {
        setTimeout(() => {
          startWhatsApp().catch((err) => console.error('Reconnect failed', err))
        }, 2000)
      } else {
        latestQr = null
        console.log('Logged out — delete auth docs in Mongo if needed, then rescan /qr')
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' && type !== 'append') return
    for (const msg of messages) {
      await handleIncoming(msg)
    }
  })

  return sock
}

module.exports = {
  startWhatsApp,
  getConnectionStatus,
  getQrPng
}
