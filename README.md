# ARISE // Hunter Interface

A single-page health dashboard with **Solo Leveling** "System" styling, driven by your own
**Google Health** data. Recovery, strain and sleep scores are recalculated locally, then fed into a
hunter profile: XP, levels, E→Monarch ranks, attributes, daily/weekly quests, a full Training Grounds
protocol builder, a 14-day Body Log with monthly strength peaks and eighteen unlockable shadows.

No build step. The demo runs by opening `index.html`; live Google Health sync needs an HTTPS origin
(GitHub Pages) or `http://localhost:8080` and a Google account.

---

## Quick start

1. Open `index.html` in a modern desktop browser (Chrome, Edge, Firefox or Safari 16.4+).
   - Windows: double-click the file, or run `Start-Process index.html` from PowerShell.
2. The System boots with an empty archive and shows **"AWAITING SYNC"**.
3. Either:
   - click **LOAD DEMO** to preview 40 days of realistic health data, or
   - publish to GitHub Pages (or serve locally on port 8080), configure Google Health below, then
     click **SYNC GOOGLE HEALTH** to pull up to 40 days of available data.

Everything is stored in `localStorage` under `arise-hunter-system-v1`. Health data is not uploaded
unless you enable optional Firebase Cloud Link. **Google OAuth will not complete from `file://`** —
use GitHub Pages or `http://localhost:8080` for the live link.

If you test locally, serve this folder on exactly port 8080 with any static file server, then visit
`http://localhost:8080`. Register that exact JavaScript origin in the OAuth client.

> **Health archive file import has been removed.** Google Health is the only live source. Backup
> export/restore still works and is the supported way to move an ARISE snapshot between devices.

---

## iPhone via GitHub Pages

The dashboard is an installable web app (PWA). GitHub Pages hosts it over HTTPS, which Safari needs
for home-screen installation, offline caching and Google OAuth.

### Deploy once

1. Create a GitHub repository and push this folder to it.
2. Open the repo → **Settings** → **Pages**.
3. Under **Build and deployment**, choose **GitHub Actions** (recommended — the included
   `.github/workflows/deploy-pages.yml` deploys on every push), or choose **Deploy from a branch** →
   `main` / **root** → **Save**.
4. Wait for the deployment, then copy the Pages URL:
   `https://<username>.github.io/<repo>/`

### Install on iPhone

1. On the iPhone, open that Pages URL in **Safari**. Chrome/Firefox cannot add it the same way.
2. Tap the **Share** button (square with an arrow pointing up).
3. Choose **Add to Home Screen**.
4. Rename it if you want, then tap **Add**.
5. Launch **ARISE** from the home screen. It opens full-screen without Safari's address bar.
6. Use the fixed bottom command deck to switch sections. Tap **MORE** for Quests, Shadow Army and
   Data Link.
7. Pinch and double-tap zoom are disabled in the installed app. Notifications slide in from the right
   edge at mid-screen, so they never cover the bottom command deck.

The first visit needs an internet connection so the app shell can be cached. After that, `sw.js`
serves the dashboard offline. Data is stored per device in Safari's site data unless you enable the
optional Firebase Cloud Link below. Live sync always needs the network.

---

## Google Health live sync

**Data Link → Google Health Uplink** uses Google Identity Services token model: Google returns a
short-lived access token directly to the browser, with no backend, redirect URI or client secret. The
resulting snapshot goes through `SystemData.buildLiveResult()` — the same scoring pipeline as the
demo — so XP, quests, ranks, Training Grounds, Body Log and strength state stay consistent.

### 1. Prepare the Google Cloud project

1. Open **Google Cloud Console → APIs & Services → Library** and enable the **Google Health API**
   for the project that owns your OAuth client.
2. Open **OAuth consent screen** and add all three read scopes:
   - `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`
   - `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`
   - `https://www.googleapis.com/auth/googlehealth.sleep.readonly`
3. If the app is in **Testing**, add your Google account as a **Test user**.
4. Create or open a **Web application** OAuth client. The token model needs the client ID only;
   never put a client secret in this repository.
