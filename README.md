# ARISE // Hunter Interface

A single-page health dashboard with **Solo Leveling** "System" styling, built on top of your own
**Apple Watch** data. Recovery, strain and sleep scores are recalculated locally, then fed into a
hunter profile: XP, levels, E→Monarch ranks, attributes, daily/weekly quests, a full Training Grounds
protocol builder, a 14-day Body Log with monthly strength peaks and eighteen unlockable shadows.

No build step, no server, no account. Open `index.html` and it runs.

---

## Quick start

1. Open `index.html` in a modern desktop browser (Chrome, Edge, Firefox or Safari 16.4+).
   - Windows: double-click the file, or run `Start-Process index.html` from PowerShell.
2. The System boots with an empty archive and shows **"AWAITING SYNC"**.
3. Either:
   - click **LOAD DEMO** to preview 40 days of realistic Apple Watch data, or
   - click **SYNC APPLE WATCH** (or drag a file onto the Data Link screen) to import your own archive.

Everything is stored in `localStorage` under `arise-hunter-system-v1`. Nothing is uploaded.

If your browser blocks local-file features, serve the folder instead:

```powershell
# any static server works; for example, VS Code's Live Server extension
# or, if Python is available on the machine:
python -m http.server 8080
```

Then visit `http://localhost:8080`.

---

## iPhone via GitHub Pages

The dashboard is a installable web app (PWA). GitHub Pages hosts it over HTTPS, which Safari needs
for home-screen installation and offline caching.

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

The first visit needs an internet connection so the app shell can be cached. After that, `sw.js`
serves the dashboard offline. Data is stored per device in Safari's site data unless you enable the
optional Firebase Cloud Link below.

> Live HealthKit reading is not available to websites. Use the official Apple Health export,
> Health Auto Export JSON, or the sideloaded native shell described below.

---

## Cloud Link with Firebase (optional)

**Data Link → Cloud Link** can sign you in with Google and automatically back up the complete ARISE
state to Firebase. localStorage remains the offline source of truth; the cloud holds versioned
snapshots you can restore on any device.

### 1. Create the Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/) → **Add project**.
2. Add a **Web app** (`</>`) to the project and copy its config values.
3. Enable **Authentication → Sign-in method → Google**, then add your GitHub Pages domain
   (`<username>.github.io`, or your custom domain) under **Authorized domains**.
4. Create a **Cloud Firestore** database (start in production mode, then publish the rules below).
5. Create **Cloud Storage** (start in production mode, then publish the rules below).

### 2. Add your config

Open `firebase-config.js` and replace the empty values with the web app config from step 2:

```js
window.ARISE_FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.firebasestorage.app",
  appId: "1:123456789:web:abcdef"
};
```

The API key is public by design. Access is controlled by the security rules, not by hiding it.

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

**Storage rules:**

