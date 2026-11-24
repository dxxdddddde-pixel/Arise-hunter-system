/* =========================================================
   ARISE // cloud link
   ---------------------------------------------------------
   Optional Firebase Google sign-in with automatic, versioned
   cloud snapshots. localStorage remains the offline source of truth.
   ========================================================= */
(function () {
  "use strict";

  const D = window.SystemData;
  const UI = window.SystemUI;
  const $ = (sel) => document.querySelector(sel);
  const CDN = "https://www.gstatic.com/firebasejs/11.6.0/";
  const SYNC_DELAY = 15000;
  const HISTORY_LIMIT = 10;
  const HISTORY_EVERY_MS = 6 * 60 * 60 * 1000;
  const MAX_BYTES = 40 * 1024 * 1024;

  let ctx = null;
  let configured = false;
  let app = null;
  let auth = null;
  let db = null;
  let storage = null;
  let user = null;
  let syncTimer = null;
  let syncing = false;
  let reconciled = false;

  function ensure(state) {
    if (!state.cloud || typeof state.cloud !== "object") state.cloud = {};
    const c = state.cloud;
    c.uid = c.uid || null;
    c.email = c.email || null;
    c.lastSyncAt = Number(c.lastSyncAt) > 0 ? Number(c.lastSyncAt) : null;
    c.remoteUpdatedAt = Number(c.remoteUpdatedAt) > 0 ? Number(c.remoteUpdatedAt) : null;
    c.lastError = c.lastError || null;
    c.dirty = !!c.dirty;
    c.syncing = !!c.syncing;
    return c;
  }

  function isConfigured() {
    const cfg = window.ARISE_FIREBASE_CONFIG || {};
    const keys = ["apiKey", "authDomain", "projectId", "storageBucket", "appId"];
    configured = keys.every((key) => {
      const value = String(cfg[key] || "").trim();
      return value && !/^(YOUR|PASTE|ADD)_/i.test(value);
    });
    return configured;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-firebase-src="' + src + '"]');
      if (existing && existing.dataset.loaded === "true") return resolve();
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.dataset.firebaseSrc = src;
      script.onload = () => {
        script.dataset.loaded = "true";
        resolve();
      };
      script.onerror = () => reject(new Error("Could not load " + src));
      document.head.appendChild(script);
    });
  }

  async function initFirebase() {
    if (!isConfigured()) {
      render();
      return;
    }
    if (!window.firebase) {
      await loadScript(CDN + "firebase-app-compat.js");
      await Promise.all([
        loadScript(CDN + "firebase-auth-compat.js"),
        loadScript(CDN + "firebase-firestore-compat.js"),
        loadScript(CDN + "firebase-storage-compat.js")
      ]);
    }
    if (!window.firebase) throw new Error("Firebase SDK unavailable");

    if (!firebase.apps.length) firebase.initializeApp(window.ARISE_FIREBASE_CONFIG);
    app = firebase.app();
    auth = firebase.auth();
    db = firebase.firestore();
    storage = firebase.storage();

    try {
      const result = await auth.getRedirectResult();
      if (result && result.user) UI.toast("success", "GOOGLE LINKED", "Cloud Link connected to " + result.user.email + ".");
    } catch (err) {
      console.warn("ARISE: Google redirect result unavailable", err);
    }

    auth.onAuthStateChanged(onAuthChange);
    render();
  }

  function onAuthChange(nextUser) {
    user = nextUser || null;
    const state = ctx.getState();
    const c = ensure(state);
    c.uid = user ? user.uid : null;
    c.email = user ? user.email || null : null;
    if (!user) {
      c.dirty = false;
      reconciled = false;
      clearTimeout(syncTimer);
    }
    D.saveState(state);
    render();
    if (user && !reconciled) {
      reconciled = true;
      reconcile().catch((err) => {
        c.lastError = err && err.message ? err.message : "Cloud reconciliation failed.";
        D.saveState(state);
        render();
      });
    }
  }

  function metaPath() {
    return "users/" + user.uid + "/meta/cloud";
  }

  function latestPath() {
    return "users/" + user.uid + "/snapshots/arise-state";
  }

  function historyPath(stamp) {
    return "users/" + user.uid + "/snapshots/history/arise-" + stamp;
  }

  async function getRemoteMeta() {
    if (!db || !user) return null;
    const snap = await db.doc(metaPath()).get();
    return snap.exists ? snap.data() : null;
  }

  function counts(state) {
    return {
      days: Object.keys(state.days || {}).length,
      sets: state.training && Array.isArray(state.training.logs) ? state.training.logs.length : 0
    };
  }

  async function encode(text) {
    if (typeof TextEncoder === "undefined") throw new Error("TextEncoder unavailable");
    const bytes = new TextEncoder().encode(text);
    if (typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined") {
      const stream = new CompressionStream("gzip");
      const writer = stream.writable.getWriter();
      await writer.write(bytes);
      await writer.close();
      const buffer = await new Response(stream.readable).arrayBuffer();
      return { bytes: new Uint8Array(buffer), encoding: "gzip", contentType: "application/gzip" };
    }
    return { bytes, encoding: "json", contentType: "application/json" };
  }

  async function decode(bytes, encoding) {
    const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (encoding === "gzip") {
      if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot read gzip snapshots.");
      const stream = new DecompressionStream("gzip");
      const writer = stream.writable.getWriter();
      await writer.write(raw);
      await writer.close();
      const buffer = await new Response(stream.readable).arrayBuffer();
      return new TextDecoder().decode(buffer);
    }
    return new TextDecoder().decode(raw);
  }

  async function uploadToCloud(manual) {
    if (!user || !storage || !db) {
      if (manual) UI.toast("warn", "SIGN IN REQUIRED", "Sign in with Google before syncing to the cloud.");
      return;
    }
    if (syncing) return;
    const state = ctx.getState();
    const c = ensure(state);
    syncing = true;
    c.syncing = true;
    render();

    try {
      const snapshotState = JSON.parse(JSON.stringify(state));
      snapshotState.cloud = Object.assign({}, snapshotState.cloud, { dirty: false, syncing: false, lastError: null });
      const text = JSON.stringify({
        app: "ARISE",
        version: state.version || 1,
        exportedAt: new Date().toISOString(),
        state: snapshotState
      });
      const packed = await encode(text);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const ext = packed.encoding === "gzip" ? ".gz" : ".json";
      const latest = latestPath() + ext;
      const meta = await getRemoteMeta();
      const now = Date.now();

      await storage.ref(latest).put(packed.bytes, { contentType: packed.contentType });

      const makeHistory = manual || !meta || !meta.historyAt || (now - Number(meta.historyAt) > HISTORY_EVERY_MS);
      if (makeHistory) await storage.ref(historyPath(stamp) + ext).put(packed.bytes, { contentType: packed.contentType });

      const n = counts(state);
      await db.doc(metaPath()).set({
        uid: user.uid,
        email: user.email || null,
        updatedAt: now,
        updatedISO: new Date(now).toISOString(),
        path: latest,
        encoding: packed.encoding,
        bytes: packed.bytes.length,
        days: n.days,
        sets: n.sets,
        historyAt: makeHistory ? now : Number(meta.historyAt) || now,
        app: "ARISE",
        schemaVersion: state.version || 1
      });

      c.dirty = false;
      c.syncing = false;
      c.lastSyncAt = now;
      c.remoteUpdatedAt = now;
      c.lastError = null;
      D.saveState(state);
      render();
      if (manual) UI.toast("success", "CLOUD SYNCED", n.days + " days and " + n.sets + " sets uploaded.");
      if (makeHistory) trimHistory().catch(() => { /* best effort */ });
    } catch (err) {
      c.syncing = false;
      c.lastError = err && err.message ? err.message : "Upload failed.";
      D.saveState(state);
      render();
      UI.toast("error", "CLOUD SYNC FAILED", c.lastError);
    } finally {
      syncing = false;
    }
  }

  async function trimHistory() {
    if (!storage || !user) return;
    const folder = storage.ref("users/" + user.uid + "/snapshots/history");
    const listing = await folder.listAll();
    const items = listing.items.slice().sort((a, b) => b.name.localeCompare(a.name));
    const old = items.slice(HISTORY_LIMIT);
    await Promise.all(old.map((item) => item.delete().catch(() => null)));
  }

  async function downloadFromCloud(force) {
    if (!user || !storage || !db) {
      if (force) UI.toast("warn", "SIGN IN REQUIRED", "Sign in with Google before downloading cloud data.");
      return;
    }
    try {
      const meta = await getRemoteMeta();
      if (!meta || !meta.path) {
        UI.toast("warn", "NO CLOUD ARCHIVE", "Nothing has been uploaded for this account yet.");
        return;
      }
      const task = await storage.ref(meta.path).getBytes(MAX_BYTES);
      const bytes = task.bytes || task;
      const text = await decode(bytes, meta.encoding || "json");
      const payload = JSON.parse(text);
      if (!payload || !payload.state || typeof payload.state !== "object") throw new Error("Cloud snapshot is invalid.");
      applyRemote(payload.state, meta);
    } catch (err) {
      const state = ctx.getState();
      const c = ensure(state);
      c.lastError = err && err.message ? err.message : "Download failed.";
      D.saveState(state);
      render();
      UI.toast("error", "CLOUD RESTORE FAILED", c.lastError);
    }
  }

  function applyRemote(remoteState, meta) {
    const restored = D.normalizeState(remoteState);
    const c = ensure(restored);
    c.uid = user ? user.uid : null;
    c.email = user ? user.email || null : null;
    c.lastSyncAt = Date.now();
    c.remoteUpdatedAt = Number(meta.updatedAt) || Date.now();
    c.dirty = false;
    c.syncing = false;
    c.lastError = null;
    ctx.setState(restored);
    ctx.persist("cloud");
    UI.render(restored);
    UI.setView("status");
    UI.toast("success", "CLOUD ARCHIVE RESTORED", "This device now matches your latest Firebase snapshot.");
  }

  async function reconcile() {
    if (!user) return;
    const state = ctx.getState();
    const c = ensure(state);
    const meta = await getRemoteMeta();

    if (!meta || !meta.path) {
      c.remoteUpdatedAt = null;
      if (Object.keys(state.days || {}).length || (state.training && Array.isArray(state.training.logs) && state.training.logs.length)) {
        await uploadToCloud(false);
      }
      render();
      return;
    }

    const remoteAt = Number(meta.updatedAt) || 0;
    c.remoteUpdatedAt = remoteAt;
    const localAt = Number(c.lastSyncAt) || 0;
    const localDirty = !!c.dirty;

    if (localAt === remoteAt) {
      c.dirty = false;
    } else if (!localDirty && localAt < remoteAt) {
      await downloadFromCloud(false);
      return;
    } else if (localDirty && localAt < remoteAt) {
      showConflict(meta);
      return;
    } else {
      await uploadToCloud(false);
      return;
    }
    D.saveState(state);
    render();
  }

  function showConflict(meta) {
    const local = counts(ctx.getState());
    UI.openModal({
      title: "Cloud Data Conflict",
      body: `<p>This device has <strong>${local.days} days</strong> of unsynced changes. The cloud snapshot is newer
             (${D.fmtDateTime(new Date(Number(meta.updatedAt) || Date.now()).toISOString())}).</p>
             <p>Choose which version to keep. Nothing is overwritten until you decide.</p>`,
      actions: [
        { label: "CANCEL" },
        { label: "UPLOAD DEVICE", onClick: () => uploadToCloud(true) },
        {
          label: "USE CLOUD DATA",
          kind: "primary",
          onClick: () => downloadFromCloud(true)
        }
      ]
    });
  }

  function scheduleSync() {
    if (!user || !configured) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow(false), SYNC_DELAY);
  }

  function syncNow(manual) {
    if (!user) {
      if (manual) UI.toast("warn", "SIGN IN REQUIRED", "Sign in with Google before syncing.");
      return Promise.resolve();
    }
    const c = ensure(ctx.getState());
    if (!c.dirty && !manual) return Promise.resolve();
    return uploadToCloud(!!manual);
  }

  function markDirty() {
    if (!user || !ctx) return;
    const c = ensure(ctx.getState());
    c.dirty = true;
    c.lastError = null;
    D.saveState(ctx.getState());
    render();
    scheduleSync();
  }

  function signIn() {
    if (!configured || !auth) {
      UI.toast("warn", "FIREBASE SETUP REQUIRED", "Add your Firebase web config to firebase-config.js first.");
      return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    auth.signInWithRedirect(provider).catch((err) => {
      UI.toast("error", "SIGN IN FAILED", err && err.message ? err.message : "Google sign-in was blocked.");
    });
  }

  function signOut() {
    UI.openModal({
      title: "Disconnect Cloud Link?",
      body: "<p>Local data stays on this device. Automatic upload stops until you sign in again.</p>",
      actions: [
        { label: "CANCEL" },
        { label: "SIGN OUT", kind: "danger", onClick: () => auth && auth.signOut() }
      ]
    });
  }

  function setDisabled(sel, disabled) {
    const el = $(sel);
    if (el) el.disabled = !!disabled;
  }

  function render() {
    if (!ctx) return;
    const state = ctx.getState();
    ensure(state);
    const status = $("#cloudStatusText");
    const chip = $("#cloudChip");
    const userEl = $("#cloudUser");
    const note = $("#cloudNote");
    const last = $("#cloudLastSync");
    const pending = $("#cloudPending");
    if (!status) return;

    let label = "LOCAL ONLY";
    let detail = "Sign in to enable automatic cloud backup.";
    if (!configured) {
      label = "SETUP REQUIRED";
      detail = "Add your Firebase web config to firebase-config.js, then reload.";
    } else if (!auth) {
      label = "CONNECTING";
      detail = "Loading Firebase authentication…";
    } else if (user) {
      if (state.cloud.syncing) label = "SYNCING";
      else if (state.cloud.lastError) label = "SYNC ERROR";
      else if (state.cloud.dirty) label = "UNSYNCED CHANGES";
      else label = "CLOUD LINKED";
      detail = state.cloud.lastError || "Changes upload automatically about 15 seconds after you finish.";
    }

    status.textContent = label;
    if (chip) chip.classList.toggle("is-due", !!user && (state.cloud.dirty || !!state.cloud.lastError));
    if (userEl) userEl.textContent = user ? user.email || user.uid : "NOT LINKED";
    if (note) note.textContent = detail;
    if (last) last.textContent = D.fmtDateTime(state.cloud.lastSyncAt ? new Date(state.cloud.lastSyncAt).toISOString() : null);
    if (pending) pending.textContent = !configured || !user ? "—" : state.cloud.dirty ? "PENDING UPLOAD" : "UP TO DATE";

    const canSync = configured && !!user;
    setDisabled("#cloudSyncNow", !canSync);
    setDisabled("#cloudDownload", !canSync);
    setDisabled("#cloudUpload", !canSync);
    const signInBtn = $("#cloudSignIn");
    const signOutBtn = $("#cloudSignOut");
    if (signInBtn) signInBtn.hidden = !!user;
    if (signOutBtn) signOutBtn.hidden = !user;
  }

  function bindStatic() {
    const map = {
      "#cloudSignIn": signIn,
      "#cloudSignOut": signOut,
      "#cloudSyncNow": () => syncNow(true),
      "#cloudDownload": () => downloadFromCloud(true),
      "#cloudUpload": () => uploadToCloud(true)
    };
    Object.keys(map).forEach((sel) => {
      const el = $(sel);
      if (el) el.addEventListener("click", map[sel]);
    });
  }

  function mount(options) {
    ctx = options;
    ensure(ctx.getState());
    bindStatic();
    render();
    window.addEventListener("arise:state-changed", (e) => {
      if (!e.detail || e.detail.source !== "cloud") markDirty();
    });
    window.addEventListener("online", () => {
      if (user && ctx.getState().cloud.dirty) syncNow(false);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && user && ctx.getState().cloud.dirty) syncNow(false);
    });
    initFirebase().catch((err) => {
      const state = ctx.getState();
      const c = ensure(state);
      c.lastError = err && err.message ? err.message : "Firebase setup failed.";
      D.saveState(state);
      render();
      UI.toast("warn", "CLOUD LINK OFFLINE", c.lastError);
    });
  }

  window.SystemCloud = { mount, render, syncNow, downloadFromCloud, uploadToCloud };
})();
