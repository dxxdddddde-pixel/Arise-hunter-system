/* =========================================================
   ARISE // cloud link
   ---------------------------------------------------------
   Optional Firebase Google sign-in with automatic, versioned
   Firestore snapshots. localStorage remains the offline source
   of truth. Cloud Storage is not required.
   ========================================================= */
(function () {
  "use strict";

  const D = window.SystemData;
  const UI = window.SystemUI;
  const $ = (sel) => document.querySelector(sel);
  const CDN = "https://www.gstatic.com/firebasejs/11.6.0/";
  const SYNC_DELAY = 15000;
  const HISTORY_LIMIT = 10;
  const MAX_BYTES = 40 * 1024 * 1024;
  const CHUNK_CHARS = 700000;
  const BATCH_LIMIT = 450;

  let ctx = null;
  let configured = false;
  let auth = null;
  let db = null;
  let user = null;
  let syncTimer = null;
  let syncing = false;
  let reconciled = false;
  let restoringSession = false;

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
    const keys = ["apiKey", "authDomain", "projectId", "appId"];
    configured = keys.every((key) => {
      const value = String(cfg[key] || "").trim();
      return value && !/^(YOUR|PASTE|ADD)_/i.test(value);
    });
    return configured;
  }

  function firebaseErrorInfo(err) {
    const code = err && err.code ? String(err.code) : "";
    const message = err && err.message ? String(err.message) : "Unknown Firebase error.";
    let hint = "";
    if (code === "auth/unauthorized-domain") {
      hint = "Add this site's domain in Firebase Console → Authentication → Settings → Authorized domains.";
    } else if (code === "auth/operation-not-allowed") {
      hint = "Enable Google under Firebase Console → Authentication → Sign-in method.";
    } else if (code === "auth/network-request-failed") {
      hint = "Check your internet connection and Safari cross-site tracking settings.";
    } else if (code === "auth/redirect-cancelled-by-user") {
      hint = "The Google redirect was interrupted. Try again.";
    } else if (code === "auth/web-storage-unsupported") {
      hint = "Safari is blocking Firebase storage. Allow cross-site cookies for this site.";
    } else if (code === "auth/session-lost") {
      hint = "Safari likely blocked the Firebase redirect session. Allow cross-site cookies or use a custom auth domain.";
    }
    return {
      code,
      message,
      hint,
      text: (code ? code + " — " : "") + message + (hint ? " " + hint : "")
    };
  }

  function handleCloudError(title, err, showModal) {
    if (!ctx) return null;
    const state = ctx.getState();
    const c = ensure(state);
    const info = firebaseErrorInfo(err);
    c.lastError = info.text;
    D.saveState(state);
    render();
    UI.toast("error", title, info.text);
    if (showModal) {
      UI.openModal({
        title,
        body: "<p>" + (UI.escape ? UI.escape(info.text) : info.text) + "</p>",
        actions: [{ label: "OK", kind: "primary" }]
      });
    }
    return info;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-firebase-src="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === "true") return resolve();
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Could not load " + src)), { once: true });
        return;
      }
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
    if (!window.firebase || typeof window.firebase.initializeApp !== "function") {
      await loadScript(CDN + "firebase-app-compat.js");
    }
    await Promise.all([
      typeof window.firebase.auth === "function" ? Promise.resolve() : loadScript(CDN + "firebase-auth-compat.js"),
      typeof window.firebase.firestore === "function" ? Promise.resolve() : loadScript(CDN + "firebase-firestore-compat.js")
    ]);
    if (!window.firebase) throw new Error("Firebase SDK unavailable");

    if (!firebase.apps.length) firebase.initializeApp(window.ARISE_FIREBASE_CONFIG);
    auth = firebase.auth();
    db = firebase.firestore();

    try {
      if (auth.setPersistence && firebase.auth.Auth && firebase.auth.Auth.Persistence) {
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      }
    } catch (err) {
      console.warn("ARISE: Firebase persistence unavailable", err);
    }

    let pendingRedirect = false;
    try {
      pendingRedirect = sessionStorage.getItem("arise:authRedirectPending") === "1";
      if (pendingRedirect) sessionStorage.removeItem("arise:authRedirectPending");
    } catch (err) {
      /* sessionStorage unavailable; continue without the pending check */
    }

    restoringSession = true;
    render();

    let signedInFromRedirect = false;
    let redirectFailed = false;
    try {
      const result = await auth.getRedirectResult();
      if (result && result.user) {
        signedInFromRedirect = true;
        UI.toast("success", "GOOGLE LINKED", "Cloud Link connected to " + (result.user.email || result.user.uid) + ".");
      }
    } catch (err) {
      redirectFailed = true;
      handleCloudError("GOOGLE SIGN-IN FAILED", err, true);
    } finally {
      restoringSession = false;
    }

    if (pendingRedirect && !redirectFailed && !signedInFromRedirect && !auth.currentUser) {
      const err = new Error("Google sign-in did not return a session.");
      err.code = "auth/session-lost";
      handleCloudError("GOOGLE SIGN-IN INCOMPLETE", err, true);
    }

    auth.onAuthStateChanged(onAuthChange);
    render();
  }

  function onAuthChange(nextUser) {
    user = nextUser || null;
    const state = ctx.getState();
    const c = ensure(state);
    const previousUid = c.uid;

    if (user && previousUid && previousUid !== user.uid) {
      c.lastSyncAt = null;
      c.remoteUpdatedAt = null;
      c.dirty = true;
      reconciled = false;
    }

    c.uid = user ? user.uid : null;
    c.email = user ? user.email || null : null;
    if (user) {
      c.lastError = null;
    } else {
      c.dirty = false;
      reconciled = false;
      clearTimeout(syncTimer);
    }
    D.saveState(state);
    render();
    if (user && !reconciled) {
      reconciled = true;
      reconcile().catch((err) => handleCloudError("CLOUD LINK ERROR", err, false));
    }
  }

  function metaRef() {
    return db.doc("users/" + user.uid + "/meta/cloud");
  }

  function revisionsRef() {
    return db.collection("users/" + user.uid + "/snapshots/revisions");
  }

  function revisionRef(id) {
    return db.doc("users/" + user.uid + "/snapshots/revisions/" + id);
  }

  function chunksRef(id) {
    return revisionRef(id).collection("chunks");
  }

  function chunkRef(id, index) {
    return chunksRef(id).doc(String(index).padStart(4, "0"));
  }

  function newRevisionId() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  async function getRemoteMeta() {
    if (!db || !user) return null;
    const snap = await metaRef().get();
    return snap.exists ? snap.data() : null;
  }

  function counts(state) {
    return {
      days: Object.keys(state.days || {}).length,
      sets: state.training && Array.isArray(state.training.logs) ? state.training.logs.length : 0
    };
  }

  function hasLocalData(state) {
    return Object.keys(state.days || {}).length > 0 ||
      !!(state.training && Array.isArray(state.training.logs) && state.training.logs.length);
  }

  function toBase64(bytes) {
    let binary = "";
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + step, bytes.length)));
    }
    return btoa(binary);
  }

  function fromBase64(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function hashBytes(bytes) {
    if (!window.crypto || !window.crypto.subtle || !window.crypto.subtle.digest) return null;
    try {
      const digest = await window.crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (err) {
      return null;
    }
  }

  async function pack(text) {
    if (typeof TextEncoder === "undefined") throw new Error("TextEncoder unavailable");
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > MAX_BYTES) throw new Error("Archive is too large for cloud sync.");

    const base64 = toBase64(bytes);
    const chunkCount = Math.max(1, Math.ceil(base64.length / CHUNK_CHARS));
    if (chunkCount > BATCH_LIMIT) throw new Error("Archive has too many chunks for cloud sync.");

    const chunks = [];
    for (let i = 0; i < chunkCount; i++) {
      chunks.push(base64.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS));
    }
    return {
      encoding: "json",
      bytes: bytes.length,
      checksum: await hashBytes(bytes),
      chunkCount,
      chunkSize: CHUNK_CHARS,
      chunks
    };
  }

  async function unpack(bytes, encoding, expectedChecksum) {
    if (expectedChecksum) {
      const actual = await hashBytes(bytes);
      if (actual && actual !== expectedChecksum) throw new Error("Cloud snapshot checksum mismatch.");
    }
    if (encoding && encoding !== "json") throw new Error("Unknown cloud snapshot format.");
    return new TextDecoder().decode(bytes);
  }

  async function writeChunks(revisionId, chunks) {
    let batch = db.batch();
    let pending = 0;
    for (let i = 0; i < chunks.length; i++) {
      batch.set(chunkRef(revisionId, i), { app: "ARISE", index: i, text: chunks[i] });
      pending++;
      if (pending >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
    if (pending) await batch.commit();
  }

  async function createRevision(packed, schemaVersion) {
    const id = newRevisionId();
    const now = Date.now();
    await writeChunks(id, packed.chunks);
    await revisionRef(id).set({
      app: "ARISE",
      id,
      createdAt: now,
      createdISO: new Date(now).toISOString(),
      encoding: packed.encoding,
      bytes: packed.bytes,
      checksum: packed.checksum,
      chunkCount: packed.chunkCount,
      chunkSize: packed.chunkSize,
      schemaVersion: schemaVersion || 1
    });
    return id;
  }

  async function deleteRevision(revisionId) {
    if (!revisionId) return;
    const snap = await chunksRef(revisionId).get();
    let batch = db.batch();
    let pending = 0;
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      pending++;
      if (pending >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
    if (pending) await batch.commit();
    await revisionRef(revisionId).delete().catch(() => null);
  }

  async function trimHistory(protectId) {
    if (!user || !db) return;
    const snap = await revisionsRef().orderBy("createdAt", "desc").limit(HISTORY_LIMIT + 25).get();
    const keep = snap.docs.slice(0, HISTORY_LIMIT).map((doc) => doc.id);
    const old = snap.docs.filter((doc) => keep.indexOf(doc.id) === -1 && doc.id !== protectId);
    for (const doc of old) {
      await deleteRevision(doc.id).catch(() => null);
    }
  }

  async function uploadToCloud(manual, overwrite) {
    if (!user || !db) {
      if (manual) UI.toast("warn", "SIGN IN REQUIRED", "Sign in with Google before syncing to the cloud.");
      return;
    }
    if (syncing) {
      if (manual) UI.toast("warn", "SYNC IN PROGRESS", "Wait for the current cloud sync to finish.");
      return;
    }

    const state = ctx.getState();
    const c = ensure(state);
    syncing = true;
    c.syncing = true;
    render();

    let pendingId = null;
    try {
      const meta = await getRemoteMeta();
      const remoteAt = Number(meta && meta.updatedAt) || 0;
      const localAt = Number(c.lastSyncAt) || 0;

      if (meta && meta.revisionId && remoteAt > localAt && !overwrite) {
        if (c.dirty) {
          showConflict(meta);
        } else {
          await downloadFromCloud(false, meta);
        }
        return;
      }

      const snapshotState = JSON.parse(JSON.stringify(state));
      snapshotState.cloud = Object.assign({}, snapshotState.cloud, {
        dirty: false,
        syncing: false,
        lastError: null
      });
      const text = JSON.stringify({
        app: "ARISE",
        version: state.version || 1,
        exportedAt: new Date().toISOString(),
        state: snapshotState
      });
      const packed = await pack(text);
      const now = Date.now();
      const n = counts(state);

      pendingId = await createRevision(packed, state.version || 1);
      await metaRef().set({
        uid: user.uid,
        email: user.email || null,
        updatedAt: now,
        updatedISO: new Date(now).toISOString(),
        revisionId: pendingId,
        revisionAt: now,
        encoding: packed.encoding,
        bytes: packed.bytes,
        checksum: packed.checksum,
        chunkCount: packed.chunkCount,
        days: n.days,
        sets: n.sets,
        app: "ARISE",
        schemaVersion: state.version || 1
      });
      pendingId = null;

      c.dirty = false;
      c.lastSyncAt = now;
      c.remoteUpdatedAt = now;
      c.lastError = null;
      if (manual) UI.toast("success", "CLOUD SYNCED", n.days + " days and " + n.sets + " sets uploaded.");
      trimHistory().catch(() => { /* best effort */ });
    } catch (err) {
      c.lastError = err && err.message ? err.message : "Upload failed.";
      UI.toast("error", "CLOUD SYNC FAILED", c.lastError);
      if (pendingId) deleteRevision(pendingId).catch(() => null);
    } finally {
      syncing = false;
      const current = ctx.getState();
      const currentCloud = ensure(current);
      currentCloud.syncing = false;
      D.saveState(current);
      render();
    }
  }

  async function downloadFromCloud(force, knownMeta) {
    if (!user || !db) {
      if (force) UI.toast("warn", "SIGN IN REQUIRED", "Sign in with Google before downloading cloud data.");
      return;
    }
    try {
      const meta = knownMeta || await getRemoteMeta();
      if (!meta || !meta.revisionId) {
        UI.toast("warn", "NO CLOUD ARCHIVE", "Nothing has been uploaded for this account yet.");
        return;
      }

      const revisionSnap = await revisionRef(meta.revisionId).get();
      const revision = revisionSnap.exists ? revisionSnap.data() : null;
      const info = Object.assign({}, meta, revision || {});
      const chunkCount = Number(info.chunkCount) || 0;
      if (!chunkCount || chunkCount > BATCH_LIMIT) throw new Error("Cloud snapshot metadata is invalid.");
      if (Number(info.bytes) > MAX_BYTES) throw new Error("Cloud snapshot is too large.");

      const parts = [];
      for (let i = 0; i < chunkCount; i++) {
        const chunkSnap = await chunkRef(meta.revisionId, i).get();
        const data = chunkSnap.exists ? chunkSnap.data() : null;
        if (!data || typeof data.text !== "string") throw new Error("Cloud snapshot is incomplete.");
        parts.push(data.text);
      }

      const bytes = fromBase64(parts.join(""));
      const text = await unpack(bytes, info.encoding || meta.encoding, info.checksum || meta.checksum);
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
    const syncedAt = Number(meta.updatedAt) || Date.now();
    c.uid = user ? user.uid : null;
    c.email = user ? user.email || null : null;
    c.lastSyncAt = syncedAt;
    c.remoteUpdatedAt = syncedAt;
    c.dirty = false;
    c.syncing = false;
    c.lastError = null;
    ctx.setState(restored);
    ctx.persist("cloud");
    UI.render(restored);
    UI.setView("status");
    UI.toast("success", "CLOUD ARCHIVE RESTORED", "This device now matches your latest Firestore snapshot.");
  }

  async function reconcile() {
    if (!user || !db) return;
    const state = ctx.getState();
    const c = ensure(state);
    const meta = await getRemoteMeta();

    if (!meta || !meta.revisionId) {
      c.remoteUpdatedAt = Number(meta && meta.updatedAt) || null;
      if (hasLocalData(state)) {
        await uploadToCloud(false, true);
        return;
      }
      D.saveState(state);
      render();
      return;
    }

    const remoteAt = Number(meta.updatedAt) || 0;
    const localAt = Number(c.lastSyncAt) || 0;
    const localDirty = !!c.dirty;
    c.remoteUpdatedAt = remoteAt;

    if (remoteAt > localAt) {
      if (localDirty) {
        showConflict(meta);
      } else {
        await downloadFromCloud(false, meta);
        return;
      }
    } else if (localDirty) {
      await uploadToCloud(false);
      return;
    } else {
      c.dirty = false;
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
        { label: "UPLOAD DEVICE", onClick: () => uploadToCloud(true, true) },
        {
          label: "USE CLOUD DATA",
          kind: "primary",
          onClick: () => downloadFromCloud(true, meta)
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

    const state = ctx.getState();
    const c = ensure(state);
    c.lastError = null;
    D.saveState(state);
    render();

    const btn = $("#cloudSignIn");
    const originalText = btn ? btn.textContent : "SIGN IN WITH GOOGLE";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "OPENING GOOGLE…";
    }
    const restore = () => {
      if (!btn) return;
      btn.disabled = false;
      btn.textContent = originalText;
    };
    const clearPending = () => {
      try { sessionStorage.removeItem("arise:authRedirectPending"); } catch (err) { /* ignore */ }
    };

    try {
      sessionStorage.setItem("arise:authRedirectPending", "1");
    } catch (err) {
      /* sessionStorage unavailable; continue without the pending check */
    }

    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const pending = auth.signInWithRedirect(provider);
      if (pending && typeof pending.catch === "function") {
        pending.catch((err) => {
          restore();
          clearPending();
          handleCloudError("SIGN IN FAILED", err, true);
        });
      }
      setTimeout(() => {
        restore();
        UI.toast("warn", "WAITING FOR GOOGLE", "Complete sign-in in the window that opened, then return here.");
      }, 5000);
    } catch (err) {
      restore();
      clearPending();
      handleCloudError("SIGN IN FAILED", err, true);
    }
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
    } else if (restoringSession && !user) {
      label = "RESTORING SIGN-IN";
      detail = "Checking your Google sign-in result…";
    } else if (user) {
      if (state.cloud.syncing) label = "SYNCING";
      else if (state.cloud.lastError) label = "SYNC ERROR";
      else if (state.cloud.dirty) label = "UNSYNCED CHANGES";
      else label = "CLOUD LINKED";
      detail = state.cloud.lastError || "Changes upload automatically about 15 seconds after you finish.";
    } else if (state.cloud.lastError) {
      label = "SIGN IN ERROR";
      detail = state.cloud.lastError;
    }

    status.textContent = label;
    if (chip) chip.classList.toggle("is-due", !!state.cloud.dirty || !!state.cloud.lastError);
    if (userEl) {
      userEl.textContent = user
        ? user.email || user.uid
        : state.cloud.lastError ? "SIGN IN ERROR" : "NOT LINKED";
    }
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