5. Add the exact **Authorized JavaScript origins**:
   - `https://dxxdddddde-pixel.github.io` (origin only — no repo path)
   - `http://localhost:8080` for local testing
6. No **Authorized redirect URI** is needed for the Google Health token flow. Old redirect URI values
   are ignored.

Google compares JavaScript origins exactly, including scheme and port. The repo path is not part of
the origin, so one GitHub Pages origin covers the deployed site.

### 2. Add the client ID

Open `firebase-config.js` and confirm `healthClientId`:

```js
window.ARISE_FIREBASE_CONFIG = {
  // ...Firebase values / googleClientId for Cloud Link...
  healthClientId: "123456789-abc.apps.googleusercontent.com"
};
```

`healthClientId` falls back to `googleClientId` when empty. The client ID is public by design. Never
add a client secret to a static site.

### 3. Sync

1. Open **Data Link → Google Health Uplink** and press **CONNECT GOOGLE HEALTH**.
2. Press **SYNC GOOGLE HEALTH**. The app reads daily rollups and summaries for the last 40 days:
   steps, active/total calories, active minutes, heart rate, core/body temperature, HRV, resting HR,
   respiratory rate, VO₂ max, sleep and workouts.
3. If an archive already exists, confirm **REPLACE ARCHIVE**. Your hunter name, claimed quest XP,
   audio setting, Training Grounds protocol, Body Log, Strength Log, Cloud Link state and health-link
   metadata are preserved.
4. Press **SYNC GOOGLE HEALTH** again for a refresh. The access token is kept in memory only; after a
   reload or token expiry, Google reuses your saved consent and returns a new token when you press the
   button again. The last sync time and granted-scope record stay in local state.

### Partial consent is supported

You may grant any subset of the three scopes. The status chip shows **PARTIAL HEALTH LINK**, and only
the granted metrics populate; the rest stay blank rather than failing the whole sync. To add scopes
later, press **SYNC GOOGLE HEALTH** again and approve the additional access. The app asks for all
three scopes each time and reads the actually granted scopes from the token response.

### What Google Health can supply

| ARISE metric | Google Health source |
| --- | --- |
| Steps | `steps` daily rollup |
| Active energy / basal energy | `active-energy-burned` and `total-calories` (basal = total − active) |
| Exercise minutes | `active-minutes` daily rollup |
| Sleep, deep, REM, core, awake | `sleep` sessions and stage summaries |
| Heart rate | `heart-rate` rollup (average/min/max) |
| Body temperature | `core-body-temperature` rollup |
| Gates/workouts | `exercise` sessions |
| HRV, resting HR, respiratory rate, VO₂ max | Daily summary data types |

Because HRV and resting HR require their own scope, Recovery relies more on sleep, temperature and
other available signals when those are not granted.

### Apple Health on iPhone

ARISE reads only data already inside your Google Health profile. It cannot read Apple Health, and
health archive file import is no longer available. If you want Apple Health data in ARISE, first get
the desired categories into the **Google Health / Fitbit app** on iPhone, then sync here. Google's
Apple Health import covers only supported categories and a limited history window; older or excluded
data will not appear.

### Troubleshooting

- **"SETUP REQUIRED"** — `healthClientId` is empty or still a placeholder.
- **`origin_mismatch` / `invalid_client`** — use a **Web application** client and register
  `https://dxxdddddde-pixel.github.io` under **Authorized JavaScript origins**. No repo path.
- **`client_secret is missing`** — an old code-flow build is cached. Reload to pick up `v14`; this
  version never calls the token endpoint and never uses a secret.
- **403 / permission error** — enable the Google Health API, add the scopes to the consent screen,
  and add your account as a test user while the app is in testing.
- **401 / "authorization expired"** — press **SYNC GOOGLE HEALTH** to authorize again.
- **`ACCOUNT_NOT_LINKED`** — the Google account is not linked to Google Health. Link it in the
  Google Health / Fitbit app first.
- **"PARTIAL HEALTH LINK"** — some grants are missing. Reconnect and approve the missing scopes.
- **"NO GOOGLE HEALTH DATA"** — the account has no supported records in the last 40 days, or the
  source app has not written them into Google Health yet.
