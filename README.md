# Tikva — Hebrew WhatsApp grocery bot

Shared grocery list for you and your partner. Runs on Render (free) with Baileys linked to **your personal WhatsApp**, and listens only in a dedicated group (e.g. `קניות`).

## How it works

1. You scan a QR code once (WhatsApp → Linked Devices).
2. Create a private group with **only you and your partner**, named `קניות` (or set `GROUP_NAME` / `GROUP_JID`).
3. Both of you send commands **only in that group**.

| Message | Action |
|---|---|
| `חלב, לחם` or items on separate lines | Add to the shared list |
| `מחק חלב, לחם` | Remove items |
| `?` | Show the list |
| After a close-match suggestion: `כן` / `לא` | Confirm or skip delete |

If a delete target is missing, the bot suggests the closest item and waits for `כן` or `לא`.

## Setup

### 1. MongoDB Atlas (free)

1. Create a free M0 cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Create a database user and allow network access (`0.0.0.0/0` for Render).
3. Copy the connection string into `MONGODB_URI`.

### 2. Local run (optional)

```bash
cp .env.example .env
# edit .env
npm install
npm start
```

Open `http://localhost:3000/qr` and scan with your phone.

### 3. Deploy on Render (free web service)

1. Push this repo to GitHub.
2. Create a **Web Service** on [Render](https://render.com) (or use `render.yaml`).
3. In Render → your service → **Environment**, add the same vars as local `.env` (Render does **not** use the `.env` file):
   - `MONGODB_URI` — Atlas connection string (required)
   - `ALLOWED_NUMBERS` — your numbers, digits only, comma-separated, e.g. `9725XXXXXXXX,9725YYYYYYYY`
   - `GROUP_NAME` — default `קניות` (optional if you set `GROUP_JID`)
   - `GROUP_JID` — optional, e.g. `120363...@g.us` (logged when the group is auto-detected)
   - Then **Manual Deploy** so the new vars apply.
   - In Atlas → **Network Access** → **Add IP Address** → **Allow Access from Anywhere** (`0.0.0.0/0`). Render’s IPs change on the free plan; without this, Mongo often fails with a TLS/SSL error.
   - Do not wrap `MONGODB_URI` in quotes in the Render env UI.
4. After deploy, open `https://YOUR-SERVICE.onrender.com/qr` and scan with **your** WhatsApp → Linked Devices.
5. Create the grocery group, send a test message like `?`.

### 4. Keep Render awake

Render free sleeps after idle time. Create a free monitor (e.g. [cron-job.org](https://cron-job.org) or UptimeRobot) that `GET`s:

`https://YOUR-SERVICE.onrender.com/health`

every 5–10 minutes.

## Notes

- Keep the grocery group for list commands only — other chat will be treated as items to add.
- This uses an unofficial WhatsApp library on your personal account. A spare SIM is safer long-term.
- If you get logged out, open `/qr` again and rescan.
