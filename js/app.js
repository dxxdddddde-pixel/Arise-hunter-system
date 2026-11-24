/* =========================================================
   ARISE // application controller
   ========================================================= */
(function () {
  "use strict";

  const D = window.SystemData;
  const UI = window.SystemUI;
  const T = window.SystemTraining;
  const B = window.SystemBody;
  const C = window.SystemCloud;
  const H = window.SystemHealth;
  const $ = (sel) => document.querySelector(sel);
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  let state = D.loadState();
  let busy = false;
  let audioCtx = null;
  let booted = false;

  const VIEWS = ["status", "gates", "quests", "training", "body", "army", "link"];

  /* ---------------------------------------------------------
     audio
     --------------------------------------------------------- */
  function ensureAudio() {
    if (!state.sound) return null;
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { audioCtx = new AC(); } catch (err) { return null; }
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function tone(freq, when, dur, type, gain) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime + (when || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.025, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  const sfx = {
    tick() { if (state.sound) tone(880, 0, 0.035, "triangle", 0.009); },
    confirm() { if (state.sound) { tone(660, 0, 0.07, "sine", 0.03); tone(990, 0.06, 0.12, "sine", 0.025); } },
    claim() { if (state.sound) { tone(523, 0, 0.1, "triangle", 0.025); tone(784, 0.08, 0.16, "triangle", 0.025); } },
    error() { if (state.sound) { tone(180, 0, 0.18, "sawtooth", 0.02); tone(140, 0.12, 0.22, "sawtooth", 0.018); } },
    fanfare() {
      if (!state.sound) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.13, 0.55, "triangle", 0.024));
      tone(261.63, 0, 0.8, "sine", 0.02);
    }
  };

  /* ---------------------------------------------------------
     particles
     --------------------------------------------------------- */
  function startParticles() {
    const canvas = $("#fx");
    if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let particles = [];

    function build() {
      const count = Math.min(64, Math.round(w / 24));
      particles = [];
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.5 + 0.4,
          vy: -(Math.random() * 0.22 + 0.05),
          vx: (Math.random() - 0.5) * 0.16,
          a: Math.random() * 0.4 + 0.12,
          phase: Math.random() * Math.PI * 2
        });
      }
    }

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    function frame(t) {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.y += p.vy;
        p.x += p.vx;
        if (p.y < -8) { p.y = h + 8; p.x = Math.random() * w; }
        if (p.x < -8) p.x = w + 8;
        if (p.x > w + 8) p.x = -8;
        const alpha = p.a * (0.65 + 0.35 * Math.sin(t / 1700 + p.phase));
        ctx.beginPath();
        ctx.fillStyle = "rgba(110, 215, 255, " + alpha.toFixed(3) + ")";
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener("resize", resize);
    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------
     boot
     --------------------------------------------------------- */
  function bootSequence() {
    if (booted) return;
    booted = true;
    const el = $("#boot");
    if (!el) return;

    let skipped = false;
    try {
      skipped = sessionStorage.getItem("arise-booted") === "1";
      sessionStorage.setItem("arise-booted", "1");
    } catch (err) { /* private mode */ }

    if (skipped) {
      el.classList.add("is-done");
      setTimeout(() => el.remove(), 800);
      return;
    }

    const hasData = Object.keys(state.days).length > 0;
    const lines = [
      "SYSTEM CORE ONLINE",
      "HUNTER SIGNATURE VERIFIED",
      hasData ? "BIOMETRIC ARCHIVE RESTORED" : "BIOMETRIC ARCHIVE: AWAITING SYNC",
      "STATUS WINDOW READY"
    ];
    const log = $("#bootLog");
    const bar = $("#bootBar");
    let i = 0;

    const step = () => {
      if (i >= lines.length) {
        bar.style.width = "100%";
        setTimeout(() => {
          el.classList.add("is-done");
          el.setAttribute("aria-hidden", "true");
          setTimeout(() => el.remove(), 800);
        }, 440);
        clearInterval(timer);
        return;
      }
      const row = document.createElement("div");
      row.textContent = lines[i];
      log.appendChild(row);
      i++;
      bar.style.width = Math.round((i / lines.length) * 100) + "%";
    };

    const timer = setInterval(step, 330);
    step();
  }

  /* ---------------------------------------------------------
     persistence + level up
     --------------------------------------------------------- */
  function persist(source) {
    const ok = D.saveState(state);
    if (!ok) {
      UI.toast("error", "SAVE FAILED", "Browser storage is full. Export a backup and purge older data.");
    } else {
      window.dispatchEvent(new CustomEvent("arise:state-changed", {
        detail: { source: source || "local", at: Date.now() }
      }));
    }
    return ok;
  }

  /* Apply a live snapshot from Google Health through the shared import pipeline. */
  function applyLiveSnapshot(snapshot) {
    let result;
    try {
      result = D.buildLiveResult(snapshot);
    } catch (err) {
      console.error("ARISE live snapshot failed", err);
      UI.toast("error", "SNAPSHOT FAILED", err && err.message ? err.message : "The live source returned an unreadable snapshot.");
      return false;
    }
    if (!Object.keys(result.days).length && !result.workouts.length) {
      UI.toast("warn", "NO NEW DATA", "Google Health has no records for the requested window yet.");
      return false;
    }
    if (Object.keys(state.days).length > 0) {
      askReplace(result, (incoming) => commitResult(incoming, false, true));
      return false;
    }
    return commitResult(result, false, true);
  }

  function levelUpIfNeeded(before, sourceText) {
    const info = D.levelInfo(D.totalXp(state));
    if (info.level <= before) return false;
    const newShadows = D.SHADOWS.filter((s) => s.level > before && s.level <= info.level);
    setTimeout(() => {
      UI.showLevelUp(info, newShadows);
      sfx.fanfare();
    }, 520);
    UI.addLog(state, "good", "Level up — LV. " + info.level + " " + info.rank.name + " reached" + (sourceText ? " via " + sourceText : "") + ".");
    return true;
  }

  /* ---------------------------------------------------------
     import pipeline
     --------------------------------------------------------- */
  function summarize(result) {
    const m = result.meta;
    const range = m.rangeStart
      ? D.fmtShort(m.rangeStart) + (m.rangeEnd && m.rangeEnd !== m.rangeStart ? " – " + D.fmtFull(m.rangeEnd) : " " + D.fmtFull(m.rangeStart).split(" ").pop())
      : "unknown range";
    return { range, text: m.days + " days · " + m.workouts + " gates · " + range };
  }

  function askReplace(result, onConfirm) {
    const oldDays = Object.keys(state.days).length;
    const oldGates = (state.workouts || []).length;
    const summary = summarize(result);
    const confirm = typeof onConfirm === "function" ? onConfirm : (incoming) => commitResult(incoming, false);
    UI.openModal({
      title: "Replace Active Archive?",
      body: `<p>An existing archive holds <strong>${oldDays} days</strong> and <strong>${oldGates} gates</strong>.</p>
             <p>The incoming archive <strong>${UI.escape(result.meta.filename || "health archive")}</strong> contains <strong>${summary.text}</strong>.</p>
             <p>Importing will overwrite movement, sleep and workout history. Your hunter identity, claimed quest XP and preferences are preserved.</p>`,
      actions: [
        { label: "CANCEL" },
        { label: "REPLACE ARCHIVE", kind: "primary", onClick: () => { confirm(result); } }
      ]
    });
  }

  function commitResult(result, demo, live) {
    const before = D.levelInfo(D.totalXp(state)).level;
    state = D.applyImport(state, result);
    persist();
    UI.render(state);
    UI.setView("status");
    const summary = summarize(result);
    const source = String(result.meta.source || "Health archive");
    const label = demo ? "SIMULATION LOADED" : live ? source.toUpperCase() + " SYNCED" : "ARCHIVE SYNCED";
    UI.toast("success", label, summary.text + (demo ? " · demo data" : ""));
    UI.addLog(
      state,
      "good",
      (demo ? "Demo archive loaded" : live ? source + " live sync" : source + " archive synced") +
        ": " + result.meta.days + " days, " + result.meta.workouts + " gates, " + result.meta.records + " records."
    );
    if (live && H && typeof H.markSynced === "function") H.markSynced(state.cloud && state.cloud.email);
    sfx.confirm();
    levelUpIfNeeded(before, demo ? "simulation" : live ? source : "sync");
    return true;
  }

  async function runDemo() {
    if (busy) return;
    busy = true;
    UI.working(true, "SIMULATING WATCH ARCHIVE");
    await delay(160);
    try {
      const result = D.generateDemo();
      result.meta.records = 38740;
      UI.working(false);
      commitResult(result, true);
    } catch (err) {
      console.error("ARISE demo failed", err);
      UI.working(false);
      sfx.error();
      UI.toast("error", "SIMULATION FAILED", err.message || "Could not generate the demo archive.");
    } finally {
      busy = false;
    }
  }

  function startDemo() {
    if (Object.keys(state.days).length > 0) {
      UI.openModal({
        title: "Load Simulated Archive?",
        body: `<p>This loads 40 days of realistic health data so you can preview the full interface.</p>
               <p>Your current archive will be <strong>replaced</strong>. Identity and quest bonuses are preserved. You can sync your Google Health data at any time.</p>`,
        actions: [
          { label: "CANCEL" },
          { label: "LOAD DEMO", kind: "primary", onClick: () => runDemo() }
        ]
      });
      return;
    }
    runDemo();
  }

  /* ---------------------------------------------------------
     quests
     --------------------------------------------------------- */
  function claimQuest(type, id) {
    const dash = D.computeDashboard(state);
    const list = type === "weekly" ? dash.quests.weekly : dash.quests.daily;
    const quest = list.find((q) => q.id === id);
    if (!quest || !quest.complete || quest.claimed) return;

    const before = D.levelInfo(D.totalXp(state)).level;
    state.claimed[D.questKey(quest)] = true;
    state.bonusXp = (state.bonusXp || 0) + quest.xp;
    persist();
    UI.render(state);
    UI.toast("success", "QUEST CLAIMED", "+" + quest.xp + " XP · " + quest.title);
    UI.addLog(state, "good", "Directive claimed: " + quest.title + " (+" + quest.xp + " XP).");
    sfx.claim();
    levelUpIfNeeded(before, "quest clearance");
  }

  /* ---------------------------------------------------------
     identity / purge / backup
     --------------------------------------------------------- */
  function editName() {
    UI.openModal({
      title: "Edit Hunter Identifier",
      body: `<p>The System will address you by this designation.</p>
             <input class="modal-input" id="nameInput" maxlength="22" value="${UI.escape(state.hunter.name || "")}" aria-label="Hunter name" />`,
      actions: [
        { label: "CANCEL" },
        {
          label: "SAVE IDENTIFIER",
          kind: "primary",
          onClick: (overlay) => {
            const input = overlay.querySelector("#nameInput");
            const value = (input && input.value ? input.value : "").trim().toUpperCase();
            if (!value) {
              UI.toast("warn", "INVALID IDENTIFIER", "The System requires a name.");
              return true;
            }
            state.hunter.name = value.slice(0, 22);
            persist();
            UI.render(state);
            UI.toast("success", "IDENTITY UPDATED", "The System will now address you as " + state.hunter.name + ".");
            UI.addLog(state, "good", "Hunter identifier updated to " + state.hunter.name + ".");
            sfx.confirm();
          }
        }
      ]
    });

    setTimeout(() => {
      const input = $("#nameInput");
      if (!input) return;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const btn = $("#modalActions .btn-primary");
          if (btn) btn.click();
        }
      });
    }, 80);
  }

  function purgeData() {
    const days = Object.keys(state.days).length;
    UI.openModal({
      title: "Purge Hunter Archive?",
      body: `<p>This deletes <strong>${days} days</strong> of metrics and <strong>${(state.workouts || []).length} gates</strong>, along with quest claims and local history.</p>
             <p>Your identifier, audio preference, Training Grounds protocol, Body Log records and link settings are retained. This cannot be undone — export a backup first if you need one.</p>`,
      actions: [
        { label: "CANCEL" },
        {
          label: "PURGE ARCHIVE",
          kind: "danger",
          onClick: () => {
            const name = state.hunter.name;
            const sound = state.sound;
            const training = state.training;
            const body = state.body;
            const strength = state.strength;
            const cloud = state.cloud;
            const health = state.health;
            state = D.defaultState();
            state.hunter.name = name;
            state.sound = sound;
            state.training = training;
            state.body = body;
            state.strength = strength;
            state.cloud = cloud;
            state.health = health;
            state.logs = [];
            D.saveState(state);
            UI.render(state);
            UI.setView("status");
            UI.toast("warn", "ARCHIVE PURGED", "The status window has been reset. Awaiting a new sync.");
            UI.addLog(state, "bad", "Hunter archive purged by operator.");
            sfx.error();
          }
        }
      ]
    });
  }

  function exportBackup() {
    if (!Object.keys(state.days).length) {
      UI.toast("warn", "NOTHING TO EXPORT", "Sync an archive before creating a backup.");
      return;
    }
    try {
      const payload = { app: "ARISE", version: state.version, exportedAt: new Date().toISOString(), state };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "arise-hunter-backup-" + D.todayKey() + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      UI.toast("success", "BACKUP CREATED", "Your hunter archive was exported as JSON.");
      UI.addLog(state, "good", "Hunter backup exported.");
    } catch (err) {
      UI.toast("error", "EXPORT FAILED", "The browser blocked the download.");
    }
  }

  function importBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => UI.toast("error", "READ FAILED", "The System could not open that backup file.");
    reader.onload = () => {
      let next;
      try {
        const payload = JSON.parse(String(reader.result || ""));
        next = payload && typeof payload === "object" && payload.state ? payload.state : payload;
      } catch (err) {
        UI.toast("error", "INVALID BACKUP", "This is not a valid ARISE JSON backup.");
        return;
      }
      if (!next || typeof next !== "object" || !(next.days || next.training || next.body || next.strength)) {
        UI.toast("error", "INVALID BACKUP", "No ARISE archive was found in that file.");
        return;
      }
      const restored = D.normalizeState(next);
      const dayCount = Object.keys(restored.days).length;
      const logCount = restored.training && Array.isArray(restored.training.logs) ? restored.training.logs.length : 0;
      UI.openModal({
        title: "Restore Hunter Archive?",
        body: `<p>This replaces the current archive with <strong>${dayCount} days</strong> of metrics,
               <strong>${logCount}</strong> logged sets and all Body Log records from the backup.</p>
               <p>Your current local data will be overwritten. Export a backup first if you need to keep it.</p>`,
        actions: [
          { label: "CANCEL" },
          {
            label: "RESTORE ARCHIVE",
            kind: "danger",
            onClick: () => {
              state = restored;
              persist();
              UI.render(state);
              UI.setView("status");
              UI.toast("success", "ARCHIVE RESTORED", dayCount + " days recovered from the backup.");
              UI.addLog(state, "good", "Hunter archive restored from JSON backup: " + dayCount + " days.");
              sfx.confirm();
            }
          }
        ]
      });
    };
    reader.readAsText(file);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    const secure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (!secure) return;
    navigator.serviceWorker.register("./sw.js", { scope: "./" })
      .catch((err) => console.info("ARISE: offline cache unavailable", err));
  }

  /* ---------------------------------------------------------
     viewport lock (installed iPhone app)
     --------------------------------------------------------- */
  function lockViewport() {
    const cancel = (e) => {
      if (e && e.cancelable) e.preventDefault();
    };

    /* Safari proprietary pinch gestures. */
    ["gesturestart", "gesturechange", "gestureend"].forEach((type) => {
      document.addEventListener(type, cancel, { passive: false });
    });

    /* Multi-touch pinch on browsers that use touch events. */
    document.addEventListener("touchmove", (e) => {
      if (e.touches && e.touches.length > 1) cancel(e);
    }, { passive: false });

    /* Double-tap zoom. */
    document.addEventListener("dblclick", cancel, { passive: false });
  }

  /* ---------------------------------------------------------
     events
     --------------------------------------------------------- */
  function bindEvents() {
    document.addEventListener("click", (e) => {
      if (e.target.closest("#mobileMore")) {
        UI.toggleMobileSheet();
        sfx.tick();
        return;
      }
      if (e.target.closest("#mobileSheetClose") || e.target.closest("#mobileSheetScrim")) {
        UI.closeMobileSheet();
        return;
      }

      const viewBtn = e.target.closest("[data-view]");
      if (viewBtn && VIEWS.indexOf(viewBtn.dataset.view) !== -1) {
        UI.setView(viewBtn.dataset.view);
        sfx.tick();
        return;
      }

      const claim = e.target.closest("[data-claim]");
      if (claim) {
        e.preventDefault();
        const parts = claim.dataset.claim.split(":");
        claimQuest(parts[0], parts[1]);
        return;
      }

      const btn = e.target.closest("button");
      if (btn) sfx.tick();
    });

    $("#backupInput").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (file) importBackup(file);
    });

    $("#syncBtn").addEventListener("click", () => {
      UI.setView("link");
      if (H) H.sync();
    });

    $("#demoBtn").addEventListener("click", startDemo);
    $("#emptyDemo").addEventListener("click", startDemo);
    $("#emptySync").addEventListener("click", () => {
      UI.setView("link");
      if (H) H.sync();
    });

    $("#gateFilters").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-filter]");
      if (!btn) return;
      UI.setGateFilter(state, btn.dataset.filter);
    });

    $("#soundToggle").addEventListener("click", () => {
      state.sound = !state.sound;
      persist();
      updateSoundButton();
      if (state.sound) sfx.confirm();
      UI.toast(state.sound ? "success" : "warn", "AUDIO " + (state.sound ? "ENABLED" : "MUTED"), state.sound ? "System feedback online." : "System feedback silenced.");
      UI.addLog(state, "", "System audio " + (state.sound ? "enabled" : "muted") + ".");
    });

    $("#editName").addEventListener("click", editName);
    $("#clearData").addEventListener("click", purgeData);
    $("#exportData").addEventListener("click", exportBackup);
    $("#importBackup").addEventListener("click", () => $("#backupInput").click());

    $("#luClose").addEventListener("click", () => {
      UI.hideLevelUp();
      sfx.tick();
    });

    $("#modalClose").addEventListener("click", () => UI.closeModal());
    $("#modal").addEventListener("click", (e) => {
      if (e.target.id === "modal") UI.closeModal();
    });

    document.addEventListener("keydown", (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement ? document.activeElement.tagName : "");
      if (e.key === "Escape") {
        if ($("#modal").classList.contains("is-open")) UI.closeModal();
        else if ($("#levelup").classList.contains("is-open")) UI.hideLevelUp();
        else if ($("#mobileSheet").classList.contains("is-open")) UI.closeMobileSheet();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[1-7]$/.test(e.key)) {
        UI.setView(VIEWS[Number(e.key) - 1]);
        sfx.tick();
      }
    });

    window.addEventListener("hashchange", () => {
      const view = (location.hash || "").replace(/^#/, "");
      if (VIEWS.indexOf(view) !== -1) UI.setView(view);
    });

    window.addEventListener("resize", () => {
      /* purely cosmetic; particles handle their own resize */
    });
  }

  function updateSoundButton() {
    const btn = $("#soundToggle");
    if (!btn) return;
    btn.classList.toggle("is-muted", !state.sound);
    btn.title = state.sound ? "Mute system audio" : "Enable system audio";
  }

  /* ---------------------------------------------------------
     init
     --------------------------------------------------------- */
  function seedLog() {
    if (!Array.isArray(state.logs)) state.logs = [];
    if (state.logs.length) return;
    const hasData = Object.keys(state.days).length > 0;
    state.logs = [{
      at: new Date().toISOString(),
      type: hasData ? "good" : "",
      msg: hasData ? "Archive restored. Status window recalculated." : "System online. Awaiting a biometric archive."
    }];
    D.saveState(state);
  }

  function init() {
    seedLog();
    updateSoundButton();
    const moduleContext = {
      getState: () => state,
      setState: (next) => { state = next; },
      commit: () => { persist(); UI.render(state); },
      persist: (source) => persist(source),
      render: () => UI.render(state),
      applySnapshot: applyLiveSnapshot,
      sfx: () => sfx.confirm()
    };
    if (T) T.mount(moduleContext);
    if (B) B.mount(moduleContext);
    if (C) C.mount(moduleContext);
    if (H) H.mount(moduleContext);
    UI.render(state);
    persist();
    bindEvents();
    lockViewport();

    const hash = (location.hash || "").replace(/^#/, "");
    if (VIEWS.indexOf(hash) !== -1) UI.setView(hash);

    bootSequence();
    startParticles();
    setInterval(UI.renderClock, 30000);
    registerServiceWorker();

    if (!Object.keys(state.days).length) {
      setTimeout(() => {
        UI.toast("warn", "AWAITING SYNC", "Connect Google Health or load a demo archive to begin.");
      }, 2200);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
