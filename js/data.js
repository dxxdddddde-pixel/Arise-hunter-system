/* =========================================================
   ARISE // data core
   Storage, health data parsing, scoring and game systems.
   Runs entirely client-side. No data leaves the browser.
   ========================================================= */
(function () {
  "use strict";

  const STORAGE_KEY = "arise-hunter-system-v1";
  const DAY_MS = 86400000;

  /* ---------------------------------------------------------
     constants
     --------------------------------------------------------- */
  const RANKS = [
    { min: 1, key: "E", name: "E-RANK" },
    { min: 5, key: "D", name: "D-RANK" },
    { min: 10, key: "C", name: "C-RANK" },
    { min: 16, key: "B", name: "B-RANK" },
    { min: 24, key: "A", name: "A-RANK" },
    { min: 34, key: "S", name: "S-RANK" },
    { min: 50, key: "N", name: "NATIONAL LEVEL" },
    { min: 70, key: "M", name: "MONARCH" }
  ];

  const SHADOWS = [
    { id: "igris", name: "IGRIS", epithet: "Blood-Red Commander", level: 5, sigil: "I", role: "Knight of the legion. Sharpens strength and shields your recovery." },
    { id: "iron", name: "IRON", epithet: "Steel Fist", level: 8, sigil: "II", role: "Immovable vanguard. Converts heavy training load into raw power." },
    { id: "tusk", name: "TUSK", epithet: "High Orc Shaman", level: 12, sigil: "III", role: "Keeper of mana. Rewards deep sleep and steady vital signs." },
    { id: "kaisel", name: "KAISEL", epithet: "Sky Wyvern", level: 16, sigil: "IV", role: "Winged scout. Amplifies distance covered and cardio output." },
    { id: "beru", name: "BERU", epithet: "Ant King", level: 20, sigil: "V", role: "Apex predator. Devours fatigue and accelerates adaptation." },
    { id: "greed", name: "GREED", epithet: "Gatekeeper", level: 25, sigil: "VI", role: "Sentinel of the threshold. Strengthens consistency and streaks." },
    { id: "bellion", name: "BELLION", epithet: "Grand Marshal", level: 30, sigil: "VII", role: "First shadow soldier. Commands the army in your name." },
    { id: "kamish", name: "KAMISH", epithet: "Dragon of Ruin", level: 40, sigil: "VIII", role: "Calamity bound to your will. Opens the upper echelons of the legion." },
    { id: "tank", name: "TANK", epithet: "Ironhide Sentinel", level: 44, sigil: "IX", role: "Unbreakable rear guard. Turns heavy sets into immovable mass." },
    { id: "cerberus", name: "CERBERUS", epithet: "Hound of the Threshold", level: 48, sigil: "X", role: "Three-headed hunter. Guards every gate you have cleared." },
    { id: "naberius", name: "NABERIUS", epithet: "Duke of the Abyss", level: 52, sigil: "XI", role: "Abyssal tactician. Rewards precision in every programmed week." },
    { id: "baran", name: "BARAN", epithet: "Demon Monarch", level: 56, sigil: "XII", role: "A monarch's will, bent to yours. Amplifies your darkest training blocks." },
    { id: "valtan", name: "VALTAN", epithet: "Beast Sovereign", level: 62, sigil: "XIII", role: "Raw instinct incarnate. Feeds on progressive overload and rising volume." },
    { id: "rakan", name: "RAKAN", epithet: "Flame Sovereign", level: 68, sigil: "XIV", role: "Eternal fire bound to your banner. Burns away stagnation." },
    { id: "yogumunt", name: "YOGUMUNT", epithet: "Death General", level: 76, sigil: "XV", role: "Marshal of the fallen. Counts every personal record as a tribute." },
    { id: "levia", name: "LEVIA", epithet: "Tide Sovereign", level: 84, sigil: "XVI", role: "Master of currents. Keeps recovery flowing through the legion." },
    { id: "terak", name: "TERAK", epithet: "Stone Sovereign", level: 90, sigil: "XVII", role: "The bedrock of your army. Nothing moves it but your command." },
    { id: "eternal", name: "ETERNAL SHADOW", epithet: "Apex of the Legion", level: 96, sigil: "XVIII", role: "The final evolution. Every foe you have conquered stands behind you." }
  ];

  const METRIC_LABELS = {
    steps: "Steps",
    activeEnergy: "Active Energy",
    basalEnergy: "Basal Energy",
    exerciseMinutes: "Exercise",
    sleepHours: "Sleep",
    hrv: "HRV",
    rhr: "Resting HR",
    respiratory: "Respiratory",
    vo2max: "VO2 Max",
    wristTemp: "Wrist Temp",
    heartRate: "Heart Rate",
    workouts: "Workouts"
  };

  const GATE_NAMES = [
    { test: /run|jog|track|sprint/i, name: "Gate of the Swift", type: "cardio" },
    { test: /walk/i, name: "Whispering Path", type: "cardio" },
    { test: /cycl|bike|spin/i, name: "Windward Gate", type: "cardio" },
    { test: /swim/i, name: "Abyssal Basin", type: "cardio" },
    { test: /strength|weight|core|function/i, name: "Iron Hold", type: "strength" },
    { test: /hiit|cross|circuit|jump/i, name: "Crimson Furnace", type: "strength" },
    { test: /yoga|pilates|mind|flex|cooldown|stretch/i, name: "Sanctum of Breath", type: "recovery" },
    { test: /hik/i, name: "Frostvein Pass", type: "cardio" },
    { test: /row/i, name: "Tidebreaker Hall", type: "cardio" },
    { test: /elliptical|stair|climb/i, name: "Spire of Ascent", type: "cardio" },
    { test: /box|kick|martial|combat/i, name: "Blood Ring", type: "strength" },
    { test: /tennis|squash|pickle|badminton/i, name: "Twin Moon Court", type: "cardio" },
    { test: /basket|soccer|football|sport|volley|hockey/i, name: "Skybound Arena", type: "cardio" },
    { test: /dance/i, name: "Mirror Hall", type: "cardio" }
  ];

  const isStrengthType = (t) => /strength|weight|hiit|cross|circuit|box|kick|martial/i.test(t || "");
  const isCardioType = (t) => /run|jog|cycl|bike|swim|hik|walk|row|elliptical|stair|tennis|basket|soccer|football|sport|dance|cardio/i.test(t || "");

  /* ---------------------------------------------------------
     small helpers
     --------------------------------------------------------- */
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const round = (n, digits) => {
    const p = Math.pow(10, digits || 0);
    return Math.round((Number(n) || 0) * p) / p;
  };
  const mean = (arr) => {
    const vals = arr.filter((v) => typeof v === "number" && isFinite(v));
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
  const num = (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (typeof v === "object") {
      if (v.qty !== undefined) return num(v.qty);
      if (v.value !== undefined) return num(v.value);
      if (v.Avg !== undefined) return num(v.Avg);
      if (v.avg !== undefined) return num(v.avg);
    }
    const n = parseFloat(String(v).replace(/,/g, "."));
    return isFinite(n) ? n : 0;
  };

  function keyOf(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function parseKey(key) {
    const parts = String(key).split("-").map(Number);
    return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  }

  function keyAdd(key, delta) {
    const d = parseKey(key);
    d.setDate(d.getDate() + delta);
    return keyOf(d);
  }

  function todayKey() {
    return keyOf(new Date());
  }

  function lastNDaysEnding(endKey, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(keyAdd(endKey, -i));
    return out;
  }

  function parseDate(raw) {
    if (!raw) return null;
    let s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const p = s.split("-").map(Number);
      return new Date(p[0], p[1] - 1, p[2]);
    }
    // 2024-01-01 07:00:00 +0200  ->  2024-01-01T07:00:00+02:00
    s = s.replace(
      /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/,
      function (m, d, t, z) {
        if (!z) return d + "T" + t;
        if (z === "Z") return d + "T" + t + "Z";
        z = z.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
        return d + "T" + t + z;
      }
    );
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? null : dt;
  }

  function fmtShort(key) {
    const d = parseKey(key);
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return String(d.getDate()).padStart(2, "0") + " " + months[d.getMonth()];
  }

  function fmtFull(key) {
    const d = parseKey(key);
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return String(d.getDate()).padStart(2, "0") + " " + months[d.getMonth()] + " " + d.getFullYear();
  }

  function fmtDateTime(iso) {
    if (!iso) return "NEVER";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "NEVER";
    const time = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    return fmtShort(keyOf(d)) + " " + d.getFullYear() + " · " + time;
  }

  const fmtNum = (n) => Number(n || 0).toLocaleString("en-US");

  /* ---------------------------------------------------------
     state
     --------------------------------------------------------- */
  function defaultState() {
    return {
      version: 1,
      hunter: { name: "SUNG JIN-WOO" },
      sound: true,
      bonusXp: 0,
      days: {},
      workouts: [],
      imports: [],
      claimed: {},
      lastSync: null,
      lastImport: null,
      goals: { steps: 10000, exercise: 30, sleep: 7.5 },
      training: null,
      body: {
        entries: [],
        reminder: { enabled: true, nextAt: null, lastPromptAt: null }
      },
      strength: { entries: [] },
      cloud: {
        uid: null,
        email: null,
        lastSyncAt: null,
        remoteUpdatedAt: null,
        dirty: false,
        syncing: false,
        lastError: null
      }
    };
  }

  function normalizeState(s) {
    const base = defaultState();
    if (!s || typeof s !== "object") return base;
    return {
      ...base,
      ...s,
      hunter: { ...base.hunter, ...(s.hunter || {}) },
      goals: { ...base.goals, ...(s.goals || {}) },
      training: s.training && typeof s.training === "object" ? s.training : null,
      body: s.body && typeof s.body === "object" ? s.body : base.body,
      strength: s.strength && typeof s.strength === "object" ? s.strength : base.strength,
      cloud: s.cloud && typeof s.cloud === "object" ? { ...base.cloud, ...s.cloud } : base.cloud,
      days: s.days && typeof s.days === "object" ? s.days : {},
      workouts: Array.isArray(s.workouts) ? s.workouts : [],
      imports: Array.isArray(s.imports) ? s.imports : [],
      claimed: s.claimed && typeof s.claimed === "object" ? s.claimed : {}
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizeState(JSON.parse(raw));
    } catch (err) {
      console.warn("ARISE: could not read save data", err);
    }
    return defaultState();
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.warn("ARISE: could not persist save data", err);
      return false;
    }
  }

  function clearState() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      /* ignore */
    }
  }

  /* ---------------------------------------------------------
     scoring
     --------------------------------------------------------- */
  function baselineBefore(state, key, metric, n) {
    const days = state.days;
    const keys = Object.keys(days).filter((k) => k < key).sort().slice(-(n || 28));
    const vals = keys.map((k) => days[k][metric]).filter((v) => typeof v === "number" && v > 0);
    return vals.length >= 2 ? mean(vals) : null;
  }

  function recoveryScore(day, base) {
    if (!day) return null;
    let score = 58;
    let weight = 0;

    if (day.hrv > 0 && base && base.hrv > 0) {
      const delta = day.hrv / base.hrv - 1;
      score += clamp(delta * 90, -30, 30) * 0.55;
      weight += 0.55;
    }
    if (day.rhr > 0 && base && base.rhr > 0) {
      const diff = base.rhr - day.rhr;
      score += clamp(diff * 5.5, -22, 22) * 0.4;
      weight += 0.4;
    }
    if (day.sleepHours > 0) {
      const s = clamp(52 + (day.sleepHours - 7.5) * 16, 5, 98);
      score += (s - 52) * 0.45;
      weight += 0.45;
    }
    if (day.respiratory > 0 && base && base.respiratory > 0) {
      const diff = base.respiratory - day.respiratory;
      score += clamp(diff * 16, -12, 12) * 0.15;
      weight += 0.15;
    }
    if (day.wristTemp > 0 && base && base.wristTemp > 0) {
      const dev = day.wristTemp - base.wristTemp;
      if (dev > 0.35) score -= (dev - 0.35) * 55;
    }
    if (weight === 0) return null;
    return Math.round(clamp(score, 1, 99));
  }

  function sleepScore(day) {
    if (!day || !(day.sleepHours > 0)) return null;
    const hours = day.sleepHours;
    let score = 50;

    if (hours >= 7 && hours <= 9) score += 24 - Math.abs(8 - hours) * 5;
    else if (hours < 7) score += (hours - 7) * 14;
    else score += (9 - hours) * 9;

    if (day.awakeHours > 0) {
      const total = hours + day.awakeHours;
      const eff = total > 0 ? hours / total : 0;
      score += (eff - 0.9) * 70;
    }
    if (day.deepHours > 0) {
      const share = day.deepHours / hours;
      score += (share - 0.17) * 90;
    }
    if (day.remHours > 0) {
      const share = day.remHours / hours;
      score += (share - 0.22) * 65;
    }
    return Math.round(clamp(score, 1, 99));
  }

  function workoutIntensity(w) {
    if (!w || !(w.duration > 0)) return 1.2;
    const perMin = (w.energy || 0) / w.duration;
    return clamp(perMin / 5, 0.8, 3.2);
  }

  function strainScore(day, workouts) {
    if (!day) return null;
    const energy = day.activeEnergy > 0 ? day.activeEnergy : (day.steps || 0) * 0.04;
    const minutes = day.exerciseMinutes || 0;
    if (!energy && !minutes && !(workouts && workouts.length)) return null;
    let score = (energy / 520) * 7 + (minutes / 60) * 5;
    (workouts || []).forEach((w) => {
      score += ((w.duration || 0) / 60) * workoutIntensity(w);
    });
    return round(clamp(score, 0, 21), 1);
  }

  function recoveryForDay(state, key) {
    const day = state.days[key];
    if (!day) return null;
    return recoveryScore(day, {
      hrv: baselineBefore(state, key, "hrv"),
      rhr: baselineBefore(state, key, "rhr"),
      respiratory: baselineBefore(state, key, "respiratory"),
      wristTemp: baselineBefore(state, key, "wristTemp")
    });
  }

  function sleepForDay(state, key) {
    return sleepScore(state.days[key]);
  }

  function workoutsByDate(state) {
    const map = {};
    (state.workouts || []).forEach((w) => {
      if (!w || !w.date) return;
      (map[w.date] = map[w.date] || []).push(w);
    });
    return map;
  }

  function strainForDay(state, key, map) {
    const byDate = map || workoutsByDate(state);
    return strainScore(state.days[key], byDate[key] || []);
  }

  function xpForDay(day, workouts) {
    if (!day) return 0;
    let xp = 0;
    xp += Math.min(120, (day.steps || 0) / 80);
    xp += Math.min(90, (day.exerciseMinutes || 0) * 1.7);
    xp += Math.min(80, (day.activeEnergy || 0) / 15);
    if ((day.sleepHours || 0) >= 7) xp += 35;
    else if (day.sleepHours > 0) xp += 15;
    xp += (workouts ? workouts.length : 0) * 30;
    return Math.round(xp);
  }

  function baseXp(state) {
    const map = workoutsByDate(state);
    return Object.keys(state.days).reduce((sum, key) => sum + xpForDay(state.days[key], map[key] || []), 0);
  }

  function totalXp(state) {
    return baseXp(state) + (state.bonusXp || 0);
  }

  function rankInfo(level) {
    let current = RANKS[0];
    for (const r of RANKS) if (level >= r.min) current = r;
    let next = null;
    for (const r of RANKS) {
      if (r.min > level) { next = r; break; }
    }
    const span = next ? next.min - current.min : 1;
    const progress = next ? clamp((level - current.min) / span, 0, 1) : 1;
    return { ...current, next: next ? next.key : null, nextName: next ? next.name : "APEX", nextLevel: next ? next.min : null, progress };
  }

  function levelInfo(xp) {
    let level = 1;
    let need = 400;
    let acc = 0;
    while (level < 100 && xp >= acc + need) {
      acc += need;
      level++;
      need = Math.round(400 + (level - 1) * 120);
    }
    const into = Math.max(0, xp - acc);
    const percent = clamp(Math.round((into / need) * 100), 0, 100);
    return {
      level,
      rank: rankInfo(level),
      xpInLevel: into,
      xpNeeded: need,
      xpToNext: Math.max(0, acc + need - xp),
      totalXp: xp,
      percent
    };
  }

  function computeStreak(state) {
    const map = workoutsByDate(state);
    const isActive = (key) => {
      const d = state.days[key];
      if (!d) return false;
      return (d.steps || 0) > 0 || (d.exerciseMinutes || 0) > 0 || ((map[key] || []).length > 0);
    };
    let key = todayKey();
    if (!isActive(key)) key = keyAdd(key, -1);
    let count = 0;
    while (isActive(key) && count < 2000) {
      count++;
      key = keyAdd(key, -1);
    }
    return count;
  }

  function computeStats(state, activeKey, scores) {
    const map = workoutsByDate(state);
    const keys14 = lastNDaysEnding(activeKey, 14);
    if (!state.days[activeKey]) {
      return { STR: 10, AGI: 10, VIT: 10, INT: 10, PER: 10 };
    }
    const val = (metric) => mean(keys14.map((k) => (state.days[k] ? state.days[k][metric] : null)));
    const avgSteps = val("steps") || 0;
    const avgEnergy = val("activeEnergy") || 0;
    const avgHrv = val("hrv");
    const avgRhr = val("rhr");
    const recSeries = keys14.map((k) => recoveryForDay(state, k)).filter((v) => v !== null);
    const sleepSeries = keys14.map((k) => sleepForDay(state, k)).filter((v) => v !== null);

    const workouts14 = (state.workouts || []).filter((w) => w.date >= keys14[0] && w.date <= keys14[13]);
    const strengthCount = workouts14.filter((w) => isStrengthType(w.raw || w.name)).length;
    const cardioCount = workouts14.filter((w) => isCardioType(w.raw || w.name)).length;

    const days30 = lastNDaysEnding(activeKey, 30);
    const activeDays = days30.filter((k) => state.days[k] && ((state.days[k].steps || 0) > 0 || (state.days[k].sleepHours || 0) > 0)).length;
    const consistency = (activeDays / 30) * 100;

    const hrvBase = baselineBefore(state, activeKey, "hrv");
    const rhrBase = baselineBefore(state, activeKey, "rhr");

    let STR = 10 + avgEnergy / 13 + strengthCount * 1.15;
    let AGI = 10 + avgSteps / 210 + cardioCount * 1.25;
    let VIT = 10 + ((mean(recSeries) || 45) * 0.6) + ((mean(sleepSeries) || 50) * 0.25);
    let INT = 12 + consistency * 0.45 + Math.min(20, (avgHrv || 50) / 5) + Math.min(16, computeStreak(state) * 1.8);
    let PER = 50;
    if (avgHrv && hrvBase) PER += clamp((avgHrv / hrvBase - 1) * 70, -25, 25);
    if (avgRhr && rhrBase) PER += clamp((rhrBase - avgRhr) * 2.2, -15, 15);
    if (mean(recSeries)) PER += ((mean(recSeries) - 55) / 45) * 12;

    const clean = (n) => Math.round(clamp(n, 8, 99));
    return {
      STR: clean(STR),
      AGI: clean(AGI),
      VIT: clean(VIT),
      INT: clean(INT),
      PER: clean(PER)
    };
  }

  function buildInsights(state, dash) {
    const out = [];
    const s = dash.scores;
    if (!dash.hasData) {
      out.push({ tone: "warn", text: "<strong>No archive detected.</strong> The System requires health data before it can evaluate your body." });
      return out;
    }
    if (s.recovery !== null && s.recovery >= 78) {
      out.push({ tone: "good", text: "<strong>Recovery is primed.</strong> Your nervous system is ready for a high-load gate. Push the intensity today." });
    } else if (s.recovery !== null && s.recovery < 40) {
      out.push({ tone: "warn", text: "<strong>Recovery is suppressed.</strong> HRV and resting heart rate suggest accumulated fatigue. Choose restoration over strain." });
    }
    if (s.sleep !== null && s.sleep < 55) {
      out.push({ tone: "warn", text: "<strong>Mana reserves are low.</strong> Sleep debt is limiting adaptation. Protect a 7.5–8.5 hour window tonight." });
    } else if (s.sleep !== null && s.sleep >= 82) {
      out.push({ tone: "good", text: "<strong>Deep restoration detected.</strong> Sleep architecture is supporting muscle repair and hormone balance." });
    }
    if (s.strain !== null && s.strain >= 15) {
      out.push({ tone: "warn", text: "<strong>Strain threshold crossed.</strong> Today's load is high. Keep tomorrow's gate light and prioritize protein and sleep." });
    } else if (s.strain !== null && s.strain <= 4) {
      out.push({ tone: "", text: "<strong>Low load detected.</strong> Your body is under-stimulated. A 30-minute gate would raise adaptation without excessive fatigue." });
    }
    if (dash.day && dash.day.steps < 5000 && s.strain !== null && s.strain < 10) {
      out.push({ tone: "warn", text: "<strong>Movement is stagnant.</strong> Baseline steps are below the System's minimum. A walk clears the weakest gate." });
    }
    if (dash.streak >= 7) {
      out.push({ tone: "good", text: "<strong>" + dash.streak + "-day streak confirmed.</strong> Consistency is compounding. The Shadow Army recognizes your discipline." });
    }
    if (dash.hrvDelta !== null && dash.hrvDelta >= 0.15) {
      out.push({ tone: "good", text: "<strong>HRV is elevated " + Math.round(dash.hrvDelta * 100) + "%</strong> above baseline — a strong signal of parasympathetic readiness." });
    }
    if (!out.length) {
      out.push({ tone: "", text: "<strong>System stable.</strong> Metrics are within expected ranges. Continue the current protocol and re-sync after your next sleep cycle." });
    }
    return out.slice(0, 3);
  }

  /* ---------------------------------------------------------
     quests
     --------------------------------------------------------- */
  function questKey(quest) {
    const daily = quest.type === "daily";
    const period = daily ? todayKey() : weekStartKey(todayKey());
    return period + "|" + quest.type + "|" + quest.id;
  }

  function weekStartKey(key) {
    const d = parseKey(key);
    const day = (d.getDay() + 6) % 7; // monday = 0
    d.setDate(d.getDate() - day);
    return keyOf(d);
  }

  function buildQuests(state, dash) {
    const day = dash.day || {};
    const map = workoutsByDate(state);
    const todayWorkouts = map[dash.activeKey] || [];
    const dataAvailable = !!dash.day;
    const daily = [
      {
        id: "steps", type: "daily", title: "Path of Ten Thousand Steps",
        desc: "Walk 10,000 steps", target: 10000, value: day.steps || 0, unit: "steps", xp: 60,
        available: dataAvailable
      },
      {
        id: "exercise", type: "daily", title: "Tempering the Body",
        desc: "Log 30 exercise minutes", target: 30, value: day.exerciseMinutes || 0, unit: "min", xp: 60,
        available: dataAvailable
      },
      {
        id: "gate", type: "daily", title: "Clear One Gate",
        desc: "Complete a workout", target: 1, value: todayWorkouts.length, unit: "", xp: 80,
        available: dataAvailable
      },
      {
        id: "sleep", type: "daily", title: "Mana Recovery",
        desc: "Sleep at least 7 hours", target: 7, value: day.sleepHours || 0, unit: "h", xp: 60,
        available: dataAvailable
      },
      {
        id: "recovery", type: "daily", title: "Readiness Protocol",
        desc: "Reach a 60 recovery score", target: 60, value: dash.scores.recovery || 0, unit: "",
        xp: 70, available: dash.scores.recovery !== null
      }
    ];

    const weekKeys = lastNDaysEnding(dash.activeKey, 7);
    const weekStart = weekKeys[0];
    const weekEnd = weekKeys[weekKeys.length - 1];
    const weekWorkouts = (state.workouts || []).filter((w) => w.date >= weekStart && w.date <= weekEnd);
    const weekSteps = weekKeys.reduce((s, k) => s + ((state.days[k] && state.days[k].steps) || 0), 0);
    const weekExercise = weekKeys.reduce((s, k) => s + ((state.days[k] && state.days[k].exerciseMinutes) || 0), 0);
    const recoveryDays = weekKeys.filter((k) => {
      const r = recoveryForDay(state, k);
      return r !== null && r >= 60;
    }).length;

    const weekly = [
      {
        id: "gates5", type: "weekly", title: "Legion Maneuvers",
        desc: "Clear 5 gates this week", target: 5, value: weekWorkouts.length, unit: "gates", xp: 160
      },
      {
        id: "steps50", type: "weekly", title: "Territory Survey",
        desc: "Accumulate 50,000 steps", target: 50000, value: weekSteps, unit: "steps", xp: 180
      },
      {
        id: "recovery5", type: "weekly", title: "Restoration Doctrine",
        desc: "5 days above 60 recovery", target: 5, value: recoveryDays, unit: "days", xp: 200
      },
      {
        id: "move300", type: "weekly", title: "Forge Endurance",
        desc: "Log 300 exercise minutes", target: 300, value: weekExercise, unit: "min", xp: 180
      }
    ];
    weekly.forEach((q) => { q.available = dataAvailable; });

    const prep = (q) => {
      const available = q.available !== false;
      const value = q.value || 0;
      const complete = available && value >= q.target;
      const progress = available ? clamp(value / q.target, 0, 1) : 0;
      const claimed = !!state.claimed[questKey(q)];
      return { ...q, available, value, complete, progress, claimed };
    };

    const dailyOut = daily.map(prep);
    const weeklyOut = weekly.map(prep);
    return {
      daily: dailyOut,
      weekly: weeklyOut,
      dailyDone: dailyOut.filter((q) => q.complete).length,
      dailyAvailable: dailyOut.filter((q) => q.available).length,
      weeklyDone: weeklyOut.filter((q) => q.complete).length,
      weeklyAvailable: weeklyOut.length
    };
  }

  /* ---------------------------------------------------------
     dashboard
     --------------------------------------------------------- */
  function computeDashboard(state) {
    const today = todayKey();
    const keys = Object.keys(state.days).sort();
    const hasData = keys.length > 0;
    const activeKey = state.days[today] ? today : (keys.length ? keys[keys.length - 1] : today);
    const day = state.days[activeKey] || null;
    const map = workoutsByDate(state);
    const workouts = (state.workouts || []).slice().sort((a, b) => (b.start || "").localeCompare(a.start || ""));
    const workoutsToday = map[activeKey] || [];

    const baselines = {
      hrv: hasData ? baselineBefore(state, activeKey, "hrv") : null,
      rhr: hasData ? baselineBefore(state, activeKey, "rhr") : null,
      respiratory: hasData ? baselineBefore(state, activeKey, "respiratory") : null,
      wristTemp: hasData ? baselineBefore(state, activeKey, "wristTemp") : null
    };

    const scores = {
      recovery: hasData ? recoveryScore(day, baselines) : null,
      sleep: hasData ? sleepScore(day) : null,
      strain: hasData ? strainScore(day, workoutsToday) : null
    };

    const seriesKeys = lastNDaysEnding(activeKey, 7);
    const series = {
      recovery: seriesKeys.map((k) => recoveryForDay(state, k)),
      sleep: seriesKeys.map((k) => sleepForDay(state, k)),
      strain: seriesKeys.map((k) => strainForDay(state, k, map))
    };

    const xp = totalXp(state);
    const level = levelInfo(xp);
    const streak = computeStreak(state);
    const stats = computeStats(state, activeKey, scores);

    let hrvDelta = null;
    if (day && day.hrv && baselines.hrv) hrvDelta = day.hrv / baselines.hrv - 1;

    const heat = [];
    const heatStart = keyAdd(weekStartKey(today), -28);
    const heatKeys = [];
    for (let i = 0; i < 35; i++) heatKeys.push(keyAdd(heatStart, i));
    heatKeys.forEach((k) => {
      const d = state.days[k];
      const steps = d ? d.steps || 0 : 0;
      let level = 0;
      if (steps >= 12000) level = 4;
      else if (steps >= 9000) level = 3;
      else if (steps >= 6000) level = 2;
      else if (steps >= 3000) level = 1;
      else if (d && (d.sleepHours || d.hrv)) level = 1;
      heat.push({ key: k, steps, level, isToday: k === today, isFuture: k > today });
    });

    const dash = {
      today,
      activeKey,
      day,
      hasData,
      baselines,
      scores,
      series,
      level,
      streak,
      stats,
      hrvDelta,
      workouts,
      workoutsToday,
      heat,
      totalXp: xp,
      baseXp: baseXp(state),
      archive: state.lastImport || null
    };

    dash.quests = buildQuests(state, dash);
    dash.insights = buildInsights(state, dash);

    const last30 = (state.workouts || []).filter((w) => w.date >= keyAdd(today, -30));
    dash.gateStats = {
      count30: last30.length,
      load30: round(last30.reduce((s, w) => s + (w.strain || 0), 0), 1),
      time30: last30.reduce((s, w) => s + (w.duration || 0), 0),
      topRank: last30.reduce((top, w) => {
        const order = "EDCBAS";
        return order.indexOf(w.rank) > order.indexOf(top) ? w.rank : top;
      }, "E")
    };

    return dash;
  }

  /* ---------------------------------------------------------
     accumulator / import pipeline
     --------------------------------------------------------- */
  function createAcc() {
    return { days: {}, workouts: [], counts: {}, recordCount: 0 };
  }

  function accDay(acc, key) {
    let d = acc.days[key];
    if (!d) {
      d = {
        steps: 0, activeEnergy: 0, basalEnergy: 0, exerciseMinutes: 0,
        sleepHours: 0, deepHours: 0, remHours: 0, coreHours: 0, awakeHours: 0,
        hrv: null, rhr: null, respiratory: null, vo2max: null, wristTemp: null,
        hrAvg: null, hrMin: null, hrMax: null, workouts: 0,
        _avg: {}
      };
      acc.days[key] = d;
    }
    return d;
  }

  function addAvg(day, metric, value) {
    if (!(value > 0)) return;
    if (!day._avg[metric]) day._avg[metric] = { sum: 0, count: 0 };
    day._avg[metric].sum += value;
    day._avg[metric].count++;
  }

  function bumpCount(acc, metric) {
    acc.counts[metric] = (acc.counts[metric] || 0) + 1;
  }

  function gateNameFor(raw) {
    const found = GATE_NAMES.find((g) => g.test.test(raw || ""));
    return found || { name: "Uncharted Gate", type: "other" };
  }

  function gateRank(duration, energy) {
    const load = (duration || 0) * 2 + (energy || 0) * 0.55;
    if (load >= 700) return "S";
    if (load >= 520) return "A";
    if (load >= 380) return "B";
    if (load >= 260) return "C";
    if (load >= 150) return "D";
    return "E";
  }

  function gateXp(duration, energy, rank) {
    const bonus = { E: 3, D: 8, C: 15, B: 25, A: 40, S: 60 }[rank] || 0;
    return Math.round((duration || 0) * 1.1 + (energy || 0) / 14 + bonus);
  }

  function addWorkout(acc, data) {
    const start = parseDate(data.start);
    if (!start) return;
    const date = keyOf(start);
    const raw = String(data.rawName || data.name || "Workout");
    const gate = gateNameFor(raw);
    let duration = data.duration;
    if (!(duration > 0) && data.end) {
      const end = parseDate(data.end);
      if (end) duration = (end.getTime() - start.getTime()) / 60000;
    }
    duration = clamp(duration || 0, 0, 1440);
    const energy = clamp(data.energy || 0, 0, 5000);
    const rank = gateRank(duration, energy);
    const workout = {
      id: uid(),
      raw,
      name: gate.name,
      type: gate.type,
      date,
      start: start.toISOString(),
      end: data.end ? (parseDate(data.end) || start).toISOString() : null,
      duration: round(duration, 1),
      energy: Math.round(energy),
      rank,
      xp: gateXp(duration, energy, rank),
      strain: round((duration / 60) * workoutIntensity({ duration, energy }), 1),
      source: data.source || ""
    };
    acc.workouts.push(workout);
    const day = accDay(acc, date);
    day.workouts++;
    acc.recordCount++;
    bumpCount(acc, "workouts");
  }

  function finalizeAcc(acc) {
    const map = {};
    acc.workouts.forEach((w) => {
      (map[w.date] = map[w.date] || []).push(w);
    });

    Object.keys(acc.days).forEach((key) => {
      const d = acc.days[key];

      if (d._avg.hrv && d._avg.hrv.count) d.hrv = Math.round(d._avg.hrv.sum / d._avg.hrv.count);
      if (d._avg.rhr && d._avg.rhr.count) d.rhr = Math.round(d._avg.rhr.sum / d._avg.rhr.count);
      if (d._avg.respiratory && d._avg.respiratory.count) d.respiratory = round(d._avg.respiratory.sum / d._avg.respiratory.count, 1);
      if (d._avg.vo2max && d._avg.vo2max.count) d.vo2max = round(d._avg.vo2max.sum / d._avg.vo2max.count, 1);
      if (d._avg.wristTemp && d._avg.wristTemp.count) d.wristTemp = round(d._avg.wristTemp.sum / d._avg.wristTemp.count, 2);
      if (d._avg.hrAvg && d._avg.hrAvg.count) d.hrAvg = Math.round(d._avg.hrAvg.sum / d._avg.hrAvg.count);
      delete d._avg;

      const staged = (d.deepHours || 0) + (d.remHours || 0) + (d.coreHours || 0);
      if (staged > 0) d.sleepHours = staged;

      if (!(d.exerciseMinutes > 0) && map[key] && map[key].length) {
        d.exerciseMinutes = Math.round(map[key].reduce((s, w) => s + w.duration, 0));
      }

      ["steps", "activeEnergy", "basalEnergy", "exerciseMinutes"].forEach((m) => { d[m] = Math.round(d[m] || 0); });
      ["sleepHours", "deepHours", "remHours", "coreHours", "awakeHours"].forEach((m) => { d[m] = round(d[m] || 0, 2); });

      const meaningful = d.steps || d.activeEnergy || d.exerciseMinutes || d.sleepHours || d.hrv || d.rhr || d.respiratory || d.vo2max || d.wristTemp || d.hrAvg || d.workouts;
      if (!meaningful) delete acc.days[key];
    });

    acc.workouts.sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  }

  function buildResult(acc, source, filename) {
    finalizeAcc(acc);
    const keys = Object.keys(acc.days).sort();
    if (!keys.length && !acc.workouts.length) {
      throw new Error("No supported health records were found in this data.");
    }
    const metrics = Object.keys(acc.counts).filter((k) => acc.counts[k] > 0);
    return {
      days: acc.days,
      workouts: acc.workouts,
      meta: {
        source,
        filename,
        days: keys.length,
        workouts: acc.workouts.length,
        records: acc.recordCount,
        rangeStart: keys[0] || null,
        rangeEnd: keys[keys.length - 1] || null,
        metrics
      }
    };
  }

  function parseAttrs(str) {
    const out = {};
    const re = /([A-Za-z0-9:_-]+)="([^"]*)"/g;
    let m;
    while ((m = re.exec(str))) out[m[1]] = m[2];
    return out;
  }

  function durationMinutes(value, unit) {
    const v = num(value);
    const u = String(unit || "min").toLowerCase();
    if (u === "sec" || u === "s" || u === "seconds") return v / 60;
    if (u === "hr" || u === "h" || u === "hours") return v * 60;
    return v;
  }

  function energyKcal(value, unit) {
    const v = num(value);
    const u = String(unit || "kcal").toLowerCase();
    return u === "kj" ? v / 4.184 : v;
  }

  function parseAppleHealthXML(text, filename) {
    const acc = createAcc();
    const recordRe = /<Record\b([^>]*?)\/?>/g;
    const workoutRe = /<Workout\b([^>]*?)\/?>/g;
    let m;

    while ((m = recordRe.exec(text))) {
      const a = parseAttrs(m[1]);
      const type = a.type || "";
      if (!type || a.value === undefined) continue;
      const start = parseDate(a.startDate);
      if (!start) continue;
      const key = keyOf(start);
      const value = num(a.value);

      if (type.indexOf("SleepAnalysis") !== -1) {
        const end = parseDate(a.endDate) || start;
        const hours = clamp((end.getTime() - start.getTime()) / 3600000, 0, 24);
        if (!(hours > 0)) continue;
        const d = accDay(acc, keyOf(end));
        const v = String(a.value || "").toLowerCase();
        if (v.indexOf("awake") !== -1) {
          d.awakeHours += hours;
        } else if (v.indexOf("inbed") !== -1 || v.indexOf("in_bed") !== -1) {
          /* ignore in-bed spans */
        } else if (v.indexOf("deep") !== -1) {
          d.deepHours += hours;
          d.sleepHours += hours;
        } else if (v.indexOf("rem") !== -1) {
          d.remHours += hours;
          d.sleepHours += hours;
        } else if (v.indexOf("asleep") !== -1 || v.indexOf("core") !== -1) {
          d.coreHours += hours;
          d.sleepHours += hours;
        }
        bumpCount(acc, "sleepHours");
        acc.recordCount++;
        continue;
      }

      const day = accDay(acc, key);
      switch (type) {
        case "HKQuantityTypeIdentifierStepCount":
          day.steps += value; bumpCount(acc, "steps"); break;
        case "HKQuantityTypeIdentifierActiveEnergyBurned":
          day.activeEnergy += energyKcal(value, a.unit); bumpCount(acc, "activeEnergy"); break;
        case "HKQuantityTypeIdentifierBasalEnergyBurned":
          day.basalEnergy += energyKcal(value, a.unit); bumpCount(acc, "basalEnergy"); break;
        case "HKQuantityTypeIdentifierAppleExerciseTime":
          day.exerciseMinutes += value; bumpCount(acc, "exerciseMinutes"); break;
        case "HKQuantityTypeIdentifierHeartRateVariabilitySDNN":
          addAvg(day, "hrv", value); bumpCount(acc, "hrv"); break;
        case "HKQuantityTypeIdentifierRestingHeartRate":
          addAvg(day, "rhr", value); bumpCount(acc, "rhr"); break;
        case "HKQuantityTypeIdentifierRespiratoryRate":
          addAvg(day, "respiratory", value); bumpCount(acc, "respiratory"); break;
        case "HKQuantityTypeIdentifierVO2Max":
          addAvg(day, "vo2max", value); bumpCount(acc, "vo2max"); break;
        case "HKQuantityTypeIdentifierAppleSleepingWristTemperature":
          addAvg(day, "wristTemp", value); bumpCount(acc, "wristTemp"); break;
        case "HKQuantityTypeIdentifierHeartRate":
          addAvg(day, "hrAvg", value);
          if (!day.hrMin || value < day.hrMin) day.hrMin = value;
          if (!day.hrMax || value > day.hrMax) day.hrMax = value;
          bumpCount(acc, "heartRate");
          break;
        default:
          continue;
      }
      acc.recordCount++;
    }

    while ((m = workoutRe.exec(text))) {
      const a = parseAttrs(m[1]);
      if (!a.startDate) continue;
      let dur = durationMinutes(a.duration, a.durationUnit);
      if (!(dur > 0) && a.endDate) {
        const s = parseDate(a.startDate);
        const e = parseDate(a.endDate);
        if (s && e) dur = (e.getTime() - s.getTime()) / 60000;
      }
      addWorkout(acc, {
        rawName: a.workoutActivityType || a.type || "Workout",
        start: a.startDate,
        end: a.endDate,
        duration: dur,
        energy: energyKcal(a.totalEnergyBurned, a.totalEnergyBurnedUnit),
        source: a.sourceName || "Apple Watch"
      });
    }

    return buildResult(acc, "Apple Health", filename);
  }

  /* ---------------------------------------------------------
     Health Auto Export JSON
     --------------------------------------------------------- */
  function normalizeMetricName(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  const HAE_MAP = {
    stepcount: "steps", steps: "steps",
    activeenergy: "activeEnergy", activeenergyburned: "activeEnergy", activeenergyburnedkcal: "activeEnergy",
    basalenergyburned: "basalEnergy",
    appleexercisetime: "exerciseMinutes", exercisetime: "exerciseMinutes", exercise: "exerciseMinutes",
    heartratevariability: "hrv", hrv: "hrv", heartratevariabilitysdnn: "hrv",
    restingheartrate: "rhr",
    respiratoryrate: "respiratory",
    vo2max: "vo2max",
    applesleepingwristtemperature: "wristTemp", wristtemperature: "wristTemp",
    heartrate: "heartRate"
  };

  function ingestSleepMetric(acc, item) {
    (item.data || []).forEach((entry) => {
      const date = parseDate(entry.date || entry.startDate || entry.start);
      if (!date) return;
      const d = accDay(acc, keyOf(date));
      const units = String(item.units || entry.units || "hr").toLowerCase();
      const scale = units === "min" || units === "minutes" ? 1 / 60 : units === "sec" ? 1 / 3600 : 1;

      const stage = String(entry.value || entry.stage || entry.sleepStage || "").toLowerCase();
      const explicitTotal = entry.totalSleep !== undefined || entry.asleep !== undefined || entry.sleep !== undefined;
      const deepRaw = entry.deep !== undefined ? entry.deep : entry.deepSleep;
      const remRaw = entry.rem !== undefined ? entry.rem : entry.remSleep;
      const coreRaw = entry.core !== undefined ? entry.core : entry.coreSleep;
      const awakeRaw = entry.awake !== undefined ? entry.awake : entry.awakeSleep;

      // Stage-per-entry exports: value says "Deep"/"REM"/... and qty is hours in that stage.
      if (stage && !explicitTotal && deepRaw === undefined && remRaw === undefined && coreRaw === undefined && awakeRaw === undefined) {
        const h = num(entry.qty !== undefined ? entry.qty : entry.duration) * scale;
        if (h > 0) {
          if (stage.indexOf("deep") !== -1) d.deepHours += h;
          else if (stage.indexOf("rem") !== -1) d.remHours += h;
          else if (stage.indexOf("awake") !== -1) d.awakeHours += h;
          else d.coreHours += h;
        }
        acc.recordCount++;
        bumpCount(acc, "sleepHours");
        return;
      }

      const total = num(explicitTotal ? (entry.totalSleep !== undefined ? entry.totalSleep : entry.asleep !== undefined ? entry.asleep : entry.sleep) : entry.qty) * scale;
      const deep = num(deepRaw) * scale;
      const rem = num(remRaw) * scale;
      const core = num(coreRaw) * scale;
      const awake = num(awakeRaw) * scale;

      if (total > 0) d.sleepHours = Math.max(d.sleepHours, total);
      if (deep > 0) d.deepHours = Math.max(d.deepHours, deep);
      if (rem > 0) d.remHours = Math.max(d.remHours, rem);
      if (core > 0) d.coreHours = Math.max(d.coreHours, core);
      if (awake > 0) d.awakeHours = Math.max(d.awakeHours, awake);
      acc.recordCount++;
      bumpCount(acc, "sleepHours");
    });
  }

  function parseHAEJson(json, filename) {
    const acc = createAcc();
    const root = json && json.data ? json.data : json;
    if (root && typeof root === "object" && !Array.isArray(root) && (root.metrics || root.workouts)) {
      const metrics = root.metrics || [];
      metrics.forEach((item) => {
        if (!item) return;
        const norm = normalizeMetricName(item.name);
        if (norm.indexOf("sleep") !== -1 && norm.indexOf("temperature") === -1) {
          ingestSleepMetric(acc, item);
          return;
        }
        const key = HAE_MAP[norm];
        if (!key) return;
        const units = String(item.units || "").toLowerCase();

        (item.data || []).forEach((entry) => {
          const date = parseDate(entry.date || entry.startDate || entry.start);
          if (!date) return;
          const day = accDay(acc, keyOf(date));
          let value = num(entry.qty !== undefined ? entry.qty : (entry.value !== undefined ? entry.value : (entry.Avg !== undefined ? entry.Avg : entry.avg)));

          if (key === "exerciseMinutes" && (units === "s" || units === "sec" || units === "seconds")) value /= 60;
          if (key === "activeEnergy" && units === "kj") value /= 4.184;
          if (key === "basalEnergy" && units === "kj") value /= 4.184;
          if (!(value > 0)) return;

          switch (key) {
            case "steps": day.steps += value; break;
            case "activeEnergy": day.activeEnergy += value; break;
            case "basalEnergy": day.basalEnergy += value; break;
            case "exerciseMinutes": day.exerciseMinutes += value; break;
            case "hrv": addAvg(day, "hrv", value); break;
            case "rhr": addAvg(day, "rhr", value); break;
            case "respiratory": addAvg(day, "respiratory", value); break;
            case "vo2max": addAvg(day, "vo2max", value); break;
            case "wristTemp": addAvg(day, "wristTemp", value); break;
            case "heartRate": addAvg(day, "hrAvg", value); break;
            default: return;
          }
          bumpCount(acc, key);
          acc.recordCount++;
        });
      });

      (root.workouts || []).forEach((w) => {
        if (!w) return;
        const start = w.start || w.startDate;
        const end = w.end || w.endDate;
        let duration = num(w.duration);
        if (duration > 600 && !(w.durationUnit && /min/i.test(w.durationUnit))) duration /= 60;
        if (!(duration > 0) && start && end) {
          const s = parseDate(start);
          const e = parseDate(end);
          if (s && e) duration = (e.getTime() - s.getTime()) / 60000;
        }
        const energyRaw = w.activeEnergy !== undefined ? w.activeEnergy
          : (w.activeEnergyBurned !== undefined ? w.activeEnergyBurned
            : (w.totalEnergy !== undefined ? w.totalEnergy : w.calories));
        const energy = num(energyRaw);
        addWorkout(acc, {
          rawName: w.name || w.workoutActivityType || w.type || "Workout",
          start,
          end,
          duration,
          energy,
          source: "Health Auto Export"
        });
      });

      return buildResult(acc, "Health Auto Export", filename);
    }

    // Tolerate an array of metric objects.
    if (Array.isArray(root)) {
      const fake = { metrics: root, workouts: [] };
      return parseHAEJson({ data: fake }, filename);
    }

    throw new Error("Unrecognized JSON structure. Use a Health Auto Export backup (metrics + workouts).");
  }

  /* ---------------------------------------------------------
     ZIP reader (Apple Health export.zip)
     --------------------------------------------------------- */
  function findEntry(files) {
    const pick = (re) => files.filter((f) => re.test(f.name)).sort((a, b) => b.uncompressed - a.uncompressed)[0];
    return pick(/export\.xml$/i) || pick(/\.xml$/i);
  }

  async function extractZipXml(buffer) {
    const dv = new DataView(buffer);
    const u8 = new Uint8Array(buffer);
    let eocd = -1;
    const min = Math.max(0, u8.length - 66560);
    for (let i = u8.length - 22; i >= min; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("This ZIP appears to be invalid or unsupported.");
    const entries = dv.getUint16(eocd + 10, true);
    let offset = dv.getUint32(eocd + 16, true);
    const files = [];
    for (let i = 0; i < entries; i++) {
      if (dv.getUint32(offset, true) !== 0x02014b50) break;
      const method = dv.getUint16(offset + 10, true);
      const compressed = dv.getUint32(offset + 20, true);
      const uncompressed = dv.getUint32(offset + 24, true);
      const nameLen = dv.getUint16(offset + 28, true);
      const extraLen = dv.getUint16(offset + 30, true);
      const commentLen = dv.getUint16(offset + 32, true);
      const localOffset = dv.getUint32(offset + 42, true);
      const name = new TextDecoder().decode(u8.slice(offset + 46, offset + 46 + nameLen));
      files.push({ name, method, compressed, uncompressed, localOffset });
      offset += 46 + nameLen + extraLen + commentLen;
    }
    const chosen = findEntry(files);
    if (!chosen) throw new Error("No health XML file was found inside this ZIP.");
    if (chosen.compressed === 0xffffffff) throw new Error("ZIP64 archives are not supported. Please unzip and select export.xml.");

    const lo = chosen.localOffset;
    if (dv.getUint32(lo, true) !== 0x04034b50) throw new Error("Corrupt ZIP entry header.");
    const nameLen = dv.getUint16(lo + 26, true);
    const extraLen = dv.getUint16(lo + 28, true);
    const start = lo + 30 + nameLen + extraLen;
    let data = u8.slice(start, start + chosen.compressed);

    if (chosen.method === 8) {
      if (typeof DecompressionStream === "undefined") {
        throw new Error("Your browser cannot unzip files. Unzip the archive and import export.xml directly.");
      }
      const ds = new DecompressionStream("deflate-raw");
      const stream = new Blob([data]).stream().pipeThrough(ds);
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    } else if (chosen.method !== 0) {
      throw new Error("Unsupported ZIP compression. Please unzip and import export.xml.");
    }
    return new TextDecoder("utf-8").decode(data);
  }

  async function parseHealthFile(file) {
    if (!file) throw new Error("No file selected.");
    const name = (file.name || "health-archive").toLowerCase();

    if (name.endsWith(".zip")) {
      const buffer = await file.arrayBuffer();
      const xml = await extractZipXml(buffer);
      return parseAppleHealthXML(xml, file.name);
    }

    if (name.endsWith(".json")) {
      const text = await file.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (err) {
        throw new Error("The JSON file could not be parsed.");
      }
      return parseHAEJson(json, file.name);
    }

    const text = await file.text();
    if (name.endsWith(".xml") || /<HealthData|<Record\b/i.test(text.slice(0, 4000))) {
      return parseAppleHealthXML(text, file.name);
    }

    const trimmed = text.trim();
    if (trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[") {
      return parseHAEJson(JSON.parse(trimmed), file.name);
    }
    throw new Error("Unsupported file. Import an Apple Health export.xml, export.zip, or Health Auto Export JSON.");
  }

  /* ---------------------------------------------------------
     apply import
     --------------------------------------------------------- */
  function buildLiveResult(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
      throw new Error("Invalid live health snapshot.");
    }
    const acc = createAcc();
    const dayMap = snapshot.days || {};
    const fields = [
      "steps", "activeEnergy", "basalEnergy", "exerciseMinutes",
      "sleepHours", "deepHours", "remHours", "coreHours", "awakeHours",
      "hrv", "rhr", "respiratory", "vo2max", "wristTemp",
      "hrAvg", "hrMin", "hrMax"
    ];

    Object.keys(dayMap).forEach((key) => {
      const src = dayMap[key] || {};
      const d = accDay(acc, key);
      fields.forEach((metric) => {
        const value = src[metric];
        if (typeof value === "number" && isFinite(value) && value > 0) d[metric] = value;
      });
    });

    (snapshot.workouts || []).forEach((w) => {
      addWorkout(acc, {
        rawName: w.rawName || w.name || "Workout",
        start: w.start,
        end: w.end || null,
        duration: w.duration,
        energy: w.energy,
        source: w.source || "Google Fit"
      });
    });

    acc.recordCount = Math.max(acc.recordCount, Number(snapshot.records) || 0);
    if (Array.isArray(snapshot.metrics) && snapshot.metrics.length) {
      snapshot.metrics.forEach((m) => bumpCount(acc, m));
    } else {
      fields.forEach((metric) => {
        if (Object.keys(acc.days).some((k) => acc.days[k][metric] > 0)) bumpCount(acc, metric);
      });
    }

    return buildResult(
      acc,
      snapshot.source || "Google Fit",
      snapshot.filename || "google-fit-live"
    );
  }

  function applyImport(state, result) {
    const meta = result.meta;
    const importRecord = {
      id: uid(),
      at: new Date().toISOString(),
      filename: meta.filename,
      source: meta.source,
      days: meta.days,
      workouts: meta.workouts,
      records: meta.records,
      rangeStart: meta.rangeStart,
      rangeEnd: meta.rangeEnd
    };
    return {
      ...state,
      days: result.days,
      workouts: result.workouts,
      lastSync: importRecord.at,
      lastImport: {
        source: meta.source,
        filename: meta.filename,
        days: meta.days,
        workouts: meta.workouts,
        records: meta.records,
        rangeStart: meta.rangeStart,
        rangeEnd: meta.rangeEnd,
        metrics: meta.metrics
      },
      imports: [importRecord, ...(state.imports || [])].slice(0, 12)
    };
  }

  /* ---------------------------------------------------------
     demo archive
     --------------------------------------------------------- */
  function generateDemo() {
    const acc = createAcc();
    const today = todayKey();
    const rnd = (min, max) => min + Math.random() * (max - min);
    const r1 = (n) => Math.round(n * 10) / 10;

    const workoutPool = [
      { raw: "Outdoor Run", min: 24, max: 52, kcal: 300, kcalRange: 180 },
      { raw: "Traditional Strength Training", min: 35, max: 65, kcal: 340, kcalRange: 180 },
      { raw: "Indoor Cycling", min: 30, max: 70, kcal: 380, kcalRange: 220 },
      { raw: "Functional Strength Training", min: 28, max: 50, kcal: 290, kcalRange: 140 },
      { raw: "Hiking", min: 50, max: 110, kcal: 430, kcalRange: 260 },
      { raw: "Yoga", min: 25, max: 45, kcal: 140, kcalRange: 90 },
      { raw: "HIIT", min: 20, max: 40, kcal: 320, kcalRange: 150 },
      { raw: "Swimming", min: 30, max: 55, kcal: 360, kcalRange: 160 },
      { raw: "Rowing", min: 20, max: 45, kcal: 310, kcalRange: 140 }
    ];

    for (let offset = 39; offset >= 0; offset--) {
      const key = keyAdd(today, -offset);
      const date = parseKey(key);
      const weekend = date.getDay() === 0 || date.getDay() === 6;
      const recency = (39 - offset) / 39;
      const day = accDay(acc, key);

      if (offset === 0) {
        day.steps = 10420;
        day.activeEnergy = 612;
        day.basalEnergy = 1710;
        day.exerciseMinutes = 46;
        day.sleepHours = 7.9;
        day.deepHours = 1.72;
        day.remHours = 2.04;
        day.coreHours = 4.14;
        day.awakeHours = 0.32;
        day.hrv = 71;
        day.rhr = 51;
        day.respiratory = 14.6;
        day.vo2max = 49.2;
        day.wristTemp = 36.12;
        day.hrAvg = 64;
        acc.counts.steps = (acc.counts.steps || 0) + 1;
        acc.counts.activeEnergy = (acc.counts.activeEnergy || 0) + 1;
        acc.counts.exerciseMinutes = (acc.counts.exerciseMinutes || 0) + 1;
        acc.counts.sleepHours = (acc.counts.sleepHours || 0) + 1;
        acc.counts.hrv = (acc.counts.hrv || 0) + 1;
        acc.counts.rhr = (acc.counts.rhr || 0) + 1;
        acc.counts.respiratory = (acc.counts.respiratory || 0) + 1;
        acc.counts.vo2max = (acc.counts.vo2max || 0) + 1;
        acc.counts.wristTemp = (acc.counts.wristTemp || 0) + 1;
        acc.counts.heartRate = (acc.counts.heartRate || 0) + 1;

        addWorkout(acc, {
          rawName: "Traditional Strength Training",
          start: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 18, 10).toISOString(),
          duration: 52,
          energy: 392,
          source: "Demo Watch"
        });
        continue;
      }

      const sleep = r1(rnd(6.0, 8.5) + recency * 0.2);
      const deepShare = rnd(0.16, 0.24);
      const remShare = rnd(0.19, 0.27);
      day.steps = Math.round(rnd(4300, 11800) + (weekend ? 1900 : 0) + recency * 500);
      day.activeEnergy = Math.max(120, Math.round(day.steps * rnd(0.042, 0.055) + rnd(-40, 70)));
      day.basalEnergy = Math.round(rnd(1620, 1780));
      day.exerciseMinutes = Math.round(Math.max(0, rnd(6, 48) + (weekend ? 10 : 0)));
      day.sleepHours = sleep;
      day.deepHours = r1(sleep * deepShare);
      day.remHours = r1(sleep * remShare);
      day.coreHours = r1(sleep - day.deepHours - day.remHours);
      day.awakeHours = r1(rnd(0.08, 0.55));
      day.hrv = Math.round(rnd(43, 79) + (sleep - 7) * 6 + recency * 4);
      day.rhr = Math.round(rnd(48, 60) - (sleep - 7) * 2);
      day.respiratory = r1(rnd(13.0, 16.3));
      day.vo2max = r1(rnd(47.0, 50.2));
      day.wristTemp = Math.round(rnd(35.9, 36.35) * 100) / 100;
      day.hrAvg = Math.round(rnd(58, 75));
      acc.counts.steps = (acc.counts.steps || 0) + 1;
      acc.counts.activeEnergy = (acc.counts.activeEnergy || 0) + 1;
      acc.counts.exerciseMinutes = (acc.counts.exerciseMinutes || 0) + 1;
      acc.counts.sleepHours = (acc.counts.sleepHours || 0) + 1;
      acc.counts.hrv = (acc.counts.hrv || 0) + 1;
      acc.counts.rhr = (acc.counts.rhr || 0) + 1;
      acc.counts.respiratory = (acc.counts.respiratory || 0) + 1;
      acc.counts.vo2max = (acc.counts.vo2max || 0) + 1;
      acc.counts.wristTemp = (acc.counts.wristTemp || 0) + 1;
      acc.counts.heartRate = (acc.counts.heartRate || 0) + 1;

      const chance = offset % 7 === 0 ? 0.25 : (weekend ? 0.72 : 0.55);
      if (Math.random() < chance) {
        const pick = workoutPool[Math.floor(Math.random() * workoutPool.length)];
        const duration = Math.round(rnd(pick.min, pick.max));
        const energy = Math.round(pick.kcal + rnd(-pick.kcalRange / 2, pick.kcalRange / 2));
        const hour = weekend ? Math.round(rnd(9, 17)) : Math.round(rnd(17, 20));
        const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 15);
        addWorkout(acc, {
          rawName: pick.raw,
          start: startDate.toISOString(),
          duration,
          energy,
          source: "Demo Watch"
        });
        if (Math.random() < 0.18) {
          const second = workoutPool[Math.floor(Math.random() * workoutPool.length)];
          const dur2 = Math.round(rnd(second.min * 0.7, second.max * 0.8));
          addWorkout(acc, {
            rawName: second.raw,
            start: new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour + 1, 30).toISOString(),
            duration: dur2,
            energy: Math.round(second.kcal * 0.6),
            source: "Demo Watch"
          });
        }
      }
      acc.recordCount++;
    }

    const result = buildResult(acc, "Simulated Watch Archive", "demo-archive.json");
    result.meta.days = Object.keys(acc.days).length;
    return result;
  }

  /* ---------------------------------------------------------
     export / public API
     --------------------------------------------------------- */
  const api = {
    STORAGE_KEY,
    RANKS,
    SHADOWS,
    METRIC_LABELS,
    defaultState,
    loadState,
    saveState,
    clearState,
    normalizeState,
    computeDashboard,
    levelInfo,
    rankInfo,
    totalXp,
    parseHealthFile,
    buildLiveResult,
    applyImport,
    generateDemo,
    questKey,
    weekStartKey,
    todayKey,
    keyAdd,
    keyOf,
    parseKey,
    fmtShort,
    fmtFull,
    fmtDateTime,
    fmtNum,
    recoveryForDay,
    sleepForDay,
    TABLES: { RANKS, SHADOWS, METRIC_LABELS }
  };

  window.SystemData = api;
})();