- **"SIGN-IN UNAVAILABLE"** — the Google Identity Services script could not load; check your
  connection and reload.
- **OAuth does nothing from `file://`** — deploy to GitHub Pages or serve on `http://localhost:8080`.

---

## Cloud Link with Firebase (optional)

**Data Link → Cloud Link** can sign you in with Google and automatically back up the complete ARISE
state to Firebase. localStorage remains the offline source of truth; the cloud holds versioned
snapshots you can restore on any device.

### 1. Create the Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/) → **Add project**.
2. Add a **Web app** (`</>`) to the project and copy its config values.
3. Enable **Authentication → Sign-in method → Google**, then add your GitHub Pages domain
   (`<username>.github.io`, or your custom domain) under **Firebase Authorized domains**.
4. In **Google Cloud Console → APIs & Services → Credentials**, open the Web OAuth client for this
   project (or create one) and add this exact **Authorized JavaScript origin**:
   `https://dxxdddddde-pixel.github.io`. Copy its **Client ID**.
5. Create a **Cloud Firestore** database (start in production mode, then publish the rules below).
   Cloud Storage is not needed, so the app works on the free Spark plan.

### 2. Add your config

Open `firebase-config.js` and replace the empty values with the web app config from step 2:

```js
window.ARISE_FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  appId: "1:123456789:web:abcdef",
  googleClientId: "123456789-abc.apps.googleusercontent.com",
  healthClientId: "123456789-abc.apps.googleusercontent.com"
};
```

The API key and OAuth client ID are public by design. Access is controlled by the security rules, not
by hiding them. `googleClientId` must be from the same Google Cloud project as the Firebase app for
Cloud Link. It can also serve as the fallback Google Health client ID when `healthClientId` is empty.

### 3. Publish security rules

**Firestore rules:**

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

This covers the exact paths the app writes:

```text
users/<uid>/meta/cloud
users/<uid>/snapshots/<revisionId>
users/<uid>/snapshots/<revisionId>/chunks/<chunkIndex>
```

If you prefer narrower rules, keep one `allow read, write: if request.auth != null && request.auth.uid == uid;`
rule for each of those three paths.

### 4. Use it

- Open **Data Link → Cloud Link** and use the **Sign in with Google** button. It returns an ID token
  directly to the page, avoiding Firebase's third-party auth redirect handler that Safari ITP blocks.
  If the Google library cannot load, the app falls back to the standard Firebase redirect.
- After changes, the archive uploads automatically about **15 seconds** after the last edit.
- **SYNC NOW**, **UPLOAD TO CLOUD** and **DOWNLOAD FROM CLOUD** are available for manual control.
- Snapshots are split into Firestore document chunks and stored under `users/<uid>/snapshots/<revision>/`.
  The newest 10 revisions are kept.
- If this device has unsynced edits and the cloud is newer, the System asks which version to keep —
  it never overwrites silently.

The Firebase SDK is cached by the service worker, so the dashboard still opens offline. Cloud
syncing simply waits until the network returns.

### Costs

A single personal account stays inside the Firebase **Spark (free)** plan in normal use: Firestore
stores one small metadata document plus up to 10 chunked snapshot revisions. Cloud Storage and Blaze
are not required.

---

## Backup export / restore

**Data Link → Sync History** keeps **EXPORT BACKUP** and **IMPORT BACKUP**. A backup is an ARISE JSON
state snapshot — not a health archive file. It includes your metrics, hunter identity, claimed XP,
Training Grounds, Body Log, Strength Log and link metadata.

Each Google Health sync **replaces** movement, sleep and workout history so scores never double-count.
Your hunter name, claimed quest XP, audio setting, Training Grounds, Body Log, Strength Log, Cloud
Link state and health-link metadata are preserved. A sync summary is written to the System Feed, and
the last 12 syncs are listed on the Data Link screen.

---

## What the scores mean

Scores are heuristics meant for motivation and trend-spotting, not medical diagnosis.

