/* =========================================================
   ARISE // UI renderer
   ========================================================= */
(function () {
  "use strict";

  const D = window.SystemData;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));

  const CIRC = 326.73;
  let gateFilter = "week";
  let currentView = "status";

  const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  /* ---------------------------------------------------------
     small view helpers
     --------------------------------------------------------- */
  function ring(el, value, max) {
    if (!el) return;
    if (value === null || value === undefined) {
      el.style.strokeDashoffset = String(CIRC);
      return;
    }
    const pct = Math.max(0, Math.min(1, value / max));
    el.style.strokeDashoffset = String(CIRC * (1 - pct));
  }

  function sparkline(values, color, max) {
    const nums = (values || []).map((v) => (v === null || v === undefined ? null : Number(v)));
    const w = 120;
    const h = 30;
    const pad = 3;
    const n = nums.length || 1;
    const high = max || Math.max.apply(null, nums.filter((v) => v !== null).concat([1]));
    const x = (i) => (n === 1 ? w / 2 : (i / (n - 1)) * w);
    const y = (v) => h - pad - (Math.max(0, Math.min(high, v)) / high) * (h - pad * 2);

    let segments = [];
    let cur = [];
    nums.forEach((v, i) => {
      if (v === null) {
        if (cur.length) segments.push(cur);
        cur = [];
      } else {
        cur.push([x(i), y(v)]);
      }
    });
    if (cur.length) segments.push(cur);

    const lines = segments
      .map((seg) => {
        const pts = seg.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
        let out = `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>`;
        if (seg.length > 1) {
          const area = `M${seg[0][0].toFixed(1)},${h} L${pts.replace(/ /g, " L")} L${seg[seg.length - 1][0].toFixed(1)},${h} Z`;
          out = `<path d="${area}" fill="${color}" fill-opacity=".08"/>` + out;
        }
        const last = seg[seg.length - 1];
        out += `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="1.8" fill="${color}"/>`;
        return out;
      })
      .join("");

    const baseline = `<line x1="0" y1="${h - 0.5}" x2="${w}" y2="${h - 0.5}" stroke="rgba(120,180,240,.14)" stroke-width="1"/>`;
    if (!segments.length) {
      return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${baseline}<line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="${color}" stroke-opacity=".25" stroke-dasharray="3 4"/></svg>`;
    }
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${baseline}${lines}</svg>`;
  }

  function radarSVG(stats) {
    const cx = 130;
    const cy = 104;
    const r = 64;
    const keys = ["STR", "AGI", "VIT", "INT", "PER"];
    const labels = ["STR", "AGI", "VIT", "INT", "PER"];
    const angle = (i) => -Math.PI / 2 + (i * Math.PI * 2) / keys.length;
    const pt = (i, scale) => [
      cx + Math.cos(angle(i)) * r * scale,
      cy + Math.sin(angle(i)) * r * scale
    ];

    let grid = "";
    [0.25, 0.5, 0.75, 1].forEach((scale) => {
      const pts = keys.map((_, i) => pt(i, scale).map((n) => n.toFixed(1)).join(",")).join(" ");
      grid += `<polygon class="radar-grid" points="${pts}"/>`;
    });

    const axes = keys
      .map((_, i) => {
        const p = pt(i, 1);
        return `<line class="radar-axis" x1="${cx}" y1="${cy}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}"/>`;
      })
      .join("");

    const shapePts = keys
      .map((k, i) => {
        const p = pt(i, Math.max(0.06, (stats[k] || 0) / 100));
        return p.map((n) => n.toFixed(1)).join(",");
      })
      .join(" ");

    const dots = keys
      .map((k, i) => {
        const p = pt(i, Math.max(0.06, (stats[k] || 0) / 100));
        return `<circle class="radar-dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2"/>`;
      })
      .join("");

    const labelsOut = keys
      .map((k, i) => {
        const p = pt(i, 1.34);
        let anchor = "middle";
        if (p[0] > cx + 4) anchor = "start";
        else if (p[0] < cx - 4) anchor = "end";
        return `<text class="radar-label" x="${p[0].toFixed(1)}" y="${(p[1] + 3).toFixed(1)}" text-anchor="${anchor}">${labels[i]} <tspan class="radar-value">${stats[k]}</tspan></text>`;
      })
      .join("");

    return `<svg viewBox="0 0 260 220" role="img" aria-label="Hunter attribute chart">
      ${grid}${axes}
      <polygon class="radar-shape" points="${shapePts}"/>
      ${dots}${labelsOut}
    </svg>`;
  }

  /* ---------------------------------------------------------
     profile
     --------------------------------------------------------- */
  function renderProfile(state, dash) {
    const lvl = dash.level;
    const rank = lvl.rank;
    document.body.dataset.rank = rank.key;

    const nameEl = $("#hunterName");
    if (nameEl) nameEl.textContent = state.hunter.name || "UNKNOWN HUNTER";
    const lv = $("#levelNum");
    if (lv) lv.textContent = String(lvl.level);
    const letter = $("#rankLetter");
    if (letter) letter.textContent = rank.key;
    const rn = $("#rankName");
    if (rn) rn.textContent = rank.name;
    const xpFill = $("#xpFill");
    if (xpFill) xpFill.style.width = lvl.percent + "%";
    const xpText = $("#xpText");
    if (xpText) xpText.textContent = D.fmtNum(lvl.xpInLevel) + " / " + D.fmtNum(lvl.xpNeeded) + " XP";
    const xpPct = $("#xpPercent");
    if (xpPct) xpPct.textContent = lvl.percent + "%";

    const streak = $("#streakVal");
    if (streak) streak.textContent = String(dash.streak);
    const total = $("#totalXpVal");
    if (total) total.textContent = D.fmtNum(lvl.totalXp);

    const nextName = $("#nextRankName");
    if (nextName) nextName.textContent = rank.next || "APEX";
    const rankFill = $("#rankFill");
    if (rankFill) rankFill.style.width = Math.round(rank.progress * 100) + "%";
    const nextText = $("#nextRankText");
    if (nextText) {
      nextText.textContent = rank.nextLevel
        ? "Reach LV. " + rank.nextLevel + " to ascend to " + rank.nextName + "."
        : "The Monarch ceiling is yours. Continue to compound power.";
    }

    const left = Math.max(0, dash.quests.dailyAvailable - dash.quests.dailyDone);
    $$(".quest-badge").forEach((badge) => {
      badge.textContent = String(left);
      badge.style.display = left > 0 ? "" : "none";
    });

    const statCode = $("#statCode");
    if (statCode) statCode.textContent = "SYS-" + rank.key + String(lvl.level).padStart(2, "0");
  }

  /* ---------------------------------------------------------
     scores
     --------------------------------------------------------- */
  function renderScores(dash) {
    const day = dash.day || {};
    const s = dash.scores;

    // recovery
    ring($("#recoveryRing"), s.recovery, 100);
    $("#recoveryVal").textContent = s.recovery === null ? "--" : String(s.recovery);
    $("#cardRecovery").classList.toggle("is-empty", s.recovery === null);
    $("#recoveryTag").textContent =
      s.recovery === null ? "NO DATA" :
      s.recovery >= 80 ? "PRIME" :
      s.recovery >= 65 ? "OPTIMAL" :
      s.recovery >= 45 ? "MODERATE" : "DEPLETED";
    $("#recoveryDesc").textContent = s.recovery === null
      ? "Sync Google Health data to calculate recovery from sleep, heart rate and body temperature."
      : "HRV " + (day.hrv || "—") + " ms · resting HR " + (day.rhr || "—") + " bpm · sleep " + (day.sleepHours || 0) + "h.";
    $("#recoverySpark").innerHTML = sparkline(dash.series.recovery, "#54ffc1", 100);

    // strain
    ring($("#strainRing"), s.strain, 21);
    $("#strainVal").textContent = s.strain === null ? "--" : String(s.strain);
    $("#cardStrain").classList.toggle("is-empty", s.strain === null);
    $("#strainTag").textContent =
      s.strain === null ? "NO DATA" :
      s.strain >= 18 ? "OVERDRIVE" :
      s.strain >= 13 ? "HIGH" :
      s.strain >= 7 ? "MODERATE" : "LIGHT";
    $("#strainDesc").textContent = s.strain === null
      ? "Daily cardiovascular load from active energy, exercise minutes and gate activity."
      : D.fmtNum(day.activeEnergy || 0) + " kcal · " + (day.exerciseMinutes || 0) + " active min · " + dash.workoutsToday.length + " gate" + (dash.workoutsToday.length === 1 ? "" : "s") + ".";
    $("#strainSpark").innerHTML = sparkline(dash.series.strain, "#ff9a5c", 21);

    // sleep
    ring($("#sleepRing"), s.sleep, 100);
    $("#sleepVal").textContent = s.sleep === null ? "--" : String(s.sleep);
    $("#cardSleep").classList.toggle("is-empty", s.sleep === null);
    $("#sleepTag").textContent =
      s.sleep === null ? "NO DATA" :
      s.sleep >= 85 ? "EXCELLENT" :
      s.sleep >= 70 ? "RESTFUL" :
      s.sleep >= 50 ? "FAIR" : "POOR";
    $("#sleepDesc").textContent = s.sleep === null
      ? "Sleep debt, duration and stage balance from your watch's overnight readings."
      : (day.sleepHours || 0) + "h total · " + (day.deepHours || 0) + "h deep · " + (day.remHours || 0) + "h REM.";
    $("#sleepSpark").innerHTML = sparkline(dash.series.sleep, "#8a6bff", 100);
  }

  /* ---------------------------------------------------------
     stats + vitals
     --------------------------------------------------------- */
  function renderStats(dash) {
    const stats = dash.stats;
    $("#statRadar").innerHTML = radarSVG(stats);
    const names = { STR: "STRENGTH", AGI: "AGILITY", VIT: "VITALITY", INT: "INTELLECT", PER: "PERCEPTION" };
    $("#statBars").innerHTML = ["STR", "AGI", "VIT", "INT", "PER"].map((k) => `
      <div class="stat-row" title="${names[k]}">
        <span class="stat-name">${k}</span>
        <div class="stat-track"><i style="width:${stats[k]}%"></i></div>
        <span class="stat-val">${stats[k]}</span>
      </div>
    `).join("");
  }

  function renderVitals(dash) {
    const day = dash.day || {};
    const rows = {
      hrv: { value: day.hrv, unit: "ms", max: 120, fmt: (v) => Math.round(v) },
      rhr: { value: day.rhr, unit: "bpm", max: 100, fmt: (v) => Math.round(v) },
      sleep: { value: day.sleepHours, unit: "h", max: 9, fmt: (v) => v.toFixed(1) },
      energy: { value: day.activeEnergy, unit: "kcal", max: 1000, fmt: (v) => D.fmtNum(v) },
      steps: { value: day.steps, unit: "", max: 15000, fmt: (v) => D.fmtNum(v) },
      exercise: { value: day.exerciseMinutes, unit: "min", max: 90, fmt: (v) => Math.round(v) },
      resp: { value: day.respiratory, unit: "brpm", max: 25, fmt: (v) => v.toFixed(1) },
      vo2: { value: day.vo2max, unit: "ml/kg", max: 65, fmt: (v) => v.toFixed(1) }
    };

    $$("#vitals .vital").forEach((el) => {
      const key = el.dataset.metric;
      const cfg = rows[key];
      const strong = el.querySelector("strong");
      const bar = el.querySelector(".vital-bar i");
      if (!cfg || cfg.value === null || cfg.value === undefined || cfg.value === 0) {
        strong.innerHTML = "--";
        bar.style.width = "0%";
        return;
      }
      strong.innerHTML = cfg.fmt(cfg.value) + (cfg.unit ? " <em>" + cfg.unit + "</em>" : "");
      bar.style.width = Math.max(2, Math.min(100, (cfg.value / cfg.max) * 100)) + "%";
    });

    const vd = $("#vitalsDate");
    if (vd) vd.textContent = dash.activeKey === dash.today ? "TODAY" : D.fmtShort(dash.activeKey);
  }

  /* ---------------------------------------------------------
     heatmap + insights
     --------------------------------------------------------- */
  function renderHeatmap(dash) {
    $("#heatmap").innerHTML = dash.heat.map((cell) => {
      const title = D.fmtShort(cell.key) + " · " + D.fmtNum(cell.steps) + " steps";
      return `<div class="heat-cell${cell.isToday ? " is-today" : ""}${cell.isFuture ? " is-future" : ""}" data-level="${cell.level}" title="${esc(title)}"></div>`;
    }).join("");
  }

  function renderInsights(dash) {
    $("#insights").innerHTML = dash.insights.map((i) => {
      const mark = i.tone === "warn" ? "!" : i.tone === "good" ? "✓" : "◆";
      return `<div class="insight" data-tone="${i.tone || ""}">
        <span class="insight-mark">${mark}</span>
        <p>${i.text}</p>
      </div>`;
    }).join("");

    const recent = dash.workouts.slice(0, 4);
    if (!recent.length) {
      $("#recentGates").innerHTML = `<div class="recent-gates-title"><span class="eyebrow">RECENT CLEARANCE</span></div>
        <p class="empty-list">NO GATES CLEARED YET</p>`;
      return;
    }
    $("#recentGates").innerHTML = `<div class="recent-gates-title">
        <span class="eyebrow">RECENT CLEARANCE</span>
        <button class="link-btn" data-view="gates">VIEW ALL</button>
      </div>` + recent.map((w) => `<div class="recent-gate">
        <span class="mini-rank rank-${w.rank}">${w.rank}</span>
        <span class="recent-gate-name">${esc(w.name)}</span>
        <span class="recent-gate-xp">+${w.xp} XP</span>
      </div>`).join("");
  }

  /* ---------------------------------------------------------
     gates
     --------------------------------------------------------- */
  function gateCutoff(filter) {
    const today = D.todayKey();
    if (filter === "week") return D.keyAdd(today, -6);
    if (filter === "month") return D.keyAdd(today, -29);
    return "0000-00-00";
  }

  function renderGates(dash) {
    $$("#gateFilters button").forEach((b) => b.classList.toggle("is-active", b.dataset.filter === gateFilter));
    const cutoff = gateCutoff(gateFilter);
    const list = dash.workouts.filter((w) => w.date >= cutoff);

    $("#gatesCleared").textContent = String(list.length);
    $("#gatesLoad").textContent = String(Math.round(list.reduce((s, w) => s + (w.strain || 0), 0) * 10) / 10);
    const top = list.reduce((t, w) => ("EDCBAS".indexOf(w.rank) > "EDCBAS".indexOf(t) ? w.rank : t), "E");
    $("#gatesRank").textContent = list.length ? top : "--";
    const mins = list.reduce((s, w) => s + (w.duration || 0), 0);
    $("#gatesTime").textContent = mins >= 60 ? (mins / 60).toFixed(1) + "h" : mins + "m";
    $("#gateCount").textContent = list.length + " RECORDS";

    if (!list.length) {
      $("#gateList").innerHTML = `<div class="empty-list">NO GATES IN THIS WINDOW<br/><button class="btn btn-ghost btn-sm" data-view="link">SYNC GOOGLE HEALTH</button></div>`;
      return;
    }

    $("#gateList").innerHTML = list.map((w) => `
      <div class="gate-row">
        <div class="gate-badge rank-${w.rank}">${w.rank}</div>
        <div class="gate-info">
          <div class="gate-name">${esc(w.name)}</div>
          <div class="gate-meta">${D.fmtShort(w.date)} · ${esc(w.raw)}</div>
        </div>
        <div class="gate-stat gate-time"><strong>${Math.round(w.duration)}m</strong><span>duration</span></div>
        <div class="gate-stat gate-energy"><strong>${D.fmtNum(w.energy)}</strong><span>kcal</span></div>
        <div class="gate-xp">+${w.xp} XP</div>
        <div class="gate-cleared">CLEARED</div>
      </div>
    `).join("");
  }

  /* ---------------------------------------------------------
     quests
     --------------------------------------------------------- */
  function questValue(q) {
    const v = q.value || 0;
    if (!q.available) return "NO DATA";
    if (q.id === "steps" || q.id === "steps50") return D.fmtNum(v) + " / " + D.fmtNum(q.target);
    if (q.id === "sleep") return v.toFixed(1) + "h / " + q.target + "h";
    if (q.id === "recovery") return Math.round(v) + " / " + q.target;
    if (q.id === "recovery5") return Math.round(v) + " / " + q.target + " days";
    if (q.id === "exercise" || q.id === "move300") return Math.round(v) + " / " + q.target + " min";
    if (q.id === "gates5") return Math.round(v) + " / " + q.target;
    return Math.round(v) + " / " + q.target;
  }

  function questRow(q, index) {
    const cls = "quest" + (q.complete ? " is-done" : "") + (q.claimed ? " is-claimed" : "");
    let action;
    if (q.claimed) {
      action = `<span class="quest-reward">CLAIMED +${q.xp} XP</span>`;
    } else if (q.complete) {
      action = `<button class="quest-claim" data-claim="${q.type}:${q.id}">CLAIM +${q.xp}</button>`;
    } else {
      action = `<span class="quest-reward">+${q.xp} XP</span>`;
    }
    return `<div class="${cls}">
      <div class="quest-sigil">${String(index + 1).padStart(2, "0")}</div>
      <div class="quest-body">
        <div class="quest-title">${esc(q.title)}</div>
        <div class="quest-desc">${esc(q.desc)}</div>
        <div class="quest-progress">
          <div class="quest-track"><i style="width:${Math.round(q.progress * 100)}%"></i></div>
          <span class="quest-count">${questValue(q)}</span>
        </div>
      </div>
      ${action}
    </div>`;
  }

  function renderQuests(state, dash) {
    $("#dailyQuests").innerHTML = dash.quests.daily.map(questRow).join("");
    $("#weeklyQuests").innerHTML = dash.quests.weekly.map(questRow).join("");
    $("#dailyProgress").textContent = dash.quests.dailyDone + " / " + dash.quests.dailyAvailable;
    $("#weeklyProgress").textContent = dash.quests.weeklyDone + " / " + dash.quests.weeklyAvailable;
    $("#questStreak").textContent = String(dash.streak);
    $("#questClaimedXp").textContent = D.fmtNum(state.bonusXp || 0);
    $("#questMiniCount").textContent = dash.quests.dailyDone + " / " + dash.quests.dailyAvailable;

    $("#miniQuests").innerHTML = dash.quests.daily.map((q) => `
      <div class="mini-quest${q.complete ? " is-done" : ""}">
        <span class="mini-check"></span>
        <span class="mini-quest-title">${esc(q.title)}</span>
        <span class="mini-quest-val">${q.available ? (q.complete ? "CLEAR" : Math.min(99, Math.round(q.progress * 100)) + "%") : "—"}</span>
      </div>
    `).join("");
  }

  /* ---------------------------------------------------------
     army
     --------------------------------------------------------- */
  function renderArmy(dash) {
    const level = dash.level.level;
    const unlocked = D.SHADOWS.filter((s) => level >= s.level);
    $("#armyCount").textContent = unlocked.length + " / " + D.SHADOWS.length + " SUMMONED";
    $("#armyGrid").innerHTML = D.SHADOWS.map((s) => {
      const open = level >= s.level;
      return `<article class="shadow-card ${open ? "is-unlocked" : "is-locked"}">
        ${open ? "" : `<span class="shadow-lock">LOCKED</span>`}
        <div class="shadow-sigil"><span>${esc(s.sigil)}</span></div>
        <div class="shadow-name">${esc(s.name)}</div>
        <div class="shadow-epithet">${esc(s.epithet)}</div>
        <p class="shadow-role">${open ? esc(s.role) : "An unknown presence waits beyond your current limit."}</p>
        <div class="shadow-status">${open ? "BOUND TO YOUR SHADOW" : "REQUIRES LV. " + s.level}</div>
      </article>`;
    }).join("");
  }

  /* ---------------------------------------------------------
     link / connection
     --------------------------------------------------------- */
  function renderLink(state, dash) {
    const imp = state.lastImport;
    const health = window.SystemHealth ? window.SystemHealth.status() : null;
    const healthLive = !!(health && (health.authorized || health.lastSyncAt));
    const live = !!imp || healthLive;
    const chip = $("#linkChip");
    const syncChip = $("#syncChip");
    const stateEl = $("#linkState");
    const linkChipText = $("#linkChipText");
    const syncChipText = $("#syncChipText");
    const label = $("#linkLabel");

    [chip, syncChip, stateEl].forEach((el) => {
      if (el) el.classList.toggle("is-live", live);
    });
    if (linkChipText) {
      linkChipText.textContent = health && health.syncing ? "HEALTH SYNCING"
        : health && health.partial ? "PARTIAL HEALTH LINK"
        : healthLive ? "GOOGLE HEALTH LINK"
        : live ? "ARCHIVE LINKED" : "AWAITING SYNC";
    }
    if (syncChipText) {
      syncChipText.textContent = health && health.syncing ? "HEALTH SYNCING"
        : health && health.partial ? "PARTIAL HEALTH LINK"
        : healthLive ? "GOOGLE HEALTH LIVE"
        : live ? "ARCHIVE SYNCED" : "AWAITING SYNC";
    }
    if (label) {
      label.textContent = health && health.partial ? "PARTIAL HEALTH LINK"
        : healthLive ? "GOOGLE HEALTH LIVE"
        : live ? "ARCHIVE LINKED" : "SIGNAL LOST";
    }

    $("#linkStatusText").textContent = health && health.syncing ? "SYNCING"
      : health && health.lastError ? "ERROR"
      : health && health.authorized ? (health.partial ? "PARTIAL" : "LIVE")
      : health && health.lastSyncAt ? "LINKED"
      : live ? "SYNCED" : "STANDBY";
    $("#lastSyncText").textContent = D.fmtDateTime(state.lastSync);
    $("#linkSourceText").textContent = imp ? imp.source : healthLive ? "Google Health" : "—";
    $("#linkSourceText").title = imp ? imp.filename : "";
    $("#archiveRange").textContent = imp && imp.rangeStart && imp.rangeEnd
      ? (imp.rangeStart === imp.rangeEnd
        ? D.fmtFull(imp.rangeStart)
        : D.fmtShort(imp.rangeStart) + " — " + D.fmtFull(imp.rangeEnd))
      : "—";

    const bars = $(".signal-bars");
    if (bars) bars.classList.toggle("is-live", live);

    const status = $("#importStatus");
    if (status) {
      status.classList.toggle("is-live", live);
      if (health && health.lastError) {
        status.innerHTML = `<div class="import-status-mark">!</div><div>
             <strong>GOOGLE HEALTH ERROR</strong>
             <p>${esc(health.lastError)}</p>
           </div>`;
      } else if (health && health.authorized) {
        const autoNote = health.autoSync
          ? health.autoSyncPaused
            ? ` Auto-sync is paused (${esc(health.autoSyncPaused)}); press SYNC GOOGLE HEALTH to resume.`
            : " Auto-sync refreshes the archive every 15 minutes while this tab is open."
          : " Press SYNC GOOGLE HEALTH to refresh the archive.";
        status.innerHTML = `<div class="import-status-mark">✓</div><div>
             <strong>${health.partial ? "PARTIAL GOOGLE HEALTH LINK" : "GOOGLE HEALTH CONNECTED"}</strong>
             <p>Authorized for this browser session. ${health.partial ? "Some read scopes were not granted, so those metrics stay blank. " : ""}${autoNote}</p>
           </div>`;
      } else if (imp) {
        status.innerHTML = `<div class="import-status-mark">✓</div><div>
             <strong>ARCHIVE ACTIVE · ${imp.days} DAYS · ${imp.workouts} GATES</strong>
             <p>${esc(imp.filename || "health archive")} processed locally. Scores recalculated from ${D.fmtShort(imp.rangeStart || dash.activeKey)}${imp.rangeEnd ? " – " + D.fmtShort(imp.rangeEnd) : ""}.</p>
           </div>`;
      } else if (health && health.lastSyncAt) {
        const autoNote = health.autoSync
          ? health.autoSyncPaused
            ? ` Auto-sync is paused (${esc(health.autoSyncPaused)}). Press SYNC GOOGLE HEALTH to renew the session.`
            : " Auto-sync will resume after the next successful SYNC GOOGLE HEALTH."
          : " Press SYNC GOOGLE HEALTH to refresh your archive.";
        status.innerHTML = `<div class="import-status-mark">✓</div><div>
             <strong>GOOGLE HEALTH LINKED</strong>
             <p>Authorization is session-only.${autoNote}</p>
           </div>`;
      } else {
        status.innerHTML = `<div class="import-status-mark">!</div><div>
             <strong>NO ARCHIVE DETECTED</strong>
             <p>Connect Google Health and sync at least one day of data to initialize scores, stats and quests.</p>
           </div>`;
      }
    }

    const metrics = imp && imp.metrics ? imp.metrics : [];
    $("#detectedMetrics").innerHTML = metrics.length
      ? metrics.map((m) => `<span class="metric-chip"><i></i>${esc(D.METRIC_LABELS[m] || m)}</span>`).join("")
      : `<span class="metric-chip is-empty">NO METRICS DETECTED</span>`;

    const imports = state.imports || [];
    $("#importHistory").innerHTML = imports.length
      ? imports.map((h) => `<div class="history-item">
          <strong title="${esc(h.filename)}">${esc(h.filename)}</strong>
          <span>${D.fmtDateTime(h.at)}</span>
          <small>${esc(h.source)} · ${h.days} days · ${h.workouts} gates</small>
        </div>`).join("")
      : `<div class="history-empty">NO SYNC HISTORY ON RECORD</div>`;

    const banner = $("#emptyBanner");
    if (banner) banner.hidden = dash.hasData;
  }

  /* ---------------------------------------------------------
     log
     --------------------------------------------------------- */
  function renderLog(state) {
    const logs = state.logs || [];
    if (!logs.length) {
      $("#systemLog").innerHTML = `<div class="log-item"><span class="log-time">SYS</span><span class="log-msg"><strong>System online.</strong> Awaiting a biometric archive.</span></div>`;
      return;
    }
    $("#systemLog").innerHTML = logs.map((l) => {
      const d = new Date(l.at);
      const time = isNaN(d.getTime()) ? "SYS" : String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      return `<div class="log-item" data-tone="${esc(l.type || "")}"><span class="log-time">${time}</span><span class="log-msg">${esc(l.msg)}</span></div>`;
    }).join("");
  }

  function addLog(state, type, msg) {
    state.logs = state.logs || [];
    state.logs.unshift({ at: new Date().toISOString(), type, msg });
    state.logs = state.logs.slice(0, 36);
    D.saveState(state);
    renderLog(state);
    if (typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("arise:state-changed"));
    }
  }

  /* ---------------------------------------------------------
     master render
     --------------------------------------------------------- */
  function render(state) {
    const dash = D.computeDashboard(state);
    renderProfile(state, dash);
    renderScores(dash);
    renderStats(dash);
    renderVitals(dash);
    renderHeatmap(dash);
    renderInsights(dash);
    renderGates(dash);
    renderQuests(state, dash);
    if (window.SystemTraining) window.SystemTraining.render(state);
    if (window.SystemBody) window.SystemBody.render(state);
    if (window.SystemCloud) window.SystemCloud.render(state);
    renderArmy(dash);
    renderLink(state, dash);
    renderLog(state);

    const statusDate = $("#statusDate");
    if (statusDate) {
      statusDate.textContent = D.fmtFull(dash.activeKey) + (dash.activeKey !== dash.today ? " · LATEST RECORD" : "");
    }
    renderClock();
    return dash;
  }

  function renderClock() {
    const now = new Date();
    const el = $("#topDate");
    if (el) {
      el.textContent = String(now.getDate()).padStart(2, "0") + " " + monthNames[now.getMonth()] + " " +
        now.getFullYear() + " · " + String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    }
  }

  /* ---------------------------------------------------------
     mobile command deck
     --------------------------------------------------------- */
  function toggleMobileSheet(force) {
    const sheet = $("#mobileSheet");
    const scrim = $("#mobileSheetScrim");
    const more = $("#mobileMore");
    if (!sheet || !scrim) return;
    const open = typeof force === "boolean" ? force : !sheet.classList.contains("is-open");
    sheet.classList.toggle("is-open", open);
    sheet.setAttribute("aria-hidden", open ? "false" : "true");
    scrim.hidden = !open;
    if (more) more.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function closeMobileSheet() {
    toggleMobileSheet(false);
  }

  /* ---------------------------------------------------------
     views
     --------------------------------------------------------- */
  function setView(view) {
    if (!view) return;
    currentView = view;
    $$(".nav-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
    $$(".dock-btn[data-view], .sheet-link[data-view]").forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
    const dockMore = $("#mobileMore");
    if (dockMore) dockMore.classList.toggle("is-active", ["quests", "army", "link"].indexOf(view) !== -1);
    closeMobileSheet();
    $$(".view").forEach((v) => v.classList.toggle("is-active", v.id === "view-" + view));
    if (location.hash !== "#" + view) {
      try { history.replaceState(null, "", "#" + view); } catch (err) { /* file protocol */ }
    }
    const titles = {
      status: "Status", gates: "Gate Log", quests: "Quests", training: "Training Grounds", body: "Body Log", army: "Shadow Army", link: "Data Link"
    };
    document.title = "ARISE // " + (titles[view] || "Hunter System");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function getView() {
    return currentView;
  }

  function setGateFilter(state, filter) {
    gateFilter = filter;
    const dash = D.computeDashboard(state);
    renderGates(dash);
  }

  /* ---------------------------------------------------------
     overlays / notifications
     --------------------------------------------------------- */
  function toast(type, title, message) {
    const host = $("#toasts");
    if (!host) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.dataset.type = type || "info";
    const mark = type === "success" ? "✓" : type === "error" ? "!" : type === "warn" ? "!" : "i";
    el.innerHTML = `<span class="toast-mark">${mark}</span><div><strong></strong><p></p></div>`;
    el.querySelector("strong").textContent = title || "SYSTEM";
    el.querySelector("p").textContent = message || "";
    host.appendChild(el);
    const remove = () => {
      if (!el.isConnected) return;
      el.classList.add("is-out");
      setTimeout(() => el.remove(), 280);
    };
    el.addEventListener("click", remove);
    setTimeout(remove, 5600);
  }

  function working(on, text) {
    const el = $("#working");
    if (!el) return;
    if (text) $("#workingText").textContent = text;
    el.classList.toggle("is-open", !!on);
    el.setAttribute("aria-hidden", on ? "false" : "true");
  }

  function showLevelUp(info, newShadows) {
    const overlay = $("#levelup");
    if (!overlay) return;
    $("#luLevel").textContent = String(info.level);
    const rankName = info.rank.name === "NATIONAL LEVEL" ? "NATIONAL LEVEL HUNTER" :
      info.rank.name === "MONARCH" ? "SHADOW MONARCH" : info.rank.name + " HUNTER";
    $("#luRank").textContent = rankName;
    if (newShadows && newShadows.length) {
      const names = newShadows.map((s) => s.name).join(" · ");
      $("#luCopy").textContent = (newShadows.length === 1
        ? "A new shadow answers your call — " + names + ", " + newShadows[0].epithet + "."
        : "New shadows answer your call — " + names + ".");
    } else {
      $("#luCopy").textContent = "Your body has adapted. New strength is available to you.";
    }
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
  }

  function hideLevelUp() {
    const overlay = $("#levelup");
    if (!overlay) return;
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
  }

  function openModal(opts) {
    const overlay = $("#modal");
    if (!overlay) return;
    $("#modalTitle").textContent = opts.title || "System Prompt";
    $("#modalBody").innerHTML = opts.body || "";
    const actions = $("#modalActions");
    actions.innerHTML = "";
    (opts.actions || []).forEach((a, i) => {
      const btn = document.createElement("button");
      btn.className = "btn " + (a.kind === "danger" ? "btn-danger" : a.kind === "primary" ? "btn-primary" : "btn-ghost");
      btn.textContent = a.label || "OK";
      btn.dataset.index = String(i);
      btn.addEventListener("click", () => {
        const keep = a.onClick ? a.onClick(overlay) : false;
        if (a.close !== false && keep !== true) closeModal();
      });
      actions.appendChild(btn);
    });
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    const input = overlay.querySelector("input, textarea");
    if (input) setTimeout(() => { input.focus(); input.select(); }, 60);
  }

  function closeModal() {
    const overlay = $("#modal");
    if (!overlay) return;
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
  }

  window.SystemUI = {
    render,
    renderClock,
    setView,
    getView,
    toggleMobileSheet,
    closeMobileSheet,
    setGateFilter,
    toast,
    working,
    addLog,
    renderLog,
    showLevelUp,
    hideLevelUp,
    openModal,
    closeModal,
    escape: esc
  };
})();