```text
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 4. Use it

- Open **Data Link → Cloud Link → SIGN IN WITH GOOGLE**. A redirect is used instead of a popup so it
  works reliably in Safari on iPhone.
- After changes, the archive uploads automatically about **15 seconds** after the last edit.
- **SYNC NOW**, **UPLOAD TO CLOUD** and **DOWNLOAD FROM CLOUD** are available for manual control.
- The latest snapshot is `users/<uid>/snapshots/arise-state.gz` (or `.json` when gzip is unavailable).
  A history snapshot is saved at most every 6 hours and the newest 10 are kept.
- If this device has unsynced edits and the cloud is newer, the System asks which version to keep —
  it never overwrites silently.

The Firebase SDK is cached by the service worker, so the dashboard still opens offline. Cloud
syncing simply waits until the network returns.

### Costs

A single personal account stays inside the Firebase **Spark (free)** plan in normal use: Firestore
stores one small metadata document, and Cloud Storage holds one latest snapshot plus up to 10 history
snapshots.

---

## Connecting your Apple Watch

Websites cannot read **HealthKit** directly — Apple only exposes it to native iOS/watchOS apps. This
app therefore consumes a file exported from your iPhone. Two formats are supported.

### Option A — Apple Health export (recommended)

1. On iPhone open **Health** → tap your **profile picture** → **Export All Health Data**.
2. Share/save the resulting **`export.zip`** to the device running this app.
3. Drag `export.zip` onto the Data Link screen, or click **CHOOSE FILE**.

The app unzips it in the browser. If your browser cannot open the ZIP (older Safari), unzip it
yourself and drop **`export.xml`** instead.

### Option B — Health Auto Export JSON

1. Install **Health Auto Export – JSON+CSV** (App Store) and create an export of metrics + workouts
   in JSON format.
2. Drop the `.json` file onto the Data Link screen.

The parser understands the typical HAE envelope (`data.metrics[]` with `name`/`units`/`data[]`, plus
`data.workouts[]`), including sleep-stage breakdowns and daily aggregates. A single-day file, a
multi-day file and an array of daily files are all accepted.

### Re-syncing

Each import **replaces** movement, sleep and workout history so scores never double-count. Your
hunter name, claimed quest XP and audio setting are preserved. An import summary is written to the
System Feed, and the last 12 imports are listed on the Data Link screen.

---

## What the scores mean

Scores are heuristics meant for motivation and trend-spotting, not medical diagnosis.

| Score | Range | Inputs |
| --- | --- | --- |
| **Recovery** | 0–100 | HRV and resting heart rate vs. your own 28-day baseline, last night's sleep, respiratory rate, wrist-temperature deviation |
| **Strain** | 0–21 | Active energy, exercise minutes, workout duration and workout intensity |
| **Sleep** | 0–100 | Total sleep, awake time, deep-sleep share, REM share |

The **Vitals** panel shows HRV, resting HR, sleep, active energy, steps, exercise, respiratory rate and
VO₂ max for the selected day. A 35-day movement heatmap and plain-language insights sit below.

Trends compare against **your** recent baseline, so a "low" recovery means low *for you*, not low in
absolute terms.

---

## The System

- **XP** is earned automatically from each imported day: steps, exercise minutes, active energy,
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

The **100× Time Chamber** is the training layer of the System. It is independent of Apple Health's
workout gates because Health exports do not contain individual sets, reps or loads.

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

Plan and ledger data live in the same `arise-hunter-system-v1` snapshot as your watch archive, so they
are included in backups and survive archive re-imports. Use **LOAD SAMPLE DATA** in the Training
Grounds to explore the analytics without entering your own sets.

---

## Body Log

The **Body Log** view keeps long-term physical records separate from the daily Training Grounds work.

- **Biometric checkpoints** — log **body weight** and **waist (cm)** once every **14 days**. The date
  picker is locked to the next checkpoint after your last entry, so the cadence stays consistent. The
  header shows when the next checkpoint is due.
- **Calculated average steps** — the System reads your imported Apple Watch archive and averages daily
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

## Native iOS app — live HealthKit (sideloaded)

The browser version above cannot read HealthKit. This repository also contains a native iOS shell: a
small Swift app that reads HealthKit **on your iPhone** and feeds the exact same ARISE dashboard
through a WKWebView bridge. You keep every score, quest, rank and visual already built — plus live
readings from your Watch.

### What you need

- Your iPhone (iOS 16+) and any computer with internet access (Windows, macOS or Linux)
- A free GitHub account — GitHub provides the macOS runner with Xcode
- A free Apple ID for sideloading, plus **AltStore Classic 2.2+** or **Impactor** on the computer
- Developer Mode on the iPhone: Settings → Privacy & Security → Developer Mode

> I cannot compile or sign an `.ipa` on Windows — Xcode only runs on macOS. The GitHub Actions
> workflow does it on a Mac and hands you the finished file.

### Build the IPA without a Mac

1. Create a free GitHub repository and push this folder to it.
2. Open the repo → **Actions** → **Build ARISE IPA (HealthKit)** → **Run workflow**.
3. When the job finishes, download the **ARISE-HealthKit-IPA** artifact and unzip it.
4. Keep both files: `ARISE-HealthKit.ipa` and `ARISE.entitlements`.

The workflow builds unsigned, then applies an ad-hoc *placeholder* signature that embeds
`com.apple.developer.healthkit`. This is deliberate: **Sideloadly discards unknown entitlements**,
whereas **AltStore Classic 2.2+ and Impactor carry them over** when they re-sign with your Apple ID.
Bundle ID is `com.arise.hunter.system` — do not change it.

### Install and connect

1. Install AltStore Classic 2.2+ (altstore.io) or Impactor and sign in with your Apple ID.
2. Sideload `ARISE-HealthKit.ipa` with that same Apple ID. If your tool exposes a **custom entitlements**
   option, point it at `ARISE.entitlements`.
3. On the iPhone: Settings → General → VPN & Device Management → your Apple ID → **Trust**.
4. Open ARISE and allow Health access (steps, workouts, sleep, heart rate, HRV, resting heart rate,
   respiratory rate, VO2 max, wrist temperature).
5. Tap **SYNC HEALTHKIT** to refresh at any time. It also syncs automatically on launch.

The link screen shows **HEALTHKIT LIVE** instead of **ARCHIVE LINKED** when running in the native shell.

### Honest limitations

- A free Apple ID allows **3 sideloaded apps** and each build expires after **7 days**. AltStore can
  auto-refresh over Wi-Fi. Export a backup before reinstalling.
- Apple can refuse to place HealthKit in a free-account provisioning profile. If you see
  `Missing com.apple.developer.healthkit entitlement`, file import still works, but live reading then
  needs the paid Apple Developer Program: enable **HealthKit** on App ID `com.arise.hunter.system`,
  delete the old app from the phone, and sideload again with that account.
- With a Mac, the cleanest route is `ios/ARISE/ARISE.xcodeproj` → Signing & Capabilities →
  **+ HealthKit** → select your team → Run on device. The entitlement is signed at build time, so no
  re-signing step can strip it.
- Build the same IPA locally on a Mac with `sh ios/build-ipa.sh`.

### How the bridge works

```
Apple Watch → HealthKit (on iPhone) → HealthKitManager.swift → WKWebView event → ARISE dashboard
```

`js/app.js` listens for `arise:snapshot`, converts it with `SystemData.buildLiveResult()` and runs the
normal import pipeline — identical scoring, XP and quest logic to ZIP/XML imports. State is mirrored
from `localStorage` into the app sandbox so it survives a web-view data reset. Nothing is uploaded.

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

- Imports are parsed **entirely in the browser**; health data is never uploaded unless you enable
  **Cloud Link** and sign in.
- Without Cloud Link, data lives only in this browser profile's `localStorage`.
- With Cloud Link, Firebase stores your signed-in account identifier and encrypted-in-transit
  snapshots in your own user folder. Only that account can read them.
- On GitHub Pages, `sw.js` caches the app's own files and Firebase SDK so it opens offline.
- **Data Link → Export Backup** writes a JSON snapshot you can keep.
- **Data Link → Import Backup** restores that snapshot on another device.
- **Data Link → Purge Data** deletes the archive from this browser.
- Clearing site data / browser storage also deletes the archive, so export a backup first.
- Some browsers isolate or clear `file://` storage between visits. If your archive disappears, run the
  app from `localhost` (see Quick start) and import again.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `export.zip` fails to open | Unzip it and drop `export.xml`; very old browsers lack `DecompressionStream` |