| Score | Range | Inputs |
| --- | --- | --- |
| **Recovery** | 0–100 | HRV and resting heart rate vs. your own 28-day baseline (when granted), last night's sleep, respiratory rate, body-temperature deviation |
| **Strain** | 0–21 | Active energy, exercise minutes, workout duration and workout intensity |
| **Sleep** | 0–100 | Total sleep, awake time, deep-sleep share, REM share |

The **Vitals** panel shows HRV, resting HR, sleep, active energy, steps, exercise, respiratory rate and
VO₂ max for the selected day. A 35-day movement heatmap and plain-language insights sit below.

Trends compare against **your** recent baseline, so a "low" recovery means low *for you*, not low in
absolute terms.

---

## The System

- **XP** is earned automatically from each synced day: steps, exercise minutes, active energy,
  a sleep bonus and 30 XP per workout, plus claimed quest rewards.
- **Levels** use an increasing curve (`400 + 120 × (level − 1)` XP per level, up to level 100).
- **Ranks** unlock at levels 1 / 5 / 10 / 16 / 24 / 34 / 50 / 70:
  E → D → C → B → A → S → National → Monarch.
- **Attributes** (STR / AGI / VIT / INT / PER) are derived from 14-day training, sleep, HRV and
  consistency data.
- **Quests** are generated from today's data:
  - Daily: 10,000 steps, 30 exercise minutes, one gate (workout), 7 h sleep, 60+ recovery.
  - Weekly: 5 gates, 50,000 steps, five 60+ recovery days, 300 exercise minutes.
  - Completed directives can be **claimed once** for bonus XP.
- **Shadows** are summoned across eighteen level milestones: IGRIS (5), IRON (8), TUSK (12), KAISEL
  (16), BERU (20), GREED (25), BELLION (30), KAMISH (40), TANK (44), CERBERUS (48), NABERIUS (52),
  BARAN (56), VALTAN (62), RAKAN (68), YOGUMUNT (76), LEVIA (84), TERAK (90) and ETERNAL SHADOW (96).
- **Streak** counts consecutive days with steps, exercise or a workout.

Workouts are mapped to named gates by activity type (runs, strength, cycling, yoga, swimming, etc.)
with ranks that scale with duration and energy.

---

## Training Grounds

The **100× Time Chamber** is the training layer of the System. It is independent of Health workout
gates because Google Health exercise sessions do not contain individual sets, reps or loads.

- **Today's Workout** — the System checks your local weekday and serves the matching day from the
  active plan week, with per-exercise targets, completion chips, a live set log and one-click logging.
  Once a drill's prescribed sets are complete it stays **CLEARED** with a `✓ DONE` button, even when
  overload immediately raises the next target. On rest days you can borrow the next programmed session
  or log an unplanned set.
- **Weekly protocol** — build as many weeks as you want, assign exercises to any of the seven days,
  and set target sets, a rep range (or a seconds range for timed holds), current target, load and rest.
  Rename, clone, copy and clear weeks or days.
- **Supersets** — assign two or more drills on the same day to the same superset group (A–F) in the
  exercise modal. They are shown together in Today's Workout under a `SUPERSET A` header, with the
  group rest interval shown after the last drill. Each drill keeps its own sets, load and overload.
- **Exercise library** — 87 drills browsable by specific muscle group in both the protocol and log
  modals: CHEST, SHOULDERS, TRICEPS, BICEPS, BACK, LATS, TRAPS, FOREARMS, QUADS, HAMSTRINGS, GLUTES,
  CALVES, ABS and LOWER BACK. Isometric drills such as Plank, Side Plank, Hollow Hold, Dead Hang,
  Wall Sit, Bird Dog, Dead Bug and Farmer's Carry are flagged as **timed holds**: they are prescribed
  in seconds instead of reps. Picking a drill fills its starting load, rest and metric defaults; the
  target muscle is shown in the plan, Today's Workout and personal records. Autocomplete also works
  for any custom exercise name.
- **Set ledger** — log individual sets (exercise, weight, reps or hold seconds, sets, date) from the
  log button on any planned exercise or from the ledger panel. Sample data can be installed for an
  8-week preview.
