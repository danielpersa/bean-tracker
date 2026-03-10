# 🫘 Bean Budget — Setup Guide

Total time: ~15 minutes. All free, no credit card needed.

---

## STEP 1 — Set up the database (Supabase) ~5 min

1. Go to https://supabase.com and click **Start your project** → sign up free
2. Click **New project**, give it a name (e.g. "bean-tracker"), set a password, pick a region close to you
3. Wait ~1 minute for it to provision
4. In the left sidebar, click **SQL Editor**
5. Paste this query and click **Run**:

```sql
CREATE TABLE bean_config (
  id integer PRIMARY KEY,
  activities jsonb NOT NULL DEFAULT '[]',
  daily_budget numeric NOT NULL DEFAULT 100,
  updated_at timestamptz DEFAULT now()
);

-- Enable realtime sync between devices
ALTER TABLE bean_config REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE bean_config;

-- Allow anyone to read/write (it's a private shared tracker, no auth needed)
ALTER TABLE bean_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON bean_config FOR ALL USING (true) WITH CHECK (true);
```

6. Go to **Settings → API** (left sidebar)
7. Copy two values — you'll need them in Step 3:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (long string under "Project API keys")

---

## STEP 2 — Deploy the app (Vercel) ~5 min

1. Go to https://github.com and create a free account if you don't have one
2. Create a **new repository** called `bean-tracker`, set it to Public
3. Upload all the files from this zip into that repository
   - Easiest way: on the repo page, click **Add file → Upload files** and drag the whole folder in
4. Go to https://vercel.com, sign up free (use "Continue with GitHub")
5. Click **Add New Project**, select your `bean-tracker` repo
6. Click **Deploy** — Vercel auto-detects Vite. Don't click anything else yet.
7. It will fail on first deploy (missing env vars) — that's fine, go to next step

---

## STEP 3 — Connect them ~3 min

1. In Vercel, go to your project → **Settings → Environment Variables**
2. Add two variables:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | your Project URL from Step 1 |
| `VITE_SUPABASE_ANON_KEY` | your anon key from Step 1 |

3. Go to **Deployments** → click the three dots on the latest → **Redeploy**
4. Wait ~30 seconds → click **Visit** → your app is live! 🎉

---

## STEP 4 — Install on your phones (optional but recommended)

**iPhone (Safari):**
1. Open your Vercel URL in Safari
2. Tap the Share button (box with arrow) → **Add to Home Screen**
3. Tap **Add** — it appears as an app icon

**Android (Chrome):**
1. Open your Vercel URL in Chrome
2. Tap the three-dot menu → **Add to Home screen**
3. Tap **Add**

Both of you do this and you'll have a real app icon that opens full-screen with no browser chrome.

---

## Your app URL

After deploy, Vercel gives you a URL like:
`https://bean-tracker-yourname.vercel.app`

Share this with your partner — you both use the same URL, same data, synced in real time.

---

## Troubleshooting

**"Could not connect to database"** → Double-check your env vars in Vercel have no spaces, and redeploy

**Data not syncing between devices** → Make sure you ran the full SQL in Step 1 including the realtime lines

**Want a custom domain?** → In Vercel → Settings → Domains, you can add your own for ~$10/year