| "No usable health records found" | Make sure the file is a Health `export.xml`/`export.zip` or a Health Auto Export JSON file, not a screenshot or PDF |
| Import is slow | Apple Health exports can be large. Prefer **Health Auto Export** JSON, or an export with a shorter date range |
| "Save failed — storage is full" | Use **Export Backup**, then **Purge Data**, then import a smaller range |
| Archive disappears after closing the tab | Some browsers do not persist `file://` storage; serve the folder from `localhost` instead |
| A newer sync shows lower scores | Scores are relative to your rolling baseline; a hard training block can lower recovery while strain rises |
| Nothing appears after import | Check the System Feed (right column) for the import summary or error message |

Test fixtures live in `test-fixtures/`:

- `sample-export.xml` — small Apple Health XML
- `export.zip` — the same XML zipped
- `sample-hae.json` — Health Auto Export JSON with sleep stages, wrist temp and workouts

These are demo records only; import them to see the pipeline end-to-end.

---

## Project structure

```
index.html          markup, views, modals, overlays
styles.css          theme, layout, responsive rules, animations
manifest.webmanifest PWA metadata for Add to Home Screen
sw.js               offline app-shell cache (GitHub Pages / HTTPS)
firebase-config.js  Firebase web app config (paste your values here)
js/data.js          storage, parsers, scoring, XP/levels, quests, demo generator
js/ui.js            renderers and view components
js/training.js      weekly plan builder, set ledger, 1RM, overload, charts, PRs
js/body.js          biometric checkpoints, calculated steps, monthly strength peaks
js/cloud.js         Google sign-in, automatic Firebase snapshot sync, restore
js/app.js           boot, event wiring, import/export backup, native bridge
assets/fonts/       self-hosted fonts
assets/icons/       PWA + Apple touch icons
test-fixtures/      sample archives for testing imports
ios/ARISE/          SwiftUI + HealthKit shell that hosts the dashboard
ios/build-ipa.sh    local macOS IPA build
.github/workflows/  GitHub Actions Pages deployment + IPA builder
```

Vanilla HTML/CSS/JS with self-hosted fonts. No dependencies, no build, no network calls, no tracking.

> **Not medical advice.** Recovery, strain and sleep figures are motivational estimates derived from
> consumer wearable data. Listen to your body and consult a professional for health decisions.