- **Estimated 1RM** — Epley formula (`weight × (1 + reps / 30)`, capped at 12 reps) from your heaviest
  sets, ranked across your lifts.
- **Progressive overload (double progression)** — each exercise has a range (e.g. `8–12` reps, or
  `30–60` seconds for a timed hold) and a current target inside it. The System only advances after you
  complete **every prescribed set at the prescribed load, with each set hitting the current target** —
  a single stray set never triggers it. Rep-based lifts add **one rep at the same weight**; timed holds
  add **5 seconds at the same load**. Once all sets reach the top of the range it adds a small amount
  of weight (+2.5 KG compound / +1 KG accessory) and resets the target to the bottom (unloaded
  bodyweight holds and lifts extend the range instead). The new prescription is applied across every
  week the exercise appears, and the log form always pre-fills that exact target. The last change is
  shown as a `REP PROGRESSION APPLIED`, `HOLD PROGRESSION APPLIED`, `WEIGHT INCREASE APPLIED` or
  `RANGE EXTENDED` banner in Today's Workout.
- **Exercise progress** — a session-by-session 1RM trajectory for weighted lifts, or hold-time
  trajectory for timed holds.
- **Weekly volume** — an 8-week stacked tonnage chart split into PUSH, PULL, LEGS and CORE.
- **Personal records** — best 1RM, heaviest set, highest single-session volume and max reps for rep
  lifts; longest hold, total hold time, holds logged and best session for timed holds.

Plan and ledger data live in the same `arise-hunter-system-v1` snapshot as your health archive, so they
are included in backups and survive archive replacement. Use **LOAD SAMPLE DATA** in the Training
Grounds to explore the analytics without entering your own sets.

---

## Body Log

The **Body Log** view keeps long-term physical records separate from the daily Training Grounds work.

- **Biometric checkpoints** — log **body weight** and **waist (cm)** once every **14 days**. The date
  picker is locked to the next checkpoint after your last entry, so the cadence stays consistent. The
  header shows when the next checkpoint is due.
- **Calculated average steps** — the System reads your Google Health archive and averages daily
  steps over the 14 days ending on the checkpoint date. The modal shows how many daily records fed the
  calculation; no step field is typed by hand.
- **Checkpoint reminders** — once a checkpoint is due, an in-app popup appears immediately and repeats
  every **2 hours** until you log the entry. A toast and, if you enable **ENABLE ALERTS**, a system
  notification accompany each popup. Reminders can be paused/resumed, and **TEST ALERT** previews the
  popup. Reminders run while the app is open.
- **Body trend** — weight and waist are plotted together over your checkpoints, with change since the
  first record and the average step count across all checkpoints shown in the caption.
- **Strength Log** — the **heaviest set of the month** for every exercise is calculated automatically
  from your Training Grounds set ledger. Logging, editing or deleting a set instantly refreshes the
  matching monthly peak (heaviest load, or longest hold for timed drills). Ledger-backed rows are marked
  **SYNCED**. Use **ADD MANUAL PEAK** only for lifts that are not in the set ledger; those rows are
  marked **MANUAL**. Strength Log rows are read-only — change synced peaks by logging or deleting sets
  in Training Grounds. There are no edit or remove controls in the Strength Log.
- **Monthly tracking** — use the month arrows to inspect any month. The exercise selector lists only
  workouts you have actually logged (or already have a peak for), not the full drill library. Select
  one to plot its peak load (or longest hold) across the last eight months, including gaps for months
  with no record.

Body Log and Strength Log records are retained by **Purge Data** alongside the training protocol, and
are included in JSON backups.

---

## Legacy iOS shell (not used)

The `ios/` folder and `.github/workflows/build-ipa.yml` are left over from an earlier HealthKit
sideloading build. They are **not** part of the current workflow. The web app has no native bridge;
it runs entirely from GitHub Pages and reads live data only from Google Health. You can ignore or
delete those legacy files.

---

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `1`–`7` | Status / Gates / Quests / Training Grounds / Body Log / Shadow Army / Data Link |
| `Esc` | Close modal or level-up overlay |

