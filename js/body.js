/* =========================================================
   ARISE // body log + monthly strength ledger
   Biometric checkpoints every 14 days and monthly peaks.
   ========================================================= */
(function () {
  "use strict";

  const D = window.SystemData;
  const UI = window.SystemUI;
  const T = window.SystemTraining;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (v) => UI.escape(v == null ? "" : String(v));
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const stamp = (state, record) => {
    record.updatedAt = Date.now();
    if (state && state.sync && state.sync.deviceId) record.updatedBy = state.sync.deviceId;
    return record;
  };
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const num = (v) => {
    const n = parseFloat(String(v == null ? "" : v));
    return isFinite(n) ? n : 0;
  };
  const round1 = (n) => Math.round(num(n) * 10) / 10;
  const fmt = (n) => Math.round(num(n)).toLocaleString("en-US");
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const PERIOD_DAYS = 14;
  const TWO_HOURS = 2 * 60 * 60 * 1000;

  let ctx = null;
  let reminderTimer = null;

  /* ---------------------------------------------------------
     helpers
     --------------------------------------------------------- */
  const validDate = (k) => /^\d{4}-\d{2}-\d{2}$/.test(String(k || ""));
  const validMonth = (k) => /^\d{4}-\d{2}$/.test(String(k || ""));

  function parseKey(key) {
    const p = String(key).split("-").map(Number);
    return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
  }

  function keyAdd(key, delta) {
    const d = parseKey(key);
    d.setDate(d.getDate() + delta);
    return D.keyOf(d);
  }

  function daysBetween(from, to) {
    return Math.round((parseKey(to) - parseKey(from)) / 86400000);
  }

  function currentMonthKey() {
    return D.todayKey().slice(0, 7);
  }

  function monthShift(key, delta) {
    const p = String(key).split("-").map(Number);
    const d = new Date(p[0], (p[1] || 1) - 1 + delta, 1);
    return D.keyOf(d).slice(0, 7);
  }

  function monthLabel(key) {
    const p = String(key).split("-");
    return MONTHS[clamp(Number(p[1]) - 1, 0, 11)] + " " + p[0];
  }

  function monthShort(key) {
    return MONTHS[clamp(Number(String(key).split("-")[1]) - 1, 0, 11)];
  }

  function ensure(state) {
    if (!state.body || typeof state.body !== "object") state.body = { entries: [] };
    if (!Array.isArray(state.body.entries)) state.body.entries = [];
    state.body.entries = state.body.entries
      .filter((e) => e && validDate(e.date))
      .map((e) => ({
        id: e.id || uid(),
        date: String(e.date),
        weight: Math.max(0, round1(e.weight)),
        waist: Math.max(0, round1(e.waist)),
        avgSteps: Math.max(0, Math.round(num(e.avgSteps))),
        days: clamp(Math.round(num(e.days)), 0, PERIOD_DAYS),
        at: e.at || new Date().toISOString(),
        updatedAt: Number(e.updatedAt) || Date.parse(e.at) || 0,
        updatedBy: String(e.updatedBy || "")
      }))
      .filter((e) => e.weight > 0 || e.waist > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (!state.body.reminder || typeof state.body.reminder !== "object") state.body.reminder = {};
    const reminder = state.body.reminder;
    reminder.enabled = reminder.enabled !== false;
    reminder.nextAt = Number(reminder.nextAt) > 0 ? Number(reminder.nextAt) : null;
    reminder.lastPromptAt = reminder.lastPromptAt || null;
    if (!reminder.nextAt) scheduleReminder(state);

    if (!state.strength || typeof state.strength !== "object") state.strength = { entries: [] };
    if (!Array.isArray(state.strength.entries)) state.strength.entries = [];
    const strengthMap = new Map();
    state.strength.entries
      .filter((e) => e && e.name && validMonth(e.month))
      .forEach((e) => {
        const record = {
          id: e.id || uid(),
          name: String(e.name).slice(0, 48),
          month: String(e.month),
          weight: Math.max(0, round1(e.weight)),
          reps: clamp(Math.round(num(e.reps)), 1, 600),
          timed: !!e.timed,
          date: validDate(e.date) ? String(e.date) : String(e.month) + "-01",
          at: e.at || new Date().toISOString(),
          source: e.source === "ledger" ? "ledger" : "manual",
          updatedAt: Number(e.updatedAt) || Date.parse(e.at) || 0,
          updatedBy: String(e.updatedBy || "")
        };
        const key = record.month + "|" + record.name.toLowerCase();
        const previous = strengthMap.get(key);
        if (!previous || (record.source === "ledger" && previous.source !== "ledger")) {
          strengthMap.set(key, record);
        }
      });
    state.strength.entries = Array.from(strengthMap.values())
      .sort((a, b) => b.month.localeCompare(a.month) || a.name.localeCompare(b.name));
    state.strength.viewMonth = validMonth(state.strength.viewMonth) ? state.strength.viewMonth : currentMonthKey();
    state.strength.progressExercise = String(state.strength.progressExercise || "");
    return state;
  }

  function stepsAverage(state, date) {
    const keys = [];
    for (let i = PERIOD_DAYS - 1; i >= 0; i--) keys.push(keyAdd(date, -i));
    let sum = 0;
    let count = 0;
    keys.forEach((key) => {
      const day = state.days && state.days[key];
      if (day && day.steps !== undefined) {
        sum += num(day.steps);
        count++;
      }
    });
    return {
      avg: count ? Math.round(sum / count) : 0,
      days: count,
      from: keys[0],
      to: keys[keys.length - 1]
    };
  }

  function lastCheckpoint(t) {
    return t.body.entries.length ? t.body.entries[t.body.entries.length - 1] : null;
  }

  function nextCheckpoint(t) {
    const last = lastCheckpoint(t);
    return last ? keyAdd(last.date, PERIOD_DAYS) : D.todayKey();
  }

  function bodyIsDue(t) {
    return D.todayKey() >= nextCheckpoint(t);
  }

  function scheduleReminder(state) {
    if (!state.body || !state.body.reminder) return;
    const last = lastCheckpoint(state);
    const dueKey = last ? keyAdd(last.date, PERIOD_DAYS) : D.todayKey();
    const dueAt = parseKey(dueKey).getTime() + 9 * 60 * 60 * 1000;
    state.body.reminder.nextAt = dueKey <= D.todayKey() ? Date.now() : dueAt;
    state.body.reminder.lastPromptAt = null;
  }

  /* Only drills that actually appear in the set ledger or Strength Log. */
  function doneExerciseNames(state, t) {
    const names = Object.create(null);
    const add = (name) => {
      const v = String(name || "").trim();
      if (v) names[v.toLowerCase()] = v;
    };
    if (state.training && Array.isArray(state.training.logs)) {
      state.training.logs.forEach((l) => add(l.name));
    }
    t.strength.entries.forEach((e) => add(e.name));
    return Object.keys(names).map((k) => names[k]).sort((a, b) => a.localeCompare(b));
  }

  function peakOf(entries, timed) {
    if (!entries.length) return null;
    return entries.reduce((a, b) => {
      if (timed) return b.reps > a.reps ? b : a;
      if (Math.abs(b.weight - a.weight) > 0.01) return b.weight > a.weight ? b : a;
      return b.reps > a.reps ? b : a;
    }, entries[0]);
  }

  /* The Training Grounds set ledger is the source of truth for monthly peaks. */
  function syncFromLogs(state) {
    const t = ensure(state);
    const logs = state.training && Array.isArray(state.training.logs) ? state.training.logs : [];
    const groups = new Map();

    logs.forEach((l) => {
      if (!l || !l.name || !l.date) return;
      const name = String(l.name).trim();
      const month = String(l.date).slice(0, 7);
      if (!name || !validMonth(month)) return;
      const key = month + "|" + name.toLowerCase();
      if (!groups.has(key)) groups.set(key, { name, month });
    });

    let changed = false;
    groups.forEach((group, key) => {
      const peak = T && T.heaviestFromLedger ? T.heaviestFromLedger(state, group.name, group.month) : null;
      if (!peak) return;
      const existing = t.strength.entries.find((e) =>
        e.month === group.month && e.name.toLowerCase() === group.name.toLowerCase());
      const values = {
        name: group.name,
        month: group.month,
        weight: Math.max(0, round1(peak.weight)),
        reps: clamp(Math.round(num(peak.reps)), 1, peak.timed ? 600 : 100),
        timed: !!peak.timed,
        date: validDate(peak.date) ? peak.date : group.month + "-01",
        source: "ledger"
      };
      const unchanged = existing && ["weight", "reps", "timed", "date", "source"]
        .every((field) => existing[field] === values[field]);
      if (unchanged) return;
      const at = new Date().toISOString();
      if (existing) Object.assign(existing, values, stamp(state, { id: existing.id, at: existing.at || at }));
      else t.strength.entries.push(stamp(state, Object.assign({ id: uid(), at }, values)));
      changed = true;
    });

    const before = t.strength.entries.length;
    t.strength.entries = t.strength.entries.filter((e) =>
      e.source !== "ledger" || groups.has(e.month + "|" + e.name.toLowerCase()));
    if (t.strength.entries.length !== before) changed = true;
    if (changed) {
      t.strength.entries.sort((a, b) => b.month.localeCompare(a.month) || a.name.localeCompare(b.name));
    }
    return t;
  }

  /* ---------------------------------------------------------
     charts
     --------------------------------------------------------- */
  function dualLineChart(points) {
    const W = 640, H = 220, L = 48, R = 48, T2 = 18, B = 34;
    const usable = points.filter((p) => p.weight > 0 && p.waist > 0);
    if (!usable.length) return `<div class="empty-list">NO BODY METRICS RECORDED.</div>`;
    const wVals = usable.map((p) => p.weight);
    const zVals = usable.map((p) => p.waist);
    let wMin = Math.min.apply(null, wVals), wMax = Math.max.apply(null, wVals);
    let zMin = Math.min.apply(null, zVals), zMax = Math.max.apply(null, zVals);
    if (wMax === wMin) { wMin -= 2; wMax += 2; }
    if (zMax === zMin) { zMin -= 2; zMax += 2; }
    const wPad = (wMax - wMin) * 0.15, zPad = (zMax - zMin) * 0.15;
    wMin = Math.max(0, wMin - wPad); wMax += wPad;
    zMin = Math.max(0, zMin - zPad); zMax += zPad;
    const x = (i) => L + (i * (W - L - R)) / Math.max(1, usable.length - 1);
    const yW = (v) => T2 + (1 - (v - wMin) / (wMax - wMin)) * (H - T2 - B);
    const yZ = (v) => T2 + (1 - (v - zMin) / (zMax - zMin)) * (H - T2 - B);

    let grid = "";
    for (let i = 0; i <= 4; i++) {
      const gy = T2 + (i * (H - T2 - B)) / 4;
      grid += `<line x1="${L}" y1="${gy.toFixed(1)}" x2="${W - R}" y2="${gy.toFixed(1)}" stroke="rgba(90,190,255,.11)" stroke-dasharray="3 5"/>`;
      grid += `<text x="${L - 8}" y="${(gy + 3).toFixed(1)}" text-anchor="end" class="chart-axis">${round1(wMax - ((wMax - wMin) * i) / 4)}</text>`;
      grid += `<text x="${W - R + 8}" y="${(gy + 3).toFixed(1)}" text-anchor="start" class="chart-axis">${round1(zMax - ((zMax - zMin) * i) / 4)}</text>`;
    }

    const series = (key, yFn, color, gradient) => {
      const coords = usable.map((p, i) => [x(i), yFn(p[key])]);
      const line = coords.map((c, i) => (i ? "L" : "M") + c[0].toFixed(1) + " " + c[1].toFixed(1)).join(" ");
      const area = line + " L" + coords[coords.length - 1][0].toFixed(1) + " " + (H - B) + " L" + coords[0][0].toFixed(1) + " " + (H - B) + " Z";
      const dots = coords.map((c, i) => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="3" fill="${color}"><title>${esc(usable[i].label)} · ${round1(usable[i][key])}</title></circle>`).join("");
      return `<path d="${area}" fill="url(#${gradient})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
    };

    const marks = [0, Math.floor((usable.length - 1) / 2), usable.length - 1].filter((v, i, a) => a.indexOf(v) === i);
    const labels = marks.map((i) => `<text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="${i === 0 ? "start" : i === usable.length - 1 ? "end" : "middle"}" class="chart-axis">${esc(usable[i].label)}</text>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Body weight and waist trend">
      <defs>
        <linearGradient id="bodyWeightArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#57e6ff" stop-opacity=".22"/><stop offset="1" stop-color="#57e6ff" stop-opacity="0"/></linearGradient>
        <linearGradient id="bodyWaistArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a6bff" stop-opacity=".18"/><stop offset="1" stop-color="#8a6bff" stop-opacity="0"/></linearGradient>
      </defs>
      ${grid}${series("weight", yW, "#57e6ff", "bodyWeightArea")}${series("waist", yZ, "#8a6bff", "bodyWaistArea")}${labels}
    </svg>`;
  }

  function monthLineChart(points) {
    const W = 640, H = 220, L = 48, R = 14, T2 = 18, B = 34;
    const vals = points.filter((p) => p.value !== null).map((p) => p.value);
    if (!vals.length) return `<div class="empty-list">NO MONTHLY PEAKS RECORDED.</div>`;
    let min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (max === min) { min -= 2; max += 2; }
    const pad = (max - min) * 0.15;
    min = Math.max(0, min - pad); max += pad;
    const x = (i) => L + (i * (W - L - R)) / Math.max(1, points.length - 1);
    const y = (v) => T2 + (1 - (v - min) / (max - min)) * (H - T2 - B);

    let grid = "";
    for (let i = 0; i <= 4; i++) {
      const gy = T2 + (i * (H - T2 - B)) / 4;
      grid += `<line x1="${L}" y1="${gy.toFixed(1)}" x2="${W - R}" y2="${gy.toFixed(1)}" stroke="rgba(90,190,255,.11)" stroke-dasharray="3 5"/>`;
      grid += `<text x="${L - 8}" y="${(gy + 3).toFixed(1)}" text-anchor="end" class="chart-axis">${round1(max - ((max - min) * i) / 4)}</text>`;
    }

    const segments = [];
    let cur = [];
    points.forEach((p, i) => {
      if (p.value === null) {
        if (cur.length) segments.push(cur);
        cur = [];
      } else {
        cur.push({ p, i });
      }
    });
    if (cur.length) segments.push(cur);

    const paths = segments.map((seg) => {
      const coords = seg.map((item) => [x(item.i), y(item.p.value)]);
      const line = coords.map((c, i) => (i ? "L" : "M") + c[0].toFixed(1) + " " + c[1].toFixed(1)).join(" ");
      const area = line + " L" + coords[coords.length - 1][0].toFixed(1) + " " + (H - B) + " L" + coords[0][0].toFixed(1) + " " + (H - B) + " Z";
      const dots = seg.map((item, i) => `<circle cx="${coords[i][0].toFixed(1)}" cy="${coords[i][1].toFixed(1)}" r="3.5" class="chart-dot"><title>${esc(item.p.month)} · ${round1(item.p.value)} ${item.p.timed ? "S" : "KG"}</title></circle>`).join("");
      return `<path d="${area}" fill="url(#strengthArea)"/><path d="${line}" class="chart-line"/>${dots}`;
    }).join("");

    const labels = points.map((p, i) => `<text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="chart-axis">${esc(p.label)}</text>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Monthly strength peak">
      <defs><linearGradient id="strengthArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#54ffc1" stop-opacity=".22"/><stop offset="1" stop-color="#54ffc1" stop-opacity="0"/></linearGradient></defs>
      ${grid}${paths}${labels}
    </svg>`;
  }

  /* ---------------------------------------------------------
     renderers
     --------------------------------------------------------- */
  function renderBodyTiles(state, t) {
    const entries = t.body.entries;
    const latest = lastCheckpoint(t);
    const first = entries.length ? entries[0] : null;
    const due = nextCheckpoint(t);
    const until = daysBetween(D.todayKey(), due);
    const label = $("#bodyCheckpointLabel");
    if (label) {
      label.textContent = until > 0 ? "NEXT CHECKPOINT IN " + until + "D" : "CHECKPOINT DUE";
      $("#bodyCheckpointChip").classList.toggle("is-due", until <= 0);
    }

    const stepsNow = latest ? latest.avgSteps : stepsAverage(state, D.todayKey()).avg;
    $("#bodyWeightNow").textContent = latest && latest.weight > 0 ? round1(latest.weight) + " KG" : "--";
    $("#bodyWaistNow").textContent = latest && latest.waist > 0 ? round1(latest.waist) + " CM" : "--";
    $("#bodyStepsNow").textContent = stepsNow > 0 ? fmt(stepsNow) : "--";
    $("#bodyEntryCount").textContent = String(entries.length);

    const setDelta = (id, value, unit) => {
      const el = $(id);
      if (!el) return;
      if (first && latest && entries.length > 1 && value !== null) {
        el.textContent = (value > 0 ? "+" : "") + round1(value) + " " + unit + " SINCE " + D.fmtShort(first.date);
      } else {
        el.textContent = unit + " · " + (entries.length ? "BASELINE" : "AWAITING LOG");
      }
    };
    setDelta("#bodyWeightDelta", latest && first ? latest.weight - first.weight : null, "KG");
    setDelta("#bodyWaistDelta", latest && first ? latest.waist - first.waist : null, "CM");
  }

  function renderReminderBar(t) {
    const reminder = t.body.reminder;
    const due = bodyIsDue(t);
    const label = $("#bodyReminderLabel");
    if (label) label.textContent = !reminder.enabled ? "REMINDERS PAUSED" : due ? "CHECKPOINT DUE" : "REMINDERS ON";
    const chip = $("#bodyReminderChip");
    if (chip) chip.classList.toggle("is-due", reminder.enabled && due);
    const next = $("#bodyReminderNext");
    if (next) {
      next.textContent = !reminder.enabled
        ? "REMINDERS PAUSED · LOG MANUALLY"
        : due
          ? "CHECKPOINT DUE · ALERT EVERY 2H"
          : "NEXT CHECKPOINT " + D.fmtShort(nextCheckpoint(t)).toUpperCase();
    }
    const toggle = $("#bodyReminderToggle");
    if (toggle) toggle.textContent = reminder.enabled ? "PAUSE" : "RESUME";
    const enabled = t.notifications !== false;
    [$("#bodyNotifyBtn"), $("#linkNotifyBtn")].forEach((btn) => {
      if (!btn) return;
      btn.hidden = false;
      btn.textContent = enabled ? "NOTIFICATIONS ON" : "NOTIFICATIONS OFF";
      btn.setAttribute("aria-pressed", enabled ? "true" : "false");
    });
  }

  function renderBodyChart(t) {
    const entries = t.body.entries;
    const code = $("#bodyLogCode");
    if (code) code.textContent = entries.length + " RECORD" + (entries.length === 1 ? "" : "S");
    if (!entries.length) {
      $("#bodyChart").innerHTML = `<div class="empty-list">NO CHECKPOINTS LOGGED — RECORD WEIGHT AND WAIST EVERY 14 DAYS.</div>`;
      $("#bodyCaption").textContent = "";
      return;
    }
    const points = entries.map((e) => ({ label: D.fmtShort(e.date), weight: e.weight, waist: e.waist }));
    $("#bodyChart").innerHTML = dualLineChart(points);
    const first = entries[0];
    const last = entries[entries.length - 1];
    const dW = last.weight - first.weight;
    const dZ = last.waist - first.waist;
    $("#bodyCaption").innerHTML = entries.length === 1
      ? `<strong>${esc(D.fmtFull(last.date))}</strong> · BASELINE LOCKED · ${round1(last.weight)} KG / ${round1(last.waist)} CM`
      : `<strong>${esc(D.fmtShort(first.date))} → ${esc(D.fmtShort(last.date))}</strong> · WEIGHT <span class="${dW <= 0 ? "is-up" : "is-down"}">${dW > 0 ? "+" : ""}${round1(dW)} KG</span> · WAIST <span class="${dZ <= 0 ? "is-up" : "is-down"}">${dZ > 0 ? "+" : ""}${round1(dZ)} CM</span> · AVG ${fmt(Math.round(entries.reduce((s, e) => s + e.avgSteps, 0) / entries.length))} STEPS`;
  }

  function renderBodyList(t) {
    const entries = t.body.entries.slice().reverse();
    if (!entries.length) {
      $("#bodyCheckpointList").innerHTML = `<div class="empty-list">CHECKPOINT LEDGER EMPTY.</div>`;
      return;
    }
    $("#bodyCheckpointList").innerHTML = entries.map((e) => `<div class="body-checkpoint-row">
      <span class="body-cp-date">${esc(D.fmtShort(e.date))}</span>
      <span class="body-cp-metric"><small>WEIGHT</small><strong>${round1(e.weight)} <em>KG</em></strong></span>
      <span class="body-cp-metric"><small>WAIST</small><strong>${round1(e.waist)} <em>CM</em></strong></span>
      <span class="body-cp-metric"><small>AVG STEPS</small><strong>${fmt(e.avgSteps)} <em>/ ${e.days}D</em></strong></span>
      <span class="body-cp-actions">
        <button class="icon-btn btn-mini" data-body="edit-body" data-id="${esc(e.id)}" title="Edit checkpoint" aria-label="Edit checkpoint">✎</button>
        <button class="icon-btn btn-mini" data-body="del-body" data-id="${esc(e.id)}" title="Remove checkpoint" aria-label="Remove checkpoint">×</button>
      </span>
    </div>`).join("");
  }

  function renderStrengthToolbar(state, t) {
    const names = doneExerciseNames(state, t);
    const select = $("#strengthExercise");
    if (!select) return;
    select.innerHTML = names.length
      ? names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("")
      : `<option value="">NO WORKOUTS LOGGED</option>`;
    if (names.indexOf(t.strength.progressExercise) === -1) {
      t.strength.progressExercise = names.length ? names[names.length - 1] : "";
    }
    select.value = t.strength.progressExercise;
    $("#strengthMonthLabel").textContent = monthLabel(t.strength.viewMonth);
  }

  function renderStrengthRecords(t) {
    const rows = t.strength.entries
      .filter((e) => e.month === t.strength.viewMonth)
      .sort((a, b) => a.name.localeCompare(b.name));
    const code = $("#strengthCode");
    if (code) code.textContent = rows.length + " RECORD" + (rows.length === 1 ? "" : "S");
    if (!rows.length) {
      $("#strengthRecords").innerHTML = `<div class="empty-list">NO PEAKS LOGGED FOR ${esc(monthLabel(t.strength.viewMonth))}.</div>`;
      return;
    }
    $("#strengthRecords").innerHTML = rows.map((e) => {
      const target = T && T.targetFor ? T.targetFor(e.name) : "";
      return `<div class="strength-row">
        <div class="strength-name"><strong>${esc(e.name)}</strong><small>${esc(target || "CUSTOM LIFT")} · ${e.source === "ledger" ? "SYNCED" : "MANUAL"}</small></div>
        <div class="strength-peak"><span>${e.timed ? "LONGEST HOLD" : "HEAVIEST SET"}</span><strong>${e.timed ? e.reps + " SEC" : round1(e.weight) + " KG"}${e.timed && e.weight > 0 ? " @" + round1(e.weight) + " KG" : ""}</strong></div>
        <div class="strength-meta"><span>${esc(D.fmtShort(e.date))}</span>${e.timed ? "" : `<span>${e.reps} REPS</span>`}</div>
      </div>`;
    }).join("");
  }

  function renderStrengthChart(t) {
    const name = t.strength.progressExercise;
    const end = t.strength.viewMonth;
    const months = [];
    for (let i = 7; i >= 0; i--) months.push(monthShift(end, -i));
    const points = months.map((m) => {
      const rows = t.strength.entries.filter((e) =>
        e.month === m && e.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (!rows.length) return { label: monthShort(m), month: m, value: null, timed: false };
      const timed = rows.some((e) => e.timed);
      const best = peakOf(rows, timed);
      return { label: monthShort(m), month: m, value: timed ? best.reps : best.weight, timed };
    });
    const known = points.filter((p) => p.value !== null);
    if (!name || !known.length) {
      $("#strengthChart").innerHTML = `<div class="empty-list">SELECT AN EXERCISE AND LOG A MONTHLY PEAK TO PLOT PROGRESS.</div>`;
      $("#strengthCaption").textContent = "";
      return;
    }
    $("#strengthChart").innerHTML = monthLineChart(points);
    const first = known[0], last = known[known.length - 1];
    const delta = first.value ? ((last.value - first.value) / first.value) * 100 : 0;
    const unit = last.timed ? "S" : "KG";
    $("#strengthCaption").innerHTML = `<strong>${esc(name)}</strong> · ${esc(first.month)} ${round1(first.value)} ${unit} → ${esc(last.month)} ${round1(last.value)} ${unit} ·
      <span class="${delta >= 0 ? "is-up" : "is-down"}">${delta >= 0 ? "+" : ""}${Math.round(delta)}% ${last.timed ? "HOLD TIME" : "PEAK LOAD"}</span>`;
  }

  function render(state) {
    if (!$("#view-body") || !ctx) return;
    const t = syncFromLogs(state);
    renderBodyTiles(state, t);
    renderReminderBar(t);
    renderBodyChart(t);
    renderBodyList(t);
    renderStrengthToolbar(state, t);
    renderStrengthRecords(t);
    renderStrengthChart(t);
  }

  /* ---------------------------------------------------------
     modals
     --------------------------------------------------------- */
  function field(label, inner, id) {
    return `<label class="train-field"><span${id ? ` id="${id}"` : ""}>${label}</span>${inner}</label>`;
  }

  function confirmModal(title, body, label, action) {
    UI.openModal({
      title,
      body: `<p>${body}</p>`,
      actions: [{ label: "CANCEL" }, { label, kind: "danger", onClick: action }]
    });
  }

  function openBodyModal(entry) {
    const state = ctx.getState();
    const t = ensure(state);
    const editing = !!entry;
    const latest = lastCheckpoint(t);
    const due = nextCheckpoint(t);
    const initial = entry || { date: due, weight: latest ? latest.weight : "", waist: latest ? latest.waist : "" };
    const min = !editing && latest ? ' min="' + esc(due) + '"' : "";
    const avg = stepsAverage(state, initial.date);

    UI.openModal({
      title: editing ? "Edit Body Checkpoint" : "Log Body Checkpoint",
      body: `<p>${editing ? "Correct this 14-day biometric record." : "Record your weight and waist at this checkpoint. Average steps are read from the archive."}</p>
        ${field("CHECKPOINT DATE", `<input class="modal-input" id="bodyDate" type="date" value="${esc(initial.date)}"${min} />`)}
        <div class="train-form-grid">
          ${field("BODY WEIGHT (KG)", `<input class="modal-input" id="bodyWeight" type="number" min="1" max="500" step="0.1" value="${round1(initial.weight) || ""}" />`)}
          ${field("WAIST (CM)", `<input class="modal-input" id="bodyWaist" type="number" min="1" max="300" step="0.1" value="${round1(initial.waist) || ""}" />`)}
        </div>
        ${field("AVG STEPS / DAY · CALCULATED", `<input class="modal-input" id="bodyAvgSteps" type="number" readonly value="${avg.avg}" />`, "bodyAvgLabel")}
        <p class="train-hint" id="bodyHint">${avg.days
          ? "AVERAGE OF " + fmt(avg.avg) + " STEPS FROM " + avg.days + " DAILY RECORDS · " + D.fmtShort(avg.from) + " – " + D.fmtShort(avg.to) + "."
          : "NO STEP RECORDS IN THIS 14-DAY WINDOW. SYNC GOOGLE HEALTH TO CALCULATE THIS FIELD."}</p>`,
      actions: [
        { label: "CANCEL" },
        {
          label: editing ? "SAVE CHECKPOINT" : "LOG CHECKPOINT",
          kind: "primary",
          onClick: (overlay) => {
            const s = ctx.getState();
            const t2 = ensure(s);
            const date = overlay.querySelector("#bodyDate").value;
            const weight = round1(overlay.querySelector("#bodyWeight").value);
            const waist = round1(overlay.querySelector("#bodyWaist").value);
            if (!validDate(date) || weight <= 0 || waist <= 0) {
              UI.toast("warn", "INVALID CHECKPOINT", "Enter a date, body weight and waist measurement.");
              return true;
            }
            const last = lastCheckpoint(t2);
            if (!editing && last && daysBetween(last.date, date) < PERIOD_DAYS) {
              UI.toast("warn", "CHECKPOINT TOO EARLY", "Body metrics are logged every 14 days. Next checkpoint: " + D.fmtFull(nextCheckpoint(t2)) + ".");
              return true;
            }
            const duplicate = t2.body.entries.find((e) => e.date === date && (!editing || e.id !== entry.id));
            if (duplicate) {
              UI.toast("warn", "DATE ALREADY LOGGED", "Edit the existing checkpoint for " + D.fmtFull(date) + " instead.");
              return true;
            }
            const calculated = stepsAverage(s, date);
            const record = stamp(s, {
              id: editing ? entry.id : uid(),
              date,
              weight,
              waist,
              avgSteps: calculated.avg,
              days: calculated.days,
              at: editing ? entry.at : new Date().toISOString()
            });
            if (editing) {
              const found = t2.body.entries.find((e) => e.id === entry.id);
              if (found) Object.assign(found, record);
            } else {
              t2.body.entries.push(record);
              t2.body.entries.sort((a, b) => a.date.localeCompare(b.date));
            }
            scheduleReminder(t2);
            ctx.commit("body");
            UI.toast("success", editing ? "CHECKPOINT UPDATED" : "CHECKPOINT LOGGED",
              D.fmtFull(date) + " · " + weight + " KG · " + waist + " CM · " + fmt(calculated.avg) + " STEPS");
            UI.addLog(s, "good", "Body checkpoint " + (editing ? "updated" : "logged") + ": " + D.fmtShort(date) + " · " + weight + " KG · " + waist + " CM.");
            ctx.sfx();
          }
        }
      ]
    });

    setTimeout(() => {
      const dateEl = $("#modal #bodyDate");
      if (!dateEl) return;
      dateEl.addEventListener("change", () => {
        const result = stepsAverage(ctx.getState(), dateEl.value);
        const avgEl = $("#modal #bodyAvgSteps");
        const hint = $("#modal #bodyHint");
        if (avgEl) avgEl.value = result.avg;
        if (hint) {
          hint.textContent = result.days
            ? "AVERAGE OF " + fmt(result.avg) + " STEPS FROM " + result.days + " DAILY RECORDS · " + D.fmtShort(result.from) + " – " + D.fmtShort(result.to) + "."
            : "NO STEP RECORDS IN THIS 14-DAY WINDOW. SYNC GOOGLE HEALTH TO CALCULATE THIS FIELD.";
        }
      });
    }, 80);
  }

  function openStrengthModal() {
    const state = ctx.getState();
    const t = ensure(state);
    const names = doneExerciseNames(state, t);
    const initialName = t.strength.progressExercise || names[names.length - 1] || "";
    const initialMonth = t.strength.viewMonth;
    const initialTimed = !!(T && T.isExerciseTimed(initialName));
    const datalist = `<datalist id="strLibrary">${names.map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>`;
    const syncMessage = (peak) => peak
      ? `<strong>ALREADY SYNCED</strong><span>${peak.timed
          ? peak.reps + " SEC · " + peak.weight + " KG"
          : round1(peak.weight) + " KG × " + peak.reps + " REPS"} · ${esc(D.fmtShort(peak.date))}. Change it by logging or deleting sets in Training Grounds.</span>`
      : `<strong>MANUAL PEAK</strong><span>Enter the heaviest set for this exercise and month.</span>`;

    UI.openModal({
      title: "Add Manual Peak",
      body: `${datalist}
        <p>Workouts already in the set ledger update the Strength Log automatically. Use this only for lifts with no logged sets.</p>
        ${field("BROWSE EXERCISES", `<select class="modal-input ex-browse" id="strBrowse"><option value="">— SELECT DRILL —</option>${names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}</select>`)}
        ${field("EXERCISE", `<input class="modal-input" id="strName" list="strLibrary" maxlength="48" value="${esc(initialName)}" />`)}
        <div class="train-form-grid">
          ${field("MONTH", `<input class="modal-input" id="strMonth" type="month" value="${esc(initialMonth)}" />`)}
          ${field("DATE", `<input class="modal-input" id="strDate" type="date" value="${esc(D.todayKey())}" />`)}
          ${field("WEIGHT (KG)", `<input class="modal-input" id="strWeight" type="number" min="0" max="1000" step="0.5" value="0" />`)}
          ${field(initialTimed ? "HOLD (SEC)" : "REPS", `<input class="modal-input" id="strReps" type="number" min="1" max="${initialTimed ? 600 : 100}" value="${initialTimed ? 30 : 8}" />`, "strRepsLabel")}
        </div>
        <div class="train-suggestion" id="strSuggestion">${syncMessage(T ? T.heaviestFromLedger(state, initialName, initialMonth) : null)}</div>
        <input type="hidden" id="strTimedFlag" value="${initialTimed ? "1" : "0"}" />`,
      actions: [
        { label: "CANCEL" },
        {
          label: "ADD PEAK",
          kind: "primary",
          onClick: (overlay) => {
            const s = ctx.getState();
            const t2 = ensure(s);
            const name = (overlay.querySelector("#strName").value || "").trim().slice(0, 48);
            const month = overlay.querySelector("#strMonth").value;
            const date = overlay.querySelector("#strDate").value;
            if (!name || !validMonth(month)) {
              UI.toast("warn", "INVALID PEAK", "Name the exercise and choose a month.");
              return true;
            }
            if (T && T.heaviestFromLedger(s, name, month)) {
              UI.toast("warn", "ALREADY SYNCED", name + " already has logged sets for " + monthLabel(month) + ". Update them in Training Grounds.");
              return true;
            }
            const isTimed = overlay.querySelector("#strTimedFlag").value === "1";
            const weight = Math.max(0, round1(overlay.querySelector("#strWeight").value));
            const reps = clamp(Math.round(num(overlay.querySelector("#strReps").value)), 1, isTimed ? 600 : 100);
            const at = new Date().toISOString();
            const record = stamp(s, {
              id: uid(),
              name,
              month,
              weight,
              reps,
              timed: isTimed,
              date: validDate(date) ? date : month + "-01",
              at,
              source: "manual"
            });
            const existing = t2.strength.entries.find((e) =>
              e.name.toLowerCase() === name.toLowerCase() && e.month === month);
            if (existing) Object.assign(existing, record, { id: existing.id, at: existing.at || at });
            else t2.strength.entries.push(record);
            t2.strength.entries.sort((a, b) => b.month.localeCompare(a.month) || a.name.localeCompare(b.name));
            t2.strength.viewMonth = month;
            t2.strength.progressExercise = name;
            ctx.commit("strength");
            UI.toast("success", existing ? "MANUAL PEAK UPDATED" : "MANUAL PEAK ADDED",
              monthLabel(month) + " · " + name + " · " + (isTimed ? reps + " SEC" : round1(weight) + " KG × " + reps));
            UI.addLog(s, "good", "Strength peak " + (existing ? "updated" : "added") + ": " + name + " · " + monthLabel(month) + ".");
            ctx.sfx();
          }
        }
      ]
    });

    setTimeout(() => {
      const nameEl = $("#modal #strName");
      const monthEl = $("#modal #strMonth");
      const browse = $("#modal #strBrowse");
      if (!nameEl || !monthEl) return;
      const repsEl = $("#modal #strReps");
      const label = $("#modal #strRepsLabel");
      const suggestionBox = $("#modal #strSuggestion");
      const timedFlag = $("#modal #strTimedFlag");
      const refresh = () => {
        const name = (nameEl.value || "").trim();
        const month = monthEl.value || currentMonthKey();
        const peak = T ? T.heaviestFromLedger(ctx.getState(), name, month) : null;
        const isTimed = !!(T && T.isExerciseTimed(name)) || !!(peak && peak.timed);
        if (label) label.textContent = isTimed ? "HOLD (SEC)" : "REPS";
        if (repsEl) repsEl.max = isTimed ? 600 : 100;
        if (timedFlag) timedFlag.value = isTimed ? "1" : "0";
        if (suggestionBox) suggestionBox.innerHTML = syncMessage(peak);
      };
      nameEl.addEventListener("input", refresh);
      monthEl.addEventListener("change", refresh);
      if (browse) browse.addEventListener("change", () => {
        if (!browse.value) return;
        nameEl.value = browse.value;
        refresh();
      });
      refresh();
    }, 80);
  }

  /* ---------------------------------------------------------
     checkpoint reminders
     --------------------------------------------------------- */
  function showReminder(test) {
    const state = ctx.getState();
    const t = ensure(state);
    const due = bodyIsDue(t);
    UI.openModal({
      title: test ? "Body Log Alert Test" : "Body Log Checkpoint Due",
      body: `<p>${test
        ? "The reminder system is active. Real alerts begin when the 14-day checkpoint is due."
        : "Your 14-day body checkpoint is due. Log it now to stop these alerts."}</p>
        <div class="train-suggestion"><strong>WHAT TO LOG</strong><span>Body weight, waist (cm) and calculated average steps for the trailing 14 days.</span></div>`,
      actions: [
        {
          label: "REMIND IN 2H",
          onClick: () => UI.toast("info", "REMINDER SNOOZED", "Next alert in 2 hours.")
        },
        {
          label: "LOG CHECKPOINT",
          kind: "primary",
          onClick: () => {
            UI.setView("body");
            openBodyModal(null);
          }
        }
      ]
    });
    const title = test ? "ARISE // ALERT TEST" : "ARISE // BODY LOG DUE";
    const message = test
      ? "Reminder system active. Real alerts start at the 14-day checkpoint."
      : "Weight + waist checkpoint due. Log it to stop the 2-hour alerts.";
    UI.toast(test ? "info" : "warn", title, message);
    const s = ctx ? ctx.getState() : null;
    if (s && s.notifications !== false && typeof Notification !== "undefined" && Notification.permission === "granted") {
      try { new Notification(title, { body: message, tag: "arise-body-log", renotify: true }); } catch (err) { /* alerts are optional */ }
    }
  }

  function checkReminder(force) {
    if (!ctx) return;
    const s = ctx.getState();
    const t = ensure(s);
    const reminder = t.body.reminder;
    if (!reminder.enabled) return;
    const busy = $("#modal").classList.contains("is-open") || $("#levelup").classList.contains("is-open");
    if (busy && !force) return;
    const due = bodyIsDue(t);
    if (!due && !force) return;
    const now = Date.now();
    if (!force && reminder.nextAt && now < reminder.nextAt) return;
    showReminder(!due);
    if (due) {
      reminder.lastPromptAt = new Date(now).toISOString();
      reminder.nextAt = now + TWO_HOURS;
      ctx.persist("reminder");
      ctx.render();
    }
  }

  function startReminders() {
    if (reminderTimer) return;
    setTimeout(() => checkReminder(false), 2500);
    reminderTimer = setInterval(() => checkReminder(false), 30000);
  }

  /* ---------------------------------------------------------
     events
     --------------------------------------------------------- */
  function handle(action, data) {
    const state = ctx.getState();
    const t = ensure(state);

    switch (action) {
      case "body-log":
        openBodyModal(null);
        break;
      case "strength-log":
        openStrengthModal();
        break;
      case "strength-prev":
        t.strength.viewMonth = monthShift(t.strength.viewMonth, -1);
        ctx.persist("view");
        ctx.render();
        break;
      case "strength-next":
        t.strength.viewMonth = monthShift(t.strength.viewMonth, 1);
        ctx.persist("view");
        ctx.render();
        break;
      case "body-reminder-toggle": {
        t.body.reminder.enabled = !t.body.reminder.enabled;
        if (t.body.reminder.enabled && bodyIsDue(t)) t.body.reminder.nextAt = Date.now();
        ctx.commit("body");
        UI.toast("success", t.body.reminder.enabled ? "REMINDERS RESUMED" : "REMINDERS PAUSED",
          t.body.reminder.enabled ? "Alerts will repeat every 2 hours until the checkpoint is logged." : "Log your checkpoint manually whenever you are ready.");
        break;
      }
      case "body-notify-toggle": {
        const s2 = ctx.getState();
        const current = ensure(s2);
        if (current.notifications !== false) {
          current.notifications = false;
          ctx.commit("settings");
          UI.toast("warn", "NOTIFICATIONS OFF", "System alerts are muted. In-app popups remain active.");
          break;
        }
        if (typeof Notification === "undefined") {
          current.notifications = true;
          ctx.commit("settings");
          UI.toast("warn", "SYSTEM ALERTS UNSUPPORTED", "In-app popups remain active on this browser.");
          break;
        }
        const finish = (permission) => {
          const s3 = ctx.getState();
          const updated = ensure(s3);
          updated.notifications = permission === "granted";
          ctx.commit("settings");
          UI.toast(updated.notifications ? "success" : "warn",
            updated.notifications ? "NOTIFICATIONS ON" : "NOTIFICATIONS BLOCKED",
            updated.notifications ? "System notifications will appear alongside the popups." : "Allow notifications in browser settings to enable system alerts.");
        };
        if (Notification.permission === "granted") {
          finish("granted");
          break;
        }
        const request = Notification.requestPermission();
        if (request && typeof request.then === "function") request.then(finish);
        else finish(request);
        break;
      }
      case "body-test-reminder":
        showReminder(true);
        break;
      case "edit-body": {
        const entry = t.body.entries.find((e) => e.id === data.id);
        if (entry) openBodyModal(entry);
        break;
      }
      case "del-body": {
        const entry = t.body.entries.find((e) => e.id === data.id);
        if (!entry) return;
        confirmModal("Remove Body Checkpoint?", "This deletes the checkpoint from " + D.fmtFull(entry.date) + ".", "REMOVE CHECKPOINT", () => {
          const s = ctx.getState();
          const tr = ensure(s);
          tr.body.entries = tr.body.entries.filter((e) => e.id !== entry.id);
          if (!tr.deleted || typeof tr.deleted !== "object") tr.deleted = {};
          if (!tr.deleted.bodyEntries || typeof tr.deleted.bodyEntries !== "object") tr.deleted.bodyEntries = {};
          tr.deleted.bodyEntries[entry.id] = Date.now();
          scheduleReminder(tr);
          ctx.commit("body");
          UI.toast("warn", "CHECKPOINT REMOVED", D.fmtFull(entry.date) + " was deleted.");
          UI.addLog(s, "warn", "Body checkpoint removed: " + D.fmtShort(entry.date) + ".");
        });
        break;
      }
      default:
        break;
    }
  }

  function bindStatic() {
    const map = {
      "#bodyLogBtn": "body-log",
      "#bodyReminderToggle": "body-reminder-toggle",
      "#bodyNotifyBtn": "body-notify-toggle",
      "#linkNotifyBtn": "body-notify-toggle",
      "#bodyTestReminderBtn": "body-test-reminder",
      "#strengthLogBtn": "strength-log",
      "#strengthPrev": "strength-prev",
      "#strengthNext": "strength-next"
    };
    Object.keys(map).forEach((sel) => {
      const el = $(sel);
      if (el) el.addEventListener("click", () => handle(map[sel], {}, el));
    });
    const select = $("#strengthExercise");
    if (select) {
      select.addEventListener("change", () => {
        const t = ensure(ctx.getState());
        t.strength.progressExercise = select.value;
        ctx.persist("view");
        ctx.render();
      });
    }
  }

  function mount(options) {
    ctx = options;
    ensure(ctx.getState());
    bindStatic();
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-body]");
      if (!el || !ctx) return;
      handle(el.dataset.body, el.dataset, el);
    });
    startReminders();
  }

  window.SystemBody = { mount, render, ensure, syncFromLogs, stepsAverage, checkReminder, showReminder };
})();
