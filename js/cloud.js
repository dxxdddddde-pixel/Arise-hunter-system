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
  let googleClientId = "";
  let googleReady = false;
  let googleChecked = false;
  let googlePromptTimer = null;
  const deviceId = "dev-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  let metaListener = null;
  let listenerPrimed = false;
  let merging = false;

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

  function getGoogleClientId() {
    const cfg = window.ARISE_FIREBASE_CONFIG || {};
    const id = String(cfg.googleClientId || "").trim();
    return id && !/^(YOUR|PASTE|ADD)_/i.test(id) ? id : "";
  }

  function waitForGoogleIdentity(timeoutMs) {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (window.google && window.google.accounts && window.google.accounts.id) {
          resolve(true);
          return;
        }
        if (Date.now() - started >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(tick, 100);
      };
      tick();
    });
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
    } else if (code === "auth/id-token-expired" || code === "auth/invalid-id-token" || code === "auth/invalid-credential") {
      hint = "The Google credential expired or was rejected. Try signing in again.";
    } else if (code === "auth/account-exists-with-different-credential") {
      hint = "That email is already linked to another sign-in method for this project.";
    } else if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      hint = "The Google window closed before sign-in finished. Try again.";
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
      stopMetaListener();
    }
    D.saveState(state);
    render();
    if (user) startMetaListener();
    if (user && !reconciled) {
      reconciled = true;
      reconcile().catch((err) => handleCloudError("CLOUD LINK ERROR", err, false));
    }
  }

  function metaRef() {
    return db.doc("users/" + user.uid + "/meta/cloud");
  }

  function revisionsRef() {
    return db.collection("users/" + user.uid + "/snapshots");
  }

  function revisionRef(id) {
    return db.doc("users/" + user.uid + "/snapshots/" + id);
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

  async function setRemoteMeta(data, expectedAt) {
    const payload = Object.assign({}, data, { originDeviceId: deviceId });
    try {
      if (typeof db.runTransaction !== "function") throw new Error("transactions unavailable");
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(metaRef());
        const currentAt = Number(snap.exists && snap.data() && snap.data().updatedAt) || 0;
        if (currentAt > Number(expectedAt || 0)) throw new Error("Cloud changed while syncing. Try again.");
        tx.set(metaRef(), payload);
      });
    } catch (err) {
      if (err && /Cloud changed while syncing/i.test(String(err.message || ""))) throw err;
      await metaRef().set(payload);
    }
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

  async function uploadToCloud(manual, overwrite, options) {
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
    let mergeMeta = null;
    try {
      const meta = await getRemoteMeta();
      const remoteAt = Number(meta && meta.updatedAt) || 0;
      const localAt = Number(c.lastSyncAt) || 0;

      if (meta && meta.revisionId && remoteAt > localAt && !overwrite) {
        // Release this upload slot before merging: the merge may upload the
        // combined snapshot itself.
        syncing = false;
        c.syncing = false;
        await mergeFromRemote(meta);
        return;
      }

      const snapshotState = JSON.parse(JSON.stringify(state));
      snapshotState.cloud = Object.assign({}, snapshotState.cloud, {
        uid: null,
        email: null,
        lastSyncAt: null,
        remoteUpdatedAt: null,
        dirty: false,
        syncing: false,
        lastError: null,
        deviceId: null
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
      const mergeSignature = (options && options.mergeSignature) ||
        (window.SystemMerge ? window.SystemMerge.signature(snapshotState) : "");
      await setRemoteMeta({
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
        mergeSignature,
        app: "ARISE",
        schemaVersion: state.version || 1
      }, remoteAt);
      pendingId = null;

      c.dirty = false;
      c.lastSyncAt = now;
      c.remoteUpdatedAt = now;
      c.lastError = null;
      if (manual) UI.toast("success", "CLOUD SYNCED", n.days + " days and " + n.sets + " sets uploaded.");
      trimHistory().catch(() => { /* best effort */ });
    } catch (err) {
      const message = err && err.message ? err.message : "Upload failed.";
      if (/Cloud changed while syncing/i.test(message)) {
        mergeMeta = await getRemoteMeta().catch(() => null);
      }
      c.lastError = mergeMeta ? null : message;
      if (!mergeMeta) UI.toast("error", "CLOUD SYNC FAILED", message);
      if (pendingId) deleteRevision(pendingId).catch(() => null);
    } finally {
      syncing = false;
      const current = ctx.getState();
      const currentCloud = ensure(current);
      currentCloud.syncing = false;
      D.saveState(current);
      render();
    }
    if (mergeMeta) mergeFromRemote(mergeMeta);
  }

  async function readRemoteState(meta) {
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
    return payload.state;
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
      applyRemote(await readRemoteState(meta), meta);
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

  async function mergeFromRemote(meta) {
    if (!user || !db || !window.SystemMerge || merging) return;
    merging = true;
    try {
      const remoteState = await readRemoteState(meta);
      const localState = ctx.getState();
      const result = window.SystemMerge.merge(localState, remoteState);
      const mergedSig = window.SystemMerge.signature(result.state);
      const localSig = window.SystemMerge.signature(localState);
      const remoteSig = String(meta.mergeSignature || "");
      const syncedAt = Number(meta.updatedAt) || Date.now();

      if (result.changed) {
        const mergedCloud = ensure(result.state);
        mergedCloud.uid = user ? user.uid : null;
        mergedCloud.email = user.email || null;
        mergedCloud.lastSyncAt = syncedAt;
        mergedCloud.remoteUpdatedAt = syncedAt;
        mergedCloud.dirty = false;
        mergedCloud.syncing = false;
        mergedCloud.lastError = null;
        ctx.setState(result.state);
        ctx.persist("cloud-merge");
        UI.render(result.state);
        UI.addLog(result.state, "good", "Cloud changes merged from another device.", "cloud-merge");
      } else {
        const c = ensure(localState);
        c.lastSyncAt = syncedAt;
        c.remoteUpdatedAt = syncedAt;
        ctx.persist("cloud");
        UI.render(localState);
      }

      if (remoteSig && mergedSig === remoteSig) return;
      if (result.changed || !remoteSig || localSig !== mergedSig) {
        await uploadToCloud(false, true, { mergeSignature: mergedSig });
      }
    } catch (err) {
      handleCloudError("CLOUD MERGE FAILED", err, false);
    } finally {
      merging = false;
      render();
    }
  }

  function startMetaListener() {
    if (!db || !user || metaListener) return;
    listenerPrimed = false;
    metaListener = metaRef().onSnapshot((snap) => {
      if (!snap.exists) return;
      const meta = snap.data();
      if (!listenerPrimed) {
        listenerPrimed = true;
        return;
      }
      if (meta && meta.originDeviceId === deviceId) return;
      const remoteAt = Number(meta && meta.updatedAt) || 0;
      const localAt = Number(ctx.getState().cloud && ctx.getState().cloud.lastSyncAt) || 0;
      if (remoteAt <= localAt) return;
      mergeFromRemote(meta);
    }, (err) => console.warn("ARISE: Cloud Link live listener unavailable", err));
  }

  function stopMetaListener() {
    if (metaListener) {
      try { metaListener(); } catch (err) { /* ignore */ }
      metaListener = null;
    }
    listenerPrimed = false;
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
      await mergeFromRemote(meta);
      return;
    } else if (localDirty) {
      await uploadToCloud(false);
      return;
    } else {
      c.dirty = false;
    }
    D.saveState(state);
    render();
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

  async function prepareGoogleSignIn() {
    googleClientId = getGoogleClientId();
    if (!googleClientId || !isConfigured()) {
      googleChecked = true;
      render();
      return;
    }

    const ready = await waitForGoogleIdentity(6000);
    if (!ready) {
      googleChecked = true;
      render();
      return;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential,
        ux_mode: "popup",
        itp_support: true,
        auto_select: false,
        cancel_on_tap_outside: true
      });
      googleReady = true;
    } catch (err) {
      console.warn("ARISE: Google Identity Services unavailable", err);
      googleReady = false;
    } finally {
      googleChecked = true;
      render();
    }
  }

  function mountGoogleButton() {
    const host = $("#cloudGoogleButton");
    if (!host || !googleReady || !auth || user) return;

    host.hidden = false;
    if (host.dataset.rendered === "1" && host.childElementCount) return;

    host.innerHTML = "";
    try {
      window.google.accounts.id.renderButton(host, {
        type: "standard",
        theme: "outline_dark",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: "300",
        state: "cloud-link",
        click_listener: () => {
          clearTimeout(googlePromptTimer);
          googlePromptTimer = setTimeout(() => {
            if (!user) UI.toast("warn", "WAITING FOR GOOGLE", "Finish the Google window, then return here.");
          }, 6000);
        }
      });
      host.dataset.rendered = "1";
    } catch (err) {
      host.hidden = true;
      googleReady = false;
      console.warn("ARISE: Google button render failed", err);
    }
  }

  async function handleGoogleCredential(response) {
    clearTimeout(googlePromptTimer);
    if (!response || !response.credential) {
      handleCloudError("GOOGLE SIGN-IN FAILED", new Error("Google did not return a credential."), true);
      return;
    }
    if (!auth) {
      handleCloudError("GOOGLE SIGN-IN FAILED", new Error("Firebase is not ready yet. Try again."), true);
      return;
    }

    const state = ctx.getState();
    ensure(state).lastError = null;
    D.saveState(state);
    render();

    try {
      const credential = firebase.auth.GoogleAuthProvider.credential(response.credential);
      const result = await auth.signInWithCredential(credential);
      const signedIn = (result && result.user) || auth.currentUser;
      UI.toast("success", "GOOGLE LINKED", "Cloud Link connected to " +
        ((signedIn && (signedIn.email || signedIn.uid)) || "your Google account") + ".");
    } catch (err) {
      handleCloudError("GOOGLE SIGN-IN FAILED", err, true);
    }
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
        {
          label: "SIGN OUT",
          kind: "danger",
          onClick: () => {
            clearTimeout(googlePromptTimer);
            if (googleReady && window.google && window.google.accounts && window.google.accounts.id &&
                typeof window.google.accounts.id.disableAutoSelect === "function") {
              try { window.google.accounts.id.disableAutoSelect(); } catch (err) { /* ignore */ }
            }
            if (auth) auth.signOut();
          }
        }
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
    } else if (!googleChecked && !user) {
      label = "PREPARING SIGN-IN";
      detail = "Loading Google sign-in…";
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
    const googleBtn = $("#cloudGoogleButton");
    const useGoogleButton = !!auth && googleReady;
    const showFallback = configured && !!auth && !user && googleChecked && !useGoogleButton;

    if (signInBtn) signInBtn.hidden = !showFallback;
    if (signOutBtn) signOutBtn.hidden = !user;
    if (googleBtn) {
      googleBtn.hidden = !!user || !useGoogleButton;
      if (!googleBtn.hidden) mountGoogleButton();
    }
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
      const source = e.detail && e.detail.source ? String(e.detail.source) : "local";
      const silent = ["cloud", "cloud-merge", "reminder", "view"];
      if (silent.indexOf(source) === -1) markDirty();
    });
    window.addEventListener("online", () => {
      if (user && ctx.getState().cloud.dirty) syncNow(false);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && user && ctx.getState().cloud.dirty) syncNow(false);
    });
    initFirebase()
      .catch((err) => {
        const state = ctx.getState();
        const c = ensure(state);
        c.lastError = err && err.message ? err.message : "Firebase setup failed.";
        D.saveState(state);
        render();
        UI.toast("warn", "CLOUD LINK OFFLINE", c.lastError);
      })
      .then(() => prepareGoogleSignIn())
      .catch((err) => console.warn("ARISE: Google sign-in setup failed", err));
  }

  window.SystemCloud = { mount, render, syncNow, downloadFromCloud, uploadToCloud };
})();