The speaker button in the top bar toggles subtle System sound effects. It is **on** by default and
respects `prefers-reduced-motion` for particles and animations.

---

## Privacy

- Google Health is read directly by your browser with an access token that is kept in memory for the
  current session only; no token, authorization code or client secret is stored in this repository.
- Google Identity Services handles consent in a popup and returns the granted scopes with the token.
  Nothing is written to `sessionStorage` for the Health link.
- Health data is processed locally. It is never uploaded to ARISE and is not uploaded to Firebase
  unless you enable **Cloud Link** and sign in.
- Without Cloud Link, data lives only in this browser profile's `localStorage`.
- With Cloud Link, Firebase stores your signed-in account identifier and encrypted-in-transit
  snapshots in Firestore documents under your own user ID. Only that account can read them.
- On GitHub Pages, `sw.js` caches the app's own files and Firebase SDK so it opens offline.
- **Data Link → Export Backup** writes a JSON snapshot you can keep.
- **Data Link → Import Backup** restores that ARISE snapshot on another device.
- **Data Link → Purge Data** deletes the archive from this browser.
- Clearing site data / browser storage also deletes the archive, so export a backup first.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| OAuth never returns from `file://` | Use GitHub Pages or `http://localhost:8080` |
| `origin_mismatch` / `invalid_client` | Register the site origin as an Authorized JavaScript origin |
| `client_secret is missing` | Reload for `v14`; the old code-flow build is cached |
| "SETUP REQUIRED" | Add `healthClientId` (or `googleClientId`) in `firebase-config.js` |
| 403 / permission error | Enable the Google Health API, add the read scopes, and add the account as a test user |
| `ACCOUNT_NOT_LINKED` | Link the Google account inside the Google Health / Fitbit app first |
| "PARTIAL HEALTH LINK" | Reconnect and approve the missing Activity, Sleep or Health Metrics scope |
| "NO GOOGLE HEALTH DATA" | Confirm the source app has written supported records into Google Health in the last 40 days |
| "Save failed — storage is full" | Use **Export Backup**, then **Purge Data**, then sync a smaller source window |
| Archive disappears after closing the tab | Some browsers do not persist `file://` storage; use GitHub Pages or `localhost` |
| A newer sync shows lower scores | Scores are relative to your rolling baseline; a hard training block can lower recovery while strain rises |
| Nothing appears after sync | Check the System Feed (right column) for the sync summary or error message |

`test-fixtures/` contains legacy Apple Health / Health Auto Export samples from the removed file-import
feature. They are unused by the app.

---

## Project structure

```
index.html          markup, views, modals, overlays
styles.css          theme, layout, responsive rules, animations
manifest.webmanifest PWA metadata for Add to Home Screen
sw.js               offline app-shell cache (GitHub Pages / HTTPS)
firebase-config.js  Firebase config and public Google OAuth client IDs
js/data.js          storage, scoring, XP/levels, quests, demo generator
js/ui.js            renderers and view components
js/training.js      weekly plan builder, set ledger, 1RM, overload, charts, PRs
js/body.js          biometric checkpoints, calculated steps, monthly strength peaks
js/cloud.js         Google sign-in, automatic Firebase snapshot sync, restore
js/health.js        Google Health GIS token flow + REST mapping into the live snapshot pipeline
js/app.js           boot, event wiring, backup export/restore, Google Health sync
assets/fonts/       self-hosted fonts
assets/icons/       PWA + Apple touch icons
test-fixtures/      LEGACY health archive samples (unused)
ios/ARISE/          LEGACY SwiftUI + HealthKit shell (unused)
ios/build-ipa.sh    LEGACY local macOS IPA build
.github/workflows/  GitHub Actions Pages deployment + legacy IPA builder
```

Vanilla HTML/CSS/JS with self-hosted fonts. No build step and no tracking. Live Google Health sync and
optional Cloud Link make network calls only when you explicitly use them.

> **Not medical advice.** Recovery, strain and sleep figures are motivational estimates derived from
> consumer wearable data. Listen to your body and consult a professional for health decisions.
