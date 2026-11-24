/* =========================================================
   ARISE // training grounds
   Weekly protocol, set ledger, 1RM, overload and records.
   ========================================================= */
(function () {
  "use strict";

  const D = window.SystemData;
  const UI = window.SystemUI;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (v) => UI.escape(v == null ? "" : String(v));
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const num = (v) => {
    const n = parseFloat(String(v == null ? "" : v));
    return isFinite(n) ? n : 0;
  };
  const round1 = (n) => Math.round(num(n) * 10) / 10;
  const fmt = (n) => Math.round(num(n)).toLocaleString("en-US");
  const compact = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(Math.round(n)));

  const DAY_NAMES = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
  const DAY_SHORT = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const GROUP_COLORS = { PUSH: "#57e6ff", PULL: "#8a6bff", LEGS: "#ff9a5c", CORE: "#54ffc1" };
  const TARGETS = [
    "CHEST", "SHOULDERS", "TRICEPS", "BICEPS", "BACK", "LATS", "TRAPS", "FOREARMS",
    "QUADS", "HAMSTRINGS", "GLUTES", "CALVES", "ABS", "LOWER BACK"
  ];
  const SUPERSETS = ["A", "B", "C", "D", "E", "F"];

  /* `muscle` maps to the volume chart's PUSH / PULL / LEGS / CORE segments.
     `target` is the specific muscle group shown in the plan and library. */
  const EXERCISES = [
    /* CHEST */
    { name: "Barbell Bench Press", target: "CHEST", muscle: "PUSH", kind: "compound", weight: 60 },
    { name: "Incline Barbell Bench Press", target: "CHEST", muscle: "PUSH", kind: "compound", weight: 50 },
    { name: "Decline Barbell Bench Press", target: "CHEST", muscle: "PUSH", kind: "compound", weight: 55 },
    { name: "Dumbbell Bench Press", target: "CHEST", muscle: "PUSH", kind: "accessory", weight: 24 },
    { name: "Incline Dumbbell Press", target: "CHEST", muscle: "PUSH", kind: "accessory", weight: 20 },
    { name: "Dumbbell Fly", target: "CHEST", muscle: "PUSH", kind: "accessory", weight: 14 },
    { name: "Cable Fly", target: "CHEST", muscle: "PUSH", kind: "accessory", weight: 16 },
    { name: "Cable Crossover", target: "CHEST", muscle: "PUSH", kind: "accessory", weight: 16 },
    { name: "Push-Up", target: "CHEST", muscle: "PUSH", kind: "accessory", weight: 0 },
    { name: "Chest Press Machine", target: "CHEST", muscle: "PUSH", kind: "accessory", weight: 45 },
    /* SHOULDERS */
    { name: "Barbell Overhead Press", target: "SHOULDERS", muscle: "PUSH", kind: "compound", weight: 40 },
    { name: "Dumbbell Shoulder Press", target: "SHOULDERS", muscle: "PUSH", kind: "accessory", weight: 18 },
    { name: "Arnold Press", target: "SHOULDERS", muscle: "PUSH", kind: "accessory", weight: 16 },
    { name: "Lateral Raise", target: "SHOULDERS", muscle: "PUSH", kind: "accessory", weight: 8 },
    { name: "Front Raise", target: "SHOULDERS", muscle: "PUSH", kind: "accessory", weight: 8 },
    { name: "Cable Lateral Raise", target: "SHOULDERS", muscle: "PUSH", kind: "accessory", weight: 8 },
    { name: "Rear Delt Fly", target: "SHOULDERS", muscle: "PULL", kind: "accessory", weight: 10 },
    { name: "Face Pull", target: "SHOULDERS", muscle: "PULL", kind: "accessory", weight: 22 },
    { name: "Upright Row", target: "SHOULDERS", muscle: "PULL", kind: "accessory", weight: 25 },
    /* TRICEPS */
    { name: "Triceps Pushdown", target: "TRICEPS", muscle: "PUSH", kind: "accessory", weight: 25 },
    { name: "Overhead Triceps Extension", target: "TRICEPS", muscle: "PUSH", kind: "accessory", weight: 20 },
    { name: "Skull Crusher", target: "TRICEPS", muscle: "PUSH", kind: "accessory", weight: 20 },
    { name: "Close-Grip Bench Press", target: "TRICEPS", muscle: "PUSH", kind: "compound", weight: 45 },
    { name: "Diamond Push-Up", target: "TRICEPS", muscle: "PUSH", kind: "accessory", weight: 0 },
    { name: "Bench Dip", target: "TRICEPS", muscle: "PUSH", kind: "accessory", weight: 0 },
    { name: "Cable Kickback", target: "TRICEPS", muscle: "PUSH", kind: "accessory", weight: 12 },
    /* BICEPS */
    { name: "Barbell Curl", target: "BICEPS", muscle: "PULL", kind: "accessory", weight: 25 },
    { name: "Dumbbell Curl", target: "BICEPS", muscle: "PULL", kind: "accessory", weight: 12 },
    { name: "Hammer Curl", target: "BICEPS", muscle: "PULL", kind: "accessory", weight: 12 },
    { name: "Preacher Curl", target: "BICEPS", muscle: "PULL", kind: "accessory", weight: 20 },
    { name: "Cable Curl", target: "BICEPS", muscle: "PULL", kind: "accessory", weight: 22 },
    { name: "Incline Dumbbell Curl", target: "BICEPS", muscle: "PULL", kind: "accessory", weight: 10 },
    { name: "Concentration Curl", target: "BICEPS", muscle: "PULL", kind: "accessory", weight: 10 },
    /* BACK + LATS + TRAPS */
    { name: "Barbell Bent-Over Row", target: "BACK", muscle: "PULL", kind: "compound", weight: 60 },
    { name: "T-Bar Row", target: "BACK", muscle: "PULL", kind: "compound", weight: 50 },
    { name: "Seated Cable Row", target: "BACK", muscle: "PULL", kind: "accessory", weight: 50 },
    { name: "Single-Arm Dumbbell Row", target: "BACK", muscle: "PULL", kind: "accessory", weight: 28 },
    { name: "Chest-Supported Row", target: "BACK", muscle: "PULL", kind: "accessory", weight: 40 },
    { name: "Inverted Row", target: "BACK", muscle: "PULL", kind: "accessory", weight: 0 },
    { name: "Pull-Up", target: "LATS", muscle: "PULL", kind: "compound", weight: 0 },
    { name: "Chin-Up", target: "LATS", muscle: "PULL", kind: "compound", weight: 0 },
    { name: "Lat Pulldown", target: "LATS", muscle: "PULL", kind: "accessory", weight: 50 },
    { name: "Straight-Arm Pulldown", target: "LATS", muscle: "PULL", kind: "accessory", weight: 30 },
    { name: "Barbell Shrug", target: "TRAPS", muscle: "PULL", kind: "accessory", weight: 60 },
    { name: "Dumbbell Shrug", target: "TRAPS", muscle: "PULL", kind: "accessory", weight: 24 },
    /* FOREARMS */
    { name: "Barbell Wrist Curl", target: "FOREARMS", muscle: "PULL", kind: "accessory", weight: 15 },
    { name: "Reverse Curl", target: "FOREARMS", muscle: "PULL", kind: "accessory", weight: 20 },
    { name: "Farmer's Carry", target: "FOREARMS", muscle: "PULL", kind: "accessory", weight: 40, timed: true, reps: 30 },
    { name: "Dead Hang", target: "FOREARMS", muscle: "PULL", kind: "accessory", weight: 0, timed: true, reps: 30 },
    /* QUADS */
    { name: "Barbell Back Squat", target: "QUADS", muscle: "LEGS", kind: "compound", weight: 80 },
    { name: "Front Squat", target: "QUADS", muscle: "LEGS", kind: "compound", weight: 65 },
    { name: "Leg Press", target: "QUADS", muscle: "LEGS", kind: "compound", weight: 140 },
    { name: "Hack Squat", target: "QUADS", muscle: "LEGS", kind: "compound", weight: 100 },
    { name: "Walking Lunges", target: "QUADS", muscle: "LEGS", kind: "accessory", weight: 20 },
    { name: "Bulgarian Split Squat", target: "QUADS", muscle: "LEGS", kind: "accessory", weight: 16 },
    { name: "Goblet Squat", target: "QUADS", muscle: "LEGS", kind: "accessory", weight: 20 },
    { name: "Leg Extension", target: "QUADS", muscle: "LEGS", kind: "accessory", weight: 35 },
    { name: "Step-Up", target: "QUADS", muscle: "LEGS", kind: "accessory", weight: 16 },
    { name: "Wall Sit", target: "QUADS", muscle: "LEGS", kind: "accessory", weight: 0, timed: true, reps: 30 },
    /* HAMSTRINGS */
    { name: "Romanian Deadlift", target: "HAMSTRINGS", muscle: "LEGS", kind: "compound", weight: 70 },
    { name: "Leg Curl", target: "HAMSTRINGS", muscle: "LEGS", kind: "accessory", weight: 35 },
    { name: "Lying Leg Curl", target: "HAMSTRINGS", muscle: "LEGS", kind: "accessory", weight: 35 },
    { name: "Seated Leg Curl", target: "HAMSTRINGS", muscle: "LEGS", kind: "accessory", weight: 30 },
    { name: "Nordic Curl", target: "HAMSTRINGS", muscle: "LEGS", kind: "accessory", weight: 0 },
    { name: "Good Morning", target: "HAMSTRINGS", muscle: "LEGS", kind: "accessory", weight: 40 },
    /* GLUTES */
    { name: "Barbell Deadlift", target: "GLUTES", muscle: "LEGS", kind: "compound", weight: 100 },
    { name: "Barbell Hip Thrust", target: "GLUTES", muscle: "LEGS", kind: "compound", weight: 80 },
    { name: "Glute Bridge", target: "GLUTES", muscle: "LEGS", kind: "accessory", weight: 0 },
    { name: "Cable Glute Kickback", target: "GLUTES", muscle: "LEGS", kind: "accessory", weight: 15 },
    /* CALVES */
    { name: "Calf Raise", target: "CALVES", muscle: "LEGS", kind: "accessory", weight: 45 },
    { name: "Standing Calf Raise", target: "CALVES", muscle: "LEGS", kind: "accessory", weight: 45 },
    { name: "Seated Calf Raise", target: "CALVES", muscle: "LEGS", kind: "accessory", weight: 35 },
    { name: "Donkey Calf Raise", target: "CALVES", muscle: "LEGS", kind: "accessory", weight: 60 },
    { name: "Single-Leg Calf Raise", target: "CALVES", muscle: "LEGS", kind: "accessory", weight: 0 },
    /* ABS + LOWER BACK */
    { name: "Plank", target: "ABS", muscle: "CORE", kind: "accessory", weight: 0, timed: true, reps: 30 },
    { name: "Side Plank", target: "ABS", muscle: "CORE", kind: "accessory", weight: 0, timed: true, reps: 30 },
    { name: "Hanging Leg Raise", target: "ABS", muscle: "CORE", kind: "accessory", weight: 0 },
    { name: "Hanging Knee Raise", target: "ABS", muscle: "CORE", kind: "accessory", weight: 0 },
    { name: "Cable Crunch", target: "ABS", muscle: "CORE", kind: "accessory", weight: 30 },
    { name: "Ab Wheel Rollout", target: "ABS", muscle: "CORE", kind: "accessory", weight: 0 },
    { name: "Dead Bug", target: "ABS", muscle: "CORE", kind: "accessory", weight: 0, timed: true, reps: 30 },
    { name: "Hollow Hold", target: "ABS", muscle: "CORE", kind: "accessory", weight: 0, timed: true, reps: 20 },
    { name: "Russian Twist", target: "ABS", muscle: "CORE", kind: "accessory", weight: 0 },
    { name: "Pallof Press", target: "ABS", muscle: "CORE", kind: "accessory", weight: 20 },
    { name: "Woodchopper", target: "ABS", muscle: "CORE", kind: "accessory", weight: 20 },
    { name: "Back Extension", target: "LOWER BACK", muscle: "CORE", kind: "accessory", weight: 0 },
    { name: "Bird Dog", target: "LOWER BACK", muscle: "CORE", kind: "accessory", weight: 0, timed: true, reps: 30 }
  ];

  function targetFor(name) {
    const found = EXERCISES.find((e) => e.name.toLowerCase() === String(name).toLowerCase());
    return found ? found.target : groupFor(name);
  }

  function timedFor(name) {
    const found = EXERCISES.find((e) => e.name.toLowerCase() === String(name).toLowerCase());
    if (found) return !!found.timed;
    return /\b(plank|carry|hold|wall sit|bird dog|dead bug|dead hang)\b/i.test(String(name));
  }

  /* Works for library entries, plan exercises and ledger sets alike. */
  function isTimed(x) {
    if (!x) return false;
    if (typeof x.timed === "boolean") return x.timed;
    return timedFor(x.name || "");
  }

  const metricStep = (timed) => (timed ? 5 : 1);
  const metricCeiling = (timed) => (timed ? 600 : 100);
  const metricWord = (timed) => (timed ? "SEC" : "REPS");
  const metricValue = (n, timed) => (timed ? Math.round(num(n)) + "S" : Math.round(num(n)) + " REPS");
  const normalizeSuper = (v) => {
    const s = String(v == null ? "" : v).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 2);
    return /^[A-Z]/.test(s) ? s : "";
  };

  let ctx = null;

  /* ---------------------------------------------------------
     state helpers
     --------------------------------------------------------- */
  function emptyDays() {
    return DAY_NAMES.map(() => []);
  }

  function defaultWeek(index) {
    return {
      id: uid(),
      name: "WEEK " + String(index + 1).padStart(2, "0") + " // IRON DISCIPLINE",
      days: emptyDays()
    };
  }

  function deriveRepMax(reps) {
    const r = clamp(Math.round(num(reps) || 8), 1, 100);
    if (r <= 5) return r + 2;
    if (r <= 8) return 12;
    if (r <= 12) return 15;
    return Math.min(100, r + 5);
  }

  function deriveMax(base, timed) {
    if (timed) return Math.min(600, Math.max(30, Math.round(num(base) || 30) + 30));
    return deriveRepMax(base);
  }

  function makeExercise(name, sets, reps, weight) {
    const lib = EXERCISES.find((e) => e.name.toLowerCase() === String(name).toLowerCase());
    const timed = isTimed(lib || { name });
    const base = reps || (timed ? 30 : 8);
    return {
      id: uid(),
      name: name,
      muscle: lib ? lib.muscle : "OTHER",
      target: lib ? lib.target : targetFor(name),
      kind: lib ? lib.kind : "accessory",
      timed: timed,
      sets: sets || 3,
      reps: base,
      repMin: base,
      repMax: deriveMax(base, timed),
      weight: weight || 0,
      rest: lib && lib.kind === "compound" ? 120 : 60,
      superset: "",
      superRest: 90
    };
  }

  function defaultTraining() {
    const week = defaultWeek(0);
    week.days[0] = [
      makeExercise("Barbell Back Squat", 4, 5, 60),
      makeExercise("Barbell Bench Press", 4, 5, 50),
      makeExercise("Barbell Bent-Over Row", 4, 6, 50)
    ];
    week.days[2] = [
      makeExercise("Barbell Deadlift", 4, 3, 80),
      makeExercise("Barbell Overhead Press", 4, 5, 30),
      makeExercise("Pull-Up", 3, 8, 0)
    ];
    week.days[4] = [
      makeExercise("Leg Press", 3, 10, 120),
      makeExercise("Dumbbell Bench Press", 3, 10, 24),
      makeExercise("Lat Pulldown", 3, 10, 45),
      makeExercise("Lateral Raise", 3, 15, 6)
    ];
    return { activeWeek: 0, selectedDay: 0, progressExercise: "", weeks: [week], logs: [] };
  }

  function ensure(state) {
    const fresh = defaultTraining();
    if (!state.training || typeof state.training !== "object") state.training = fresh;
    const t = state.training;
    if (!Array.isArray(t.weeks) || !t.weeks.length) t.weeks = fresh.weeks;
    t.weeks.forEach((w, i) => {
      if (!w || typeof w !== "object") {
        t.weeks[i] = defaultWeek(i);
        return;
      }
      w.id = w.id || uid();
      w.name = w.name || "WEEK " + String(i + 1).padStart(2, "0");
      if (!Array.isArray(w.days)) w.days = emptyDays();
      while (w.days.length < 7) w.days.push([]);
      w.days = w.days.slice(0, 7).map((list) => {
        if (!Array.isArray(list)) return [];
        return list.filter((ex) => ex && ex.name).map((ex) => {
          const timed = ex.timed === undefined ? timedFor(String(ex.name)) : !!ex.timed;
          const ceiling = metricCeiling(timed);
          const fallback = timed ? 30 : 8;
          const reps = clamp(Math.round(num(ex.reps) || fallback), 1, ceiling);
          const repMin = clamp(Math.round(num(ex.repMin) || reps), 1, ceiling);
          const repMax = clamp(Math.round(num(ex.repMax) || deriveMax(reps, timed)), repMin, ceiling);
          return {
            id: ex.id || uid(),
            name: String(ex.name),
            muscle: ex.muscle || groupFor(String(ex.name)),
            target: ex.target || targetFor(String(ex.name)),
            kind: ex.kind || "accessory",
            timed: timed,
            sets: clamp(Math.round(num(ex.sets) || 3), 1, 20),
            reps: clamp(reps, repMin, repMax),
            repMin: repMin,
            repMax: repMax,
            weight: Math.max(0, num(ex.weight)),
            rest: clamp(Math.round(num(ex.rest) || 60), 15, 600),
            superset: normalizeSuper(ex.superset),
            superRest: clamp(Math.round(num(ex.superRest) || 90), 0, 600)
          };
        });
      });
    });
    if (!Array.isArray(t.logs)) t.logs = [];
    t.logs = t.logs.filter((l) => l && l.name && l.date).map((l) => ({
      id: l.id || uid(),
      date: String(l.date),
      name: String(l.name),
      weight: Math.max(0, round1(num(l.weight))),
      timed: isTimed(l),
      reps: clamp(Math.round(num(l.reps)), 1, 600),
      exId: l.exId ? String(l.exId) : "",
      plannedWeight: l.plannedWeight === undefined ? undefined : Math.max(0, round1(num(l.plannedWeight))),
      plannedReps: l.plannedReps === undefined ? undefined : clamp(Math.round(num(l.plannedReps)), 1, 600),
      plannedSets: l.plannedSets === undefined ? undefined : clamp(Math.round(num(l.plannedSets)), 1, 20),
      at: l.at || new Date().toISOString(),
      source: l.source || "manual"
    }));
    t.activeWeek = clamp(Math.round(num(t.activeWeek)), 0, t.weeks.length - 1);
    t.selectedDay = clamp(Math.round(num(t.selectedDay)), 0, 6);
    t.lastProgress = t.lastProgress && typeof t.lastProgress === "object"
      ? { name: String(t.lastProgress.name || ""), type: String(t.lastProgress.type || "rep"), timed: !!t.lastProgress.timed, from: t.lastProgress.from || {}, to: t.lastProgress.to || {}, at: String(t.lastProgress.at || "") }
      : null;
    return t;
  }

  function groupFor(name) {
    const found = EXERCISES.find((e) => e.name.toLowerCase() === String(name).toLowerCase());
    if (found) return found.muscle;
    if (/plank|core|abs|crunch|hanging/i.test(name)) return "CORE";
    if (/squat|deadlift|lunge|leg press|calf|glute|hip/i.test(name)) return "LEGS";
    if (/press|bench|raise|tricep|chest|shoulder/i.test(name)) return "PUSH";
    if (/row|pull|lat|curl|bicep|back/i.test(name)) return "PULL";
    if (/leg|knee/i.test(name)) return "LEGS";
    return "OTHER";
  }

  function kindFor(name) {
    const found = EXERCISES.find((e) => e.name.toLowerCase() === String(name).toLowerCase());
    return found ? found.kind : "accessory";
  }

  function weightFor(name) {
    const found = EXERCISES.find((e) => e.name.toLowerCase() === String(name).toLowerCase());
    return found ? found.weight : 20;
  }

  function incrementFor(name) {
    return kindFor(name) === "compound" ? 2.5 : 1;
  }

  /* ---------------------------------------------------------
     progressive overload automation
     --------------------------------------------------------- */
  function findPlanExercise(t, name, exId) {
    if (exId) {
      for (const week of t.weeks) {
        for (const list of week.days) {
          const found = list.find((ex) => ex.id === exId);
          if (found) return found;
        }
      }
    }
    return planTargetFor(name, t);
  }

  function sessionFor(info, name) {
    if (info.sessions[name]) return info.sessions[name];
    const key = String(name).trim().toLowerCase();
    const found = Object.keys(info.sessions).find((n) => n.trim().toLowerCase() === key);
    return found ? info.sessions[found] : [];
  }

  /* A session only counts when every prescribed set was completed at the
     prescribed load with every set hitting the current target (reps or seconds). */
  function sessionCleared(t, target, name, date) {
    const key = name.trim().toLowerCase();
    const sets = t.logs.filter((l) => l.date === date && l.name.trim().toLowerCase() === key);
    if (sets.length < target.sets) return false;
    /* Only the latest complete group of sets counts as the current session. */
    const latest = sets.slice(-target.sets);
    const timed = isTimed(target);
    return latest.every((l) => isTimed(l) === timed && Math.abs(l.weight - target.weight) < 0.01 && l.reps >= target.reps);
  }

  /* Today's completion stays tied to the prescription that was actually logged.
     Progressive overload can raise the plan immediately afterwards, so comparing
     old sets with the new target would wrongly flip a finished drill back to pending. */
  function loggedTarget(t, log, ex) {
    if (log.plannedWeight !== undefined && log.plannedReps !== undefined) {
      return { weight: log.plannedWeight, reps: log.plannedReps };
    }
    const lp = t.lastProgress;
    if (lp && lp.name && lp.name.trim().toLowerCase() === ex.name.trim().toLowerCase() && lp.from) {
      const at = new Date(lp.at);
      if (!isNaN(at.getTime()) && D.keyOf(at) === log.date) {
        return { weight: num(lp.from.weight), reps: num(lp.from.reps) };
      }
    }
    /* Legacy sets have no snapshot. Treat the logged prescription as completed
       so old sessions are not stuck as pending after an overload change. */
    return { weight: log.weight, reps: log.reps };
  }

  function logHitsTarget(t, log, ex) {
    const target = loggedTarget(t, log, ex);
    return isTimed(log) === isTimed(ex) && Math.abs(log.weight - target.weight) < 0.01 && log.reps >= target.reps;
  }

  function sessionCompleted(t, date, ex) {
    const key = ex.name.trim().toLowerCase();
    const sets = t.logs.filter((l) => l.date === date && l.name.trim().toLowerCase() === key &&
      (!l.exId || !ex.id || l.exId === ex.id));
    if (sets.length < ex.sets) return false;
    return sets.slice(-ex.sets).every((l) => logHitsTarget(t, l, ex));
  }

  /* Double progression:
     1. Keep the load fixed and add one rep (or 5 seconds) per session until
        every set reaches the top of the range.
     2. Only then add a small amount of weight and reset to the bottom.
        Unloaded bodyweight holds extend the range instead. */
  function autoProgress(state, name, date, exId) {
    const t = ensure(state);
    const target = findPlanExercise(t, name, exId);
    if (!target || !sessionCleared(t, target, name, date)) return null;

    const timed = isTimed(target);
    const step = metricStep(timed);
    const word = metricWord(timed);
    const result = { name: target.name, type: "rep", timed: timed, from: {}, to: {}, text: "" };
    if (target.reps < target.repMax) {
      const fromValue = target.reps;
      target.reps = Math.min(target.repMax, fromValue + step);
      result.type = "rep";
      result.from = { weight: target.weight, reps: fromValue };
      result.to = { weight: target.weight, reps: target.reps };
      result.text = fromValue + " → " + target.reps + " " + word + " @ " + (target.weight > 0 ? round1(target.weight) + " KG" : "BW");
    } else {
      const fromWeight = target.weight;
      const top = target.repMax;
      if (fromWeight === 0) {
        const oldMin = target.repMin;
        target.repMin = oldMin + step;
        target.repMax = Math.min(metricCeiling(timed), top + step);
        target.reps = target.repMin;
        result.type = "range";
        result.from = { weight: 0, reps: top, repMin: oldMin, repMax: top };
        result.to = { weight: 0, reps: target.reps, repMin: target.repMin, repMax: target.repMax };
        result.text = oldMin + "–" + top + " → " + target.repMin + "–" + target.repMax + " " + word;
      } else {
        target.weight = round1(fromWeight + incrementFor(name));
        target.reps = target.repMin;
        result.type = "weight";
        result.from = { weight: fromWeight, reps: top };
        result.to = { weight: target.weight, reps: target.reps };
        result.text = round1(fromWeight) + " → " + target.weight + " KG · " + word + " RESET " + target.repMin + "–" + target.repMax;
      }
    }

    const key = name.trim().toLowerCase();
    const oldWeight = result.from.weight;
    const oldReps = result.from.reps;
    t.weeks.forEach((week) => week.days.forEach((list) => list.forEach((ex) => {
      if (ex.id !== target.id && ex.name.trim().toLowerCase() === key &&
          ex.weight === oldWeight && ex.reps === oldReps) {
        ex.weight = result.to.weight;
        ex.reps = result.to.reps;
        if (result.to.repMin) ex.repMin = result.to.repMin;
        if (result.to.repMax) ex.repMax = result.to.repMax;
      }
    })));
    t.lastProgress = { name: target.name, type: result.type, timed: timed, from: result.from, to: result.to, at: new Date().toISOString() };
    return result;
  }

  /* The log form always shows the current prescription, not a jump ahead. */
  function suggestLoad(state, name, prefill) {
    const p = prefill || {};
    const t = ensure(state);
    const target = findPlanExercise(t, name, p.exId);
    const timed = target ? isTimed(target) : timedFor(name);
    const list = sessionFor(analyse(t.logs), name);
    const last = list[list.length - 1];
    if (!target) {
      const best = last ? last.best : { weight: 0, reps: 0 };
      return {
        weight: best.weight > 0 ? round1(best.weight + incrementFor(name)) : (p.weight !== undefined ? p.weight : (timed ? 0 : weightFor(name))),
        reps: best.weight > 0 ? Math.max(5, best.reps - (timed ? 5 : 2)) : (p.reps || (timed ? 30 : 8)),
        note: "BASELINE LOAD",
        auto: false,
        timed: timed
      };
    }
    const cleared = last ? sessionCleared(t, target, name, last.date) : false;
    const step = metricStep(timed);
    const word = metricWord(timed);
    return {
      weight: target.weight,
      reps: target.reps,
      timed: timed,
      note: cleared
        ? target.reps < target.repMax
          ? (timed ? "HOLD PROGRESSION · +" + step + " SEC AT " + (target.weight > 0 ? round1(target.weight) + " KG" : "BODYWEIGHT")
                   : "REP PROGRESSION · +1 REP AT " + (target.weight > 0 ? round1(target.weight) + " KG" : "BODYWEIGHT"))
          : target.weight === 0
            ? "TOP OF RANGE · EXTEND TO " + (target.repMin + step) + "–" + (target.repMax + step) + " " + word
            : "TOP OF RANGE · +" + incrementFor(name) + " KG"
        : "PROGRAMMED TARGET · " + target.repMin + "–" + target.repMax + " " + word,
      auto: cleared && target.reps < target.repMax
    };
  }

  function epley(weight, reps) {
    if (!(weight > 0) || !(reps > 0)) return 0;
    return round1(weight * (1 + Math.min(reps, 12) / 30));
  }

  function oneRm(log) {
    return isTimed(log) ? 0 : epley(log.weight, log.reps);
  }

  function volume(log) {
    return isTimed(log) ? 0 : log.weight * log.reps;
  }

  function todayIndex() {
    return (new Date().getDay() + 6) % 7;
  }

  function weekKeyOf(dateKey) {
    const d = D.parseKey(dateKey);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    return D.keyOf(d);
  }

  /* ---------------------------------------------------------
     analysis
     --------------------------------------------------------- */
  function nameMap(logs) {
    const map = Object.create(null);
    logs.forEach((l) => {
      const key = l.name.trim().toLowerCase();
      (map[key] = map[key] || []).push(l);
    });
    return map;
  }

  function sessionList(logs) {
    const map = Object.create(null);
    logs.forEach((l) => {
      const key = l.name.trim().toLowerCase() + "|" + l.date;
      if (!map[key]) map[key] = { name: l.name, date: l.date, sets: [], volume: 0 };
      map[key].sets.push(l);
      map[key].volume += volume(l);
    });
    return Object.keys(map).map((key) => {
      const s = map[key];
      const timed = isTimed(s.sets[0]);
      const best = s.sets.reduce((a, b) => (oneRm(b) >= oneRm(a) ? b : a), s.sets[0]);
      return {
        name: s.name,
        date: s.date,
        sets: s.sets.length,
        volume: s.volume,
        best: best,
        timed: timed,
        hold: s.sets.reduce((m, l) => Math.max(m, l.reps), 0),
        holdSeconds: s.sets.reduce((sum, l) => sum + l.reps, 0),
        oneRm: oneRm(best)
      };
    }).sort((a, b) => a.date.localeCompare(b.date));
  }

  function analyse(logs) {
    const byName = nameMap(logs);
    const sessions = {};
    const prs = {};

    Object.keys(byName).forEach((key) => {
      const items = byName[key];
      const name = items[0].name;
      const list = sessionList(items);
      sessions[name] = list;

      const timed = isTimed(items[0]);
      const rmSet = items.reduce((a, b) => (oneRm(b) > oneRm(a) ? b : a), items[0]);
      const set = items.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a), items[0]);
      const session = list.reduce((a, b) => (b.volume > a.volume ? b : a), list[0]);
      const reps = items.reduce((a, b) => (b.reps > a.reps ? b : a), items[0]);
      const hold = list.reduce((a, b) => (b.hold > a.hold ? b : a), list[0]);
      const holdSession = list.reduce((a, b) => (b.holdSeconds > a.holdSeconds ? b : a), list[0]);
      prs[name] = {
        name: name,
        group: groupFor(name),
        timed: timed,
        rm: { value: oneRm(rmSet), date: rmSet.date, weight: rmSet.weight, reps: rmSet.reps },
        set: { weight: set.weight, reps: set.reps, date: set.date },
        session: { value: session.volume, date: session.date, sets: session.sets },
        reps: { value: reps.reps, weight: reps.weight, date: reps.date },
        hold: { value: hold.hold, date: hold.date, sets: hold.sets },
        holdSession: { value: holdSession.holdSeconds, date: holdSession.date, sets: holdSession.sets },
        holds: items.length
      };
    });

    return { byName, sessions, prs };
  }

  function planTargetFor(name, t) {
    for (const week of t.weeks) {
      for (const list of week.days) {
        const found = list.find((ex) => ex.name.trim().toLowerCase() === name.trim().toLowerCase());
        if (found) return found;
      }
    }
    return null;
  }

  function buildOverload(t, sessions, prs) {
    const names = [];
    t.weeks.forEach((week) => week.days.forEach((list) => list.forEach((ex) => {
      if (!names.some((n) => n.toLowerCase() === ex.name.toLowerCase())) names.push(ex.name);
    })));
    Object.keys(prs).forEach((name) => {
      if (!names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
    });

    return names.map((name) => {
      const list = sessions[name] || [];
      const latest = list[list.length - 1];
      const prev = list[list.length - 2];
      const target = planTargetFor(name, t);
      let status = "idle";
      let advice = "No sets logged. Program it, then record your first session.";
      let change = 0;

      const timed = isTimed(target || { name });
      const step = metricStep(timed);
      const word = metricWord(timed).toLowerCase();
      if (latest && prev) {
        const base = timed ? prev.hold : prev.oneRm;
        const now = timed ? latest.hold : latest.oneRm;
        change = base ? ((now - base) / base) * 100 : 0;
        status = change >= 2 ? "surge" : change <= -2 ? "deload" : "hold";
        advice = (timed ? "HOLD TIME " : "1RM TREND ") + (change >= 0 ? "+" : "") + Math.round(change) + "% · follow the ladder below.";
      } else if (latest) {
        status = "baseline";
        advice = "BASELINE LOCKED · repeat this " + word + " to reveal the trend.";
      }

      if (latest && target) {
        if (sessionCleared(t, target, name, latest.date)) {
          status = "surge";
          advice = target.reps < target.repMax
            ? (timed ? "HOLD PROGRESSION · add " + step + " sec" : "REP PROGRESSION · add 1 rep") + " at " + (target.weight > 0 ? round1(target.weight) + " KG" : "bodyweight") + " until all " + target.sets + " sets reach " + target.repMax + "."
            : target.weight === 0
              ? "TOP OF RANGE · extend to " + (target.repMin + step) + "–" + (target.repMax + step) + " " + word + ", then reset to " + (target.repMin + step) + "."
              : "TOP OF RANGE · increase to " + round1(target.weight + incrementFor(name)) + " KG, then reset to " + target.repMin + " " + word + ".";
        } else if (status === "idle" || status === "baseline") {
          status = "hold";
          advice = "PROGRAMMED · complete " + target.sets + "×" + target.reps + " " + word + " @ " + (target.weight > 0 ? round1(target.weight) + " KG" : "bodyweight") + " (range " + target.repMin + "–" + target.repMax + ").";
        }
      }

      return { name, status, advice, change, latest, prev, target };
    });
  }

  /* ---------------------------------------------------------
     SVG charts
     --------------------------------------------------------- */
  function lineChartSVG(points) {
    const W = 640, H = 220, L = 48, R = 14, T = 16, B = 34;
    const vals = points.map((p) => p.value);
    let min = Math.min.apply(null, vals);
    let max = Math.max.apply(null, vals);
    if (max === min) { min -= 5; max += 5; }
    const pad = (max - min) * 0.15;
    min = Math.max(0, min - pad);
    max = max + pad;
    const x = (i) => L + (i * (W - L - R)) / Math.max(1, points.length - 1);
    const y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
    let grid = "";
    for (let i = 0; i <= 4; i++) {
      const val = min + ((max - min) * i) / 4;
      const gy = y(val);
      grid += `<line x1="${L}" y1="${gy.toFixed(1)}" x2="${W - R}" y2="${gy.toFixed(1)}" stroke="rgba(90,190,255,.11)" stroke-dasharray="3 5"/>`;
      grid += `<text x="${L - 8}" y="${(gy + 3).toFixed(1)}" text-anchor="end" class="chart-axis">${Math.round(val)}</text>`;
    }
    const coords = points.map((p, i) => [x(i), y(p.value)]);
    const line = coords.map((c, i) => (i ? "L" : "M") + c[0].toFixed(1) + " " + c[1].toFixed(1)).join(" ");
    const area = line + " L" + coords[coords.length - 1][0].toFixed(1) + " " + (H - B) + " L" + coords[0][0].toFixed(1) + " " + (H - B) + " Z";
    const dots = coords.map((c, i) => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${i === coords.length - 1 ? 4.5 : 3}" class="chart-dot"><title>${esc(points[i].label)} · ${points[i].value} KG</title></circle>`).join("");
    const marks = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i);
    const labels = marks.map((i) => `<text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="${i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}" class="chart-axis">${esc(points[i].label)}</text>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Estimated 1RM over time">
      <defs><linearGradient id="trainArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#57e6ff" stop-opacity=".28"/><stop offset="1" stop-color="#57e6ff" stop-opacity="0"/></linearGradient></defs>
      ${grid}<path d="${area}" fill="url(#trainArea)"/><path d="${line}" class="chart-line"/>${dots}${labels}
    </svg>`;
  }

  function barChartSVG(weeks) {
    const W = 640, H = 220, L = 48, R = 14, T = 16, B = 34;
    const max = Math.max(1, ...weeks.map((w) => w.total));
    const top = Math.ceil(max / 500) * 500 || 500;
    const inner = W - L - R;
    const step = inner / Math.max(1, weeks.length);
    const bw = Math.min(46, step * 0.56);
    let grid = "";
    for (let i = 0; i <= 4; i++) {
      const val = (top * i) / 4;
      const gy = T + (1 - i / 4) * (H - T - B);
      grid += `<line x1="${L}" y1="${gy.toFixed(1)}" x2="${W - R}" y2="${gy.toFixed(1)}" stroke="rgba(90,190,255,.11)" stroke-dasharray="3 5"/>`;
      grid += `<text x="${L - 8}" y="${(gy + 3).toFixed(1)}" text-anchor="end" class="chart-axis">${compact(val)}</text>`;
    }
    const bars = weeks.map((w, i) => {
      const cx = L + step * i + step / 2;
      let yCursor = H - B;
      let out = "";
      w.segments.forEach((seg) => {
        if (seg.value <= 0) return;
        const h = (seg.value / top) * (H - T - B);
        yCursor -= h;
        out += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yCursor.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" fill="${GROUP_COLORS[seg.key] || "#6e84a9"}" opacity=".82"><title>${esc(w.label)} · ${seg.key} ${fmt(seg.value)} KG</title></rect>`;
      });
      out += `<text x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle" class="chart-axis">${esc(w.label)}</text>`;
      if (w.total > 0) out += `<text x="${cx.toFixed(1)}" y="${(H - B - (w.total / top) * (H - T - B) - 5).toFixed(1)}" text-anchor="middle" class="chart-value">${compact(w.total)}</text>`;
      return out;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Weekly training volume">${grid}${bars}</svg>`;
  }

  /* ---------------------------------------------------------
     renderers
     --------------------------------------------------------- */
  function renderTiles(state, info) {
    const today = D.todayKey();
    const from = D.keyAdd(today, -6);
    const weekVol = state.training.logs.filter((l) => l.date >= from && l.date <= today).reduce((s, l) => s + volume(l), 0);
    const names = Object.keys(info.prs);
    const peak = names.length ? Math.max.apply(null, names.map((n) => info.prs[n].rm.value)) : 0;
    const overload = info.overload.filter((o) => o.status === "surge").length;
    $("#trainVolume").textContent = fmt(weekVol);
    $("#train1rm").textContent = peak > 0 ? round1(peak) + " KG" : "--";
    $("#trainPrCount").textContent = String(names.length);
    $("#trainOverload").textContent = names.length ? overload + " / " + names.length : "--";
    const chip = $("#trainingWeekChip");
    if (chip) chip.classList.toggle("is-live", state.training.logs.length > 0);
    $("#trainingWeekLabel").textContent = "WEEK " + String(state.training.activeWeek + 1).padStart(2, "0") + " // " +
      (state.training.logs.length ? state.training.logs.length + " SETS LOGGED" : "PLAN IDLE");
  }

  /* Exercises sharing a superset key on the same day are performed back-to-back.
     Standalone drills keep their own row; grouped drills stay in plan order. */
  function sessionGroups(planned) {
    const groups = [];
    const byKey = Object.create(null);
    planned.forEach((ex) => {
      const key = ex.superset || "";
      if (key && byKey[key] !== undefined) {
        groups[byKey[key]].items.push(ex);
        return;
      }
      const group = { key: key, items: [ex], rest: num(ex.superRest) || 90 };
      groups.push(group);
      if (key) byKey[key] = groups.length - 1;
    });
    return groups;
  }

  function renderToday(state) {
    const t = state.training;
    const today = D.todayKey();
    const idx = todayIndex();
    const planned = t.weeks[t.activeWeek].days[idx];
    const logged = t.logs.filter((l) => l.date === today);
    const targetSets = planned.reduce((s, ex) => s + ex.sets, 0);
    const doneSets = logged.length;
    const completedExercises = planned.filter((ex) => sessionCompleted(t, today, ex)).length;
    const todayVol = logged.reduce((s, l) => s + volume(l), 0);
    const pct = planned.length ? Math.min(100, Math.round((completedExercises / planned.length) * 100)) : (logged.length ? 100 : 0);
    const status = !planned.length && !logged.length ? "REST DAY"
      : completedExercises >= planned.length && planned.length > 0 ? "CLEARED"
        : completedExercises || logged.length ? "IN PROGRESS" : "AWAITING ORDER";

    $("#todayDateLabel").textContent = D.fmtFull(today);
    $("#todayCode").textContent = DAY_NAMES[idx].toUpperCase() + " · WEEK " + String(t.activeWeek + 1).padStart(2, "0");
    $("#todayExCount").textContent = String(planned.length);
    $("#todaySetsDone").textContent = doneSets + " / " + targetSets;
    $("#todayVolume").textContent = fmt(todayVol) + " KG";
    const statusEl = $("#todayStatus");
    statusEl.textContent = status;
    statusEl.dataset.status = status === "CLEARED" ? "clear" : status === "IN PROGRESS" ? "active" : status === "REST DAY" ? "rest" : "idle";
    $("#todayProgressFill").style.width = pct + "%";

    const lp = t.lastProgress;
    const lpWord = lp && lp.timed ? "SEC" : "REPS";
    const lpText = lp && lp.to
      ? lp.type === "weight"
        ? round1(lp.from.weight) + " → " + lp.to.weight + " KG · " + lpWord + " RESET " + lp.to.reps
        : lp.type === "range"
          ? (lp.from.repMin || 0) + "–" + (lp.from.repMax || 0) + " → " + (lp.to.repMin || 0) + "–" + (lp.to.repMax || 0) + " " + lpWord
          : (lp.from.reps || 0) + " → " + lp.to.reps + " " + lpWord + " @ " + (lp.to.weight > 0 ? round1(lp.to.weight) + " KG" : "BW")
      : "";
    const lpTitle = lp && lp.type === "weight" ? "WEIGHT INCREASE APPLIED"
      : lp && lp.type === "range" ? "RANGE EXTENDED"
        : lp && lp.timed ? "HOLD PROGRESSION APPLIED" : "REP PROGRESSION APPLIED";
    $("#todayAuto").innerHTML = lp && lp.name
      ? `<div class="today-auto-banner"><span class="today-auto-sigil">▲</span>
          <span><strong>${lpTitle}</strong> · ${esc(lp.name)} · ${esc(lpText)}</span>
        </div>`
      : "";

    if (!planned.length) {
      $("#todayList").innerHTML = `<div class="today-rest">
        <span class="today-rest-mark">✧</span>
        <strong>RECOVERY PROTOCOL · ${DAY_NAMES[idx]}</strong>
        <p>The System has assigned no drills today. Rest, borrow the next programmed session, or log an unplanned set if the chamber calls.</p>
        <div class="today-rest-actions">
          <button class="btn btn-ghost btn-sm" data-train="today-borrow">BORROW NEXT SESSION</button>
          <button class="btn btn-ghost btn-sm" data-train="today-log-any">LOG UNPLANNED SET</button>
        </div>
      </div>`;
    } else {
      const rowHtml = (ex, i) => {
        const timed = isTimed(ex);
        const word = metricWord(timed);
        const key = ex.name.trim().toLowerCase();
        const sets = logged.filter((l) => l.name.trim().toLowerCase() === key && (!l.exId || !ex.id || l.exId === ex.id));
        const best = sets.length ? sets.reduce((a, b) => (oneRm(b) >= oneRm(a) ? b : a), sets[0]) : null;
        const bestHold = sets.length ? sets.reduce((m, l) => Math.max(m, l.reps), 0) : 0;
        const done = sessionCompleted(t, today, ex);
        let clearedSets = 0;
        if (!done) {
          for (let k = sets.length - 1; k >= 0; k--) {
            if (logHitsTarget(t, sets[k], ex)) clearedSets++;
            else break;
          }
          clearedSets = Math.min(clearedSets, ex.sets);
        }
        const logButton = done
          ? `<button class="btn btn-ghost btn-sm today-log-btn" type="button" disabled title="Session complete">✓ DONE</button>`
          : `<button class="btn btn-ghost btn-sm today-log-btn" data-train="today-log" data-id="${esc(ex.id)}">LOG</button>`;
        const ssTag = ex.superset ? `<i class="ss-tag">SS ${esc(ex.superset)}</i>` : "";
        return `<div class="today-row${done ? " is-done" : ""}"${ex.superset ? ` data-superset="${esc(ex.superset)}"` : ""}>
          <span class="today-row-num">${String(i + 1).padStart(2, "0")}</span>
          <div class="today-ex">
            <strong>${ssTag}${esc(ex.name)}</strong>
            <small>${esc(targetFor(ex.name))} · ${ex.repMin}–${ex.repMax} ${word} · ${ex.superset ? "IN SUPERSET" : "REST " + ex.rest + "S"}</small>
          </div>
          <div class="today-target">
            <span>${timed ? "HOLD" : "TARGET"}<strong>${ex.sets} × ${ex.reps}<em>/${ex.repMax}</em></strong></span>
            <span>LOAD<strong>${ex.weight > 0 ? round1(ex.weight) + " KG" : "BW"}${lp && lp.name.toLowerCase() === key ? " <i class='auto-tag'>AUTO</i>" : ""}</strong></span>
          </div>
          <div class="today-actual">
            <span class="today-chip${done ? " is-done" : clearedSets ? " is-partial" : ""}">${done ? "CLEARED" : clearedSets ? clearedSets + "/" + ex.sets + " AT TARGET" : "PENDING"}</span>
            <small>${best ? (timed ? "BEST " + bestHold + "S HOLD" : "BEST " + best.weight + " KG × " + best.reps) : "NO SETS YET"}</small>
          </div>
          ${logButton}
        </div>`;
      };
      let rowIndex = 0;
      $("#todayList").innerHTML = sessionGroups(planned).map((group) => {
        if (!group.key) return rowHtml(group.items[0], rowIndex++);
        const groupDone = group.items.every((ex) => sessionCompleted(t, today, ex));
        const rows = group.items.map((ex) => rowHtml(ex, rowIndex++)).join("");
        const rest = Math.max.apply(null, group.items.map((ex) => num(ex.superRest) || 90));
        return `<div class="today-superset${groupDone ? " is-done" : ""}">
          <div class="today-ss-head">
            <span>SUPERSET ${esc(group.key)}</span>
            <small>${group.items.length} DRILLS · ${Math.round(rest)}S AFTER GROUP</small>
            <em>${groupDone ? "CLEARED" : "IN PROGRESS"}</em>
          </div>
          <div class="today-ss-rows">${rows}</div>
        </div>`;
      }).join("");
    }

    $("#todayLogCount").textContent = doneSets + " SET" + (doneSets === 1 ? "" : "S");
    if (!logged.length) {
      $("#todayLog").innerHTML = `<div class="today-log-empty">NO SETS RECORDED TODAY — THE CHAMBER IS WAITING.</div>`;
    } else {
      $("#todayLog").innerHTML = logged.slice().reverse().slice(0, 8).map((l) => {
        const d = new Date(l.at);
        const time = isNaN(d.getTime()) ? "--:--" : String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
        const timed = isTimed(l);
        const detail = timed ? l.reps + " SEC HOLD" + (l.weight > 0 ? " @ " + l.weight + " KG" : "") : l.weight + " KG × " + l.reps;
        return `<div class="today-log-row"><span>${time}</span><strong>${esc(l.name)}</strong><span>${detail}</span><em>${timed ? "—" : fmt(volume(l)) + " KG"}</em></div>`;
      }).join("");
    }
  }

  function renderPlan(state) {
    const t = state.training;
    const week = t.weeks[t.activeWeek];
    const day = week.days[t.selectedDay];
    const totalEx = week.days.reduce((s, list) => s + list.length, 0);
    $("#planWeekLabel").textContent = "WEEK " + String(t.activeWeek + 1).padStart(2, "0") + " OF " + String(t.weeks.length).padStart(2, "0");
    $("#planCode").textContent = "W" + (t.activeWeek + 1) + " · " + totalEx + " EX";
    $("#planPrev").disabled = t.activeWeek === 0;
    $("#planNext").disabled = t.activeWeek === t.weeks.length - 1;
    $("#planDelWeekBtn").disabled = t.weeks.length < 2;

    $("#planDays").innerHTML = DAY_SHORT.map((label, i) => {
      const count = week.days[i].length;
      return `<button class="day-tab${i === t.selectedDay ? " is-active" : ""}" data-train="day" data-day="${i}" role="tab" aria-selected="${i === t.selectedDay}">
        <span>${label}</span><small>${count ? count + " EX" : "REST"}</small>
      </button>`;
    }).join("");

    if (!day.length) {
      $("#planDay").innerHTML = `<div class="plan-empty"><span class="plan-empty-sigil">✧</span>
        <strong>REST DAY · ${DAY_NAMES[t.selectedDay]}</strong>
        <p>The System prescribes recovery. Add an exercise to program this day.</p>
        <button class="btn btn-ghost btn-sm" data-train="add-ex">+ ADD EXERCISE</button>
      </div>`;
      return;
    }

    $("#planDay").innerHTML = day.map((ex, i) => {
      const timed = isTimed(ex);
      const word = metricWord(timed);
      return `<div class="plan-row"${ex.superset ? ` data-superset="${esc(ex.superset)}"` : ""}>
        <span class="plan-row-num">${String(i + 1).padStart(2, "0")}</span>
        <div class="plan-ex"><strong>${ex.superset ? `<i class="ss-tag">SS ${esc(ex.superset)}</i>` : ""}${esc(ex.name)}</strong><small>${esc(targetFor(ex.name))} · ${esc(ex.muscle)} · ${ex.kind} · ${ex.repMin}–${ex.repMax} ${word}${ex.superset ? ` · ${ex.superRest}S AFTER GROUP` : ` · ${ex.rest}S REST`}</small></div>
        <div class="plan-target">
          <span>SETS<strong>${ex.sets}</strong></span>
          <span>${timed ? "HOLD" : "REPS"}<strong>${ex.reps}<em>/${ex.repMax}</em></strong></span>
          <span>LOAD<strong>${ex.weight > 0 ? round1(ex.weight) + " KG" : "BW"}${t.lastProgress && t.lastProgress.name.toLowerCase() === ex.name.trim().toLowerCase() ? " <i class='auto-tag'>AUTO</i>" : ""}</strong></span>
        </div>
        <div class="plan-row-actions">
          <button class="icon-btn btn-mini" data-train="log" data-id="${esc(ex.id)}" title="Log a set for ${esc(ex.name)}" aria-label="Log a set">＋</button>
          <button class="icon-btn btn-mini" data-train="edit-ex" data-id="${esc(ex.id)}" title="Edit exercise" aria-label="Edit exercise">✎</button>
          <button class="icon-btn btn-mini" data-train="del-ex" data-id="${esc(ex.id)}" title="Remove exercise" aria-label="Remove exercise">×</button>
        </div>
      </div>`;
    }).join("");
  }

  function renderOverload(info) {
    const order = { surge: 0, baseline: 1, hold: 2, deload: 3, idle: 4 };
    const list = info.overload.slice().sort((a, b) => order[a.status] - order[b.status]);
    $("#overloadCode").textContent = list.length + " SIGNAL" + (list.length === 1 ? "" : "S");
    if (!list.length) {
      $("#overloadList").innerHTML = `<div class="empty-list">NO LIFTS PROGRAMMED — ADD AN EXERCISE TO RECEIVE DIRECTIVES.</div>`;
      return;
    }
    $("#overloadList").innerHTML = list.map((o) => {
      const latest = o.latest;
      const prev = o.prev;
      const timed = isTimed(o.target || { name: o.name });
      const pct = latest && prev && (timed ? prev.hold > 0 : prev.oneRm > 0) ? Math.round(o.change) : null;
      const width = latest && prev ? Math.round(clamp(50 + o.change, 6, 100)) : latest ? 62 : 8;
      const last = !latest ? "NO SESSIONS"
        : timed ? "LAST " + latest.hold + "S HOLD"
          : "LAST " + (latest.best.weight > 0 ? round1(latest.oneRm) + " KG" : "BW × " + latest.best.reps + " REPS");
      return `<article class="overload-row" data-status="${o.status}">
        <div class="overload-head">
          <strong>${esc(o.name)}</strong>
          <span class="overload-badge">${esc(o.status.toUpperCase())}</span>
        </div>
        <div class="overload-meter"><i style="width:${width}%"></i></div>
        <p>${esc(o.advice)}</p>
        <div class="overload-meta">
          <span>${last}</span>
          <span>${pct === null ? "—" : (pct > 0 ? "+" : "") + pct + "% " + (timed ? "HOLD TIME" : "EST. 1RM")}</span>
          <span>${o.target ? "TARGET " + o.target.sets + "×" + o.target.reps + (timed ? "S" : "") + " @ " + (o.target.weight > 0 ? round1(o.target.weight) + " KG" : "BW") : "UNPROGRAMMED"}</span>
        </div>
      </article>`;
    }).join("");
  }

  function renderOneRm(info) {
    const names = Object.keys(info.prs).filter((n) => info.prs[n].rm.value > 0)
      .sort((a, b) => info.prs[b].rm.value - info.prs[a].rm.value).slice(0, 8);
    if (!names.length) {
      $("#onermGrid").innerHTML = `<div class="empty-list">LOG WEIGHTED SETS TO ESTIMATE YOUR LIMITS.<br/><button class="btn btn-ghost btn-sm" data-train="log-set">+ LOG A SET</button></div>`;
      return;
    }
    const max = info.prs[names[0]].rm.value;
    $("#onermGrid").innerHTML = names.map((name, i) => {
      const pr = info.prs[name];
      const pct = Math.round((pr.rm.value / max) * 100);
      return `<article class="onerm-card">
        <div class="onerm-head"><span>${String(i + 1).padStart(2, "0")}</span><strong>${esc(name)}</strong></div>
        <div class="onerm-value">${round1(pr.rm.value)}<small>KG</small></div>
        <div class="onerm-bar"><i style="width:${pct}%"></i></div>
        <div class="onerm-foot"><span>${pr.rm.weight} KG × ${pr.rm.reps} REPS</span><span>${D.fmtShort(pr.rm.date)}</span></div>
      </article>`;
    }).join("");
  }

  function renderPRs(info) {
    const names = Object.keys(info.prs).sort((a, b) => info.prs[b].rm.value - info.prs[a].rm.value);
    $("#prCode").textContent = names.length + " RECORD" + (names.length === 1 ? "" : "S");
    if (!names.length) {
      $("#prList").innerHTML = `<div class="empty-list">NO FEATS ON RECORD YET — EVERY REP COUNTS.</div>`;
      return;
    }
    $("#prList").innerHTML = names.map((name) => {
      const p = info.prs[name];
      const metrics = p.timed
        ? `<div><span>LONGEST HOLD</span><strong>${p.hold.value} <small>SEC</small></strong><small>${D.fmtShort(p.hold.date)}</small></div>
           <div><span>TOTAL HOLD TIME</span><strong>${p.holdSession.value} <small>SEC</small></strong><small>${D.fmtShort(p.holdSession.date)}</small></div>
           <div><span>HOLDS LOGGED</span><strong>${p.holds} <small>SETS</small></strong><small>ALL TIME</small></div>
           <div><span>BEST SESSION</span><strong>${p.holdSession.sets} <small>SETS</small></strong><small>${D.fmtShort(p.holdSession.date)}</small></div>`
        : `<div><span>BEST 1RM</span><strong>${round1(p.rm.value)} <small>KG</small></strong><small>${D.fmtShort(p.rm.date)}</small></div>
           <div><span>HEAVIEST SET</span><strong>${p.set.weight}×${p.set.reps} <small>KG</small></strong><small>${D.fmtShort(p.set.date)}</small></div>
           <div><span>SESSION VOL.</span><strong>${fmt(p.session.value)} <small>KG</small></strong><small>${D.fmtShort(p.session.date)}</small></div>
           <div><span>MAX REPS</span><strong>${p.reps.value} <small>@ ${p.reps.weight} KG</small></strong><small>${D.fmtShort(p.reps.date)}</small></div>`;
      return `<article class="pr-card">
        <div class="pr-head"><strong>${esc(name)}</strong><span>${esc(targetFor(name))} · ${esc(p.group)}</span></div>
        <div class="pr-metrics">${metrics}</div>
      </article>`;
    }).join("");
  }

  function renderProgress(state, info) {
    const names = Object.keys(info.sessions).filter((n) =>
      info.sessions[n].some((s) => (s.timed ? s.hold > 0 : s.oneRm > 0)));
    const tabs = $("#progressTabs");
    if (!names.length) {
      tabs.innerHTML = "";
      $("#progressCode").textContent = "NO DATA";
      $("#progressChart").innerHTML = `<div class="empty-list">NO SESSIONS RECORDED — LOG SETS TO PLOT YOUR TRAJECTORY.</div>`;
      $("#progressCaption").textContent = "";
      return;
    }
    if (names.indexOf(state.training.progressExercise) === -1) state.training.progressExercise = names[names.length - 1];
    const selected = state.training.progressExercise;
    const shown = names.slice(-8);
    if (shown.indexOf(selected) === -1) shown[shown.length - 1] = selected;
    tabs.innerHTML = shown.map((n) => `<button class="${n === selected ? "is-active" : ""}" data-train="progress" data-name="${esc(n)}">${esc(n.split(" ").slice(-1)[0].toUpperCase())}</button>`).join("");

    const timed = info.sessions[selected].some((s) => s.timed) || timedFor(selected);
    const list = info.sessions[selected].filter((s) => (timed ? s.hold > 0 : s.oneRm > 0));
    const points = list.map((s) => ({ label: D.fmtShort(s.date), value: timed ? s.hold : s.oneRm }));
    $("#progressCode").textContent = list.length + " SESSION" + (list.length === 1 ? "" : "S");
    $("#progressChart").innerHTML = lineChartSVG(points);
    const first = points[0].value;
    const last = points[points.length - 1].value;
    const delta = first ? ((last - first) / first) * 100 : 0;
    $("#progressCaption").innerHTML = `<strong>${esc(selected)}</strong> · ${round1(first)} ${timed ? "S" : "KG"} → ${round1(last)} ${timed ? "S" : "KG"} ·
      <span class="${delta >= 0 ? "is-up" : "is-down"}">${delta >= 0 ? "+" : ""}${Math.round(delta)}% ${timed ? "HOLD TIME" : "EST. 1RM"}</span>`;
  }

  function renderVolume(state) {
    const logs = state.training.logs;
    const today = D.todayKey();
    const currentMonday = weekKeyOf(today);
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const monday = D.keyAdd(currentMonday, -i * 7);
      const end = D.keyAdd(monday, 6);
      const inWeek = logs.filter((l) => l.date >= monday && l.date <= end);
      const segments = ["PUSH", "PULL", "LEGS", "CORE", "OTHER"].map((key) => ({
        key: key,
        value: inWeek.filter((l) => groupFor(l.name) === key).reduce((s, l) => s + volume(l), 0)
      }));
      weeks.push({
        label: i === 0 ? "NOW" : D.fmtShort(monday),
        monday: monday,
        total: segments.reduce((s, x) => s + x.value, 0),
        segments: segments
      });
    }
    $("#volumeChart").innerHTML = barChartSVG(weeks);
    const total = weeks.reduce((s, w) => s + w.total, 0);
    const best = weeks.reduce((a, b) => (b.total > a.total ? b : a), weeks[0]);
    $("#volumeCaption").innerHTML = `<strong>${fmt(total)} KG</strong> ACCUMULATED · BEST WEEK ${esc(best.label)} (${fmt(best.total)} KG) · <strong>${logs.length}</strong> SETS LOGGED`;
  }

  function renderLedger(state) {
    const logs = state.training.logs.slice().sort((a, b) => (b.date + (b.at || "")).localeCompare(a.date + (a.at || "")));
    $("#ledgerCode").textContent = logs.length + " SET" + (logs.length === 1 ? "" : "S");
    if (!logs.length) {
      $("#ledgerList").innerHTML = `<div class="empty-list">LEDGER EMPTY — LOG A SET TO BEGIN THE CHAMBER.</div>`;
      return;
    }
    $("#ledgerList").innerHTML = logs.slice(0, 14).map((l) => {
      const timed = isTimed(l);
      return `<div class="ledger-row">
        <span class="ledger-date">${D.fmtShort(l.date)}</span>
        <strong class="ledger-name">${esc(l.name)}</strong>
        <span class="ledger-load">${timed ? l.reps + " SEC HOLD" + (l.weight > 0 ? " @ " + l.weight + " KG" : "") : l.weight + " KG × " + l.reps}</span>
        <span class="ledger-vol">${timed ? "—" : fmt(volume(l)) + " KG"}</span>
        <button class="icon-btn btn-mini" data-train="del-log" data-id="${esc(l.id)}" title="Remove set" aria-label="Remove set">×</button>
      </div>`;
    }).join("");
  }

  function render(state) {
    if (!$("#view-training") || !ctx) return;
    const t = ensure(state);
    const info = analyse(t.logs);
    info.overload = buildOverload(t, info.sessions, info.prs);
    renderTiles(state, info);
    renderToday(state);
    renderPlan(state);
    renderOverload(info);
    renderOneRm(info);
    renderPRs(info);
    renderProgress(state, info);
    renderVolume(state);
    renderLedger(state);
  }

  /* ---------------------------------------------------------
     modals
     --------------------------------------------------------- */
  function field(label, inner, id) {
    return `<label class="train-field"><span${id ? ` id="${id}"` : ""}>${label}</span>${inner}</label>`;
  }

  function library() {
    const groups = TARGETS.map((target) => {
      const opts = EXERCISES.filter((e) => e.target === target)
        .map((e) => `<option value="${esc(e.name)}">${esc(e.name)}</option>`).join("");
      return opts ? `<optgroup label="${esc(target)}">${opts}</optgroup>` : "";
    }).join("");
    return `<datalist id="exLibrary">${EXERCISES.map((e) => `<option value="${esc(e.name)}"></option>`).join("")}</datalist>
      ${field("BROWSE LIBRARY · " + EXERCISES.length + " DRILLS", `<select class="modal-input ex-browse" id="exBrowse"><option value="">— SELECT MUSCLE GROUP —</option>${groups}</select>`)}`;
  }

  function enterSubmit(nameId) {
    setTimeout(() => {
      const input = $("#modal input:not([type=date])");
      if (!input) return;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const btn = $("#modalActions .btn-primary");
          if (btn) btn.click();
        }
      });
      const browse = $("#modal #exBrowse");
      const nameField = $("#modal #" + (nameId || "exName"));
      if (!nameField) return;

      let lastTimed = null;
      const syncMetric = (adjust) => {
        const timed = timedFor(nameField.value);
        const changed = lastTimed !== null && lastTimed !== timed;
        const label = $("#modal #exRepsLabel");
        const range = $("#modal #exRangeLabel");
        const logLabel = $("#modal #logRepsLabel");
        const hint = $("#modal #exHint");
        const repsEl = $("#modal #" + (nameId === "logName" ? "logReps" : "exReps"));
        if (label) label.textContent = timed ? "HOLD (SEC)" : "REPS (CURRENT)";
        if (range) range.textContent = timed ? "RANGE TOP (SEC)" : "RANGE TOP";
        if (logLabel) logLabel.textContent = timed ? "SECONDS" : "REPS";
        if (hint) hint.textContent = timed
          ? "TIMED HOLD — log seconds, not reps. Add 5 sec per session until all sets reach the top, then extend the range."
          : "REPS is your current target. RANGE TOP is the ceiling — you add one rep at the same weight until all sets reach it, then the weight increases.";
        if (repsEl) {
          repsEl.max = timed ? 600 : 100;
          if (adjust && changed) repsEl.value = timed ? 30 : 8;
        }
        if (nameId !== "logName") {
          const maxEl = $("#modal #exRepMax");
          if (maxEl) {
            maxEl.max = timed ? 600 : 100;
            if (adjust && changed) maxEl.value = timed ? 60 : 12;
          }
        }
        lastTimed = timed;
        return timed;
      };

      nameField.addEventListener("input", () => syncMetric(true));
      syncMetric(false);

      const superset = $("#modal #exSuperset");
      const groupRestWrap = $("#modal #exGroupRestWrap");
      const restLabel = $("#modal #exRestLabel");
      if (superset) {
        const syncSuperset = () => {
          const grouped = !!superset.value;
          if (groupRestWrap) groupRestWrap.style.display = grouped ? "" : "none";
          if (restLabel) restLabel.textContent = grouped ? "REST BETWEEN SETS" : "REST (SEC)";
        };
        superset.addEventListener("change", syncSuperset);
        syncSuperset();
      }
      if (!browse) return;
      browse.addEventListener("change", () => {
        const picked = browse.value;
        if (!picked) return;
        nameField.value = picked;
        const timed = syncMetric();
        const lib = EXERCISES.find((e) => e.name === picked);
        if (nameId !== "logName") {
          const w = $("#modal #exWeight");
          const rest = $("#modal #exRest");
          const r = $("#modal #exReps");
          const maxEl = $("#modal #exRepMax");
          if (lib && w) w.value = lib.weight;
          if (lib && rest) rest.value = lib.kind === "compound" ? 120 : 60;
          if (lib && r) r.value = lib.reps || (timed ? 30 : 8);
          if (lib && maxEl) maxEl.value = lib.timed ? lib.repMax || deriveMax(lib.reps || 30, true) : deriveMax(lib.reps || 8, false);
          return;
        }
        const target = findPlanExercise(ensure(ctx.getState()), picked);
        const weightEl = $("#modal #logWeight");
        const repsEl = $("#modal #logReps");
        const note = $("#modal .train-suggestion-tag");
        const strong = $("#modal .train-suggestion strong");
        const small = $("#modal .train-suggestion small");
        if (weightEl) weightEl.value = target ? target.weight : (lib ? lib.weight : 0);
        if (repsEl) repsEl.value = target ? target.reps : (lib && lib.reps) || (timed ? 30 : 8);
        if (note) note.textContent = target ? suggestLoad(ctx.getState(), picked, { exId: target.id }).note : "BASELINE LOAD";
        if (strong) strong.textContent = target
          ? (target.weight > 0 ? round1(target.weight) + " KG × " + target.reps + (timed ? "S" : "") : "BW × " + target.reps + (timed ? "S" : ""))
          : (timed ? "BW × 30S" : "BW × 8 REPS");
        if (small) small.textContent = timed
          ? "Log the full hold in seconds. Extend the time before anything else changes."
          : "Log every prescribed set at this weight. Advance one rep at a time; the weight only rises once all sets hit the top of the range.";
      });
    }, 80);
  }

  function openExerciseModal(exercise) {
    const editing = !!exercise;
    const ex = exercise || { name: "", sets: 3, reps: 8, repMax: 12, weight: 0, rest: 60, timed: false, superset: "", superRest: 90 };
    const exTimed = isTimed(ex);
    UI.openModal({
      title: editing ? "Edit Protocol Exercise" : "Add Exercise to Protocol",
      body: `<p>${editing ? "Re-program this lift with a new prescription." : "Set the target load for this day. The System will measure you against it."}</p>
        <p class="train-hint" id="exHint">${exTimed
          ? "TIMED HOLD — log seconds, not reps. Add 5 sec per session until all sets reach the top, then extend the range."
          : "REPS is your current target. RANGE TOP is the ceiling — you add one rep at the same weight until all sets reach it, then the weight increases."}</p>
        ${library()}
        ${field("EXERCISE", `<input class="modal-input" id="exName" list="exLibrary" maxlength="48" value="${esc(ex.name)}" />`)}
        <div class="train-form-grid">
          ${field("SETS", `<input class="modal-input" id="exSets" type="number" min="1" max="20" value="${ex.sets}" />`)}
          ${field(exTimed ? "HOLD (SEC)" : "REPS (CURRENT)", `<input class="modal-input" id="exReps" type="number" min="1" max="${metricCeiling(exTimed)}" value="${ex.reps}" />`, "exRepsLabel")}
          ${field(exTimed ? "RANGE TOP (SEC)" : "RANGE TOP", `<input class="modal-input" id="exRepMax" type="number" min="1" max="${metricCeiling(exTimed)}" value="${ex.repMax || deriveMax(ex.reps, exTimed)}" />`, "exRangeLabel")}
          ${field("TARGET KG", `<input class="modal-input" id="exWeight" type="number" min="0" step="0.5" value="${ex.weight}" />`)}
          ${field("REST (SEC)", `<input class="modal-input" id="exRest" type="number" min="15" max="600" step="15" value="${ex.rest}" />`, "exRestLabel")}
        </div>
        <div class="train-form-grid">
          ${field("SUPERSET GROUP", `<select class="modal-input" id="exSuperset"><option value="">NONE · STANDALONE</option>${SUPERSETS.map((k) => `<option value="${k}"${ex.superset === k ? " selected" : ""}>SUPERSET ${k}</option>`).join("")}</select>`)}
          <div id="exGroupRestWrap"${ex.superset ? "" : ` style="display:none"`}>${field("GROUP REST (SEC)", `<input class="modal-input" id="exSuperRest" type="number" min="0" max="600" step="15" value="${ex.superRest || 90}" />`)}</div>
        </div>
        <p class="train-hint">SUPERSET — give two or more drills the same group (A, B, C…) to perform them back-to-back. Group rest is taken after the last drill.</p>`,
      actions: [
        { label: "CANCEL" },
        {
          label: editing ? "SAVE EXERCISE" : "ADD EXERCISE",
          kind: "primary",
          onClick: (overlay) => {
            const name = (overlay.querySelector("#exName").value || "").trim();
            if (!name) { UI.toast("warn", "INVALID EXERCISE", "Name the lift before programming it."); return true; }
            const state = ctx.getState();
            const t = ensure(state);
            const timed = timedFor(name);
            const ceiling = metricCeiling(timed);
            const fallback = timed ? 30 : 8;
            const reps = clamp(Math.round(num(overlay.querySelector("#exReps").value) || fallback), 1, ceiling);
            const repMax = clamp(Math.round(num(overlay.querySelector("#exRepMax").value) || deriveMax(reps, timed)), reps, ceiling);
            const values = {
              name: name.slice(0, 48),
              sets: clamp(Math.round(num(overlay.querySelector("#exSets").value) || 3), 1, 20),
              timed: timed,
              reps: reps,
              repMin: editing && ex.repMin ? Math.min(reps, ex.repMin) : reps,
              repMax: repMax,
              weight: Math.max(0, round1(num(overlay.querySelector("#exWeight").value))),
              rest: clamp(Math.round(num(overlay.querySelector("#exRest").value) || 60), 15, 600),
              superset: normalizeSuper(overlay.querySelector("#exSuperset").value),
              superRest: clamp(Math.round(num(overlay.querySelector("#exSuperRest").value) || 90), 0, 600),
              muscle: groupFor(name),
              target: targetFor(name),
              kind: kindFor(name)
            };
            const list = t.weeks[t.activeWeek].days[t.selectedDay];
            if (editing) {
              const found = list.find((item) => item.id === exercise.id);
              if (found) Object.assign(found, values, { id: found.id });
            } else {
              list.push(Object.assign({ id: uid() }, values));
            }
            ctx.commit();
            UI.toast("success", editing ? "PROTOCOL UPDATED" : "EXERCISE PROGRAMMED", values.name.toUpperCase() + " · " + values.sets + "×" + values.reps + (timed ? "S" : "") + " (" + values.repMin + "–" + repMax + ") @ " + values.weight + " KG" + (values.superset ? " · SS " + values.superset : ""));
            UI.addLog(state, "good", (editing ? "Protocol updated: " : "Exercise programmed: ") + values.name + " (" + values.sets + "×" + metricValue(values.reps, timed) + ").");
            ctx.sfx();
          }
        }
      ]
    });
    enterSubmit();
  }

  function openLogModal(prefill) {
    const p = prefill || {};
    const state = ctx.getState();
    ensure(state);
    const suggestion = p.name ? suggestLoad(state, p.name, p) : null;
    const initialName = p.name || "";
    const initialWeight = suggestion
      ? suggestion.weight
      : (p.weight !== undefined ? p.weight : (weightFor(initialName) || 40));
    const initialTimed = suggestion ? !!suggestion.timed : timedFor(initialName);
    const initialReps = suggestion ? suggestion.reps : (p.reps || (initialTimed ? 30 : 8));

    UI.openModal({
      title: "Log Training Sets",
      body: `<p>Each set is recorded to the ledger for 1RM, volume, overload and record calculations.</p>
        ${suggestion ? `<div class="train-suggestion${suggestion.auto ? " is-auto" : ""}">
          <span class="train-suggestion-tag">${esc(suggestion.note)}</span>
          <strong>${suggestion.weight > 0 ? round1(suggestion.weight) + " KG × " + suggestion.reps + (suggestion.timed ? "S" : "") : "BW × " + suggestion.reps + (suggestion.timed ? "S" : " REPS")}</strong>
          <small>${suggestion.timed
            ? "Log the full hold in seconds. Extend the time before anything else changes."
            : "Log every prescribed set at this weight. Advance one rep at a time; the weight only rises once all sets hit the top of the range."}</small>
        </div>` : ""}
        ${library()}
        ${field("EXERCISE", `<input class="modal-input" id="logName" list="exLibrary" maxlength="48" value="${esc(initialName)}" />`)}
        <div class="train-form-grid">
          ${field("WEIGHT (KG)", `<input class="modal-input" id="logWeight" type="number" min="0" step="0.5" value="${round1(initialWeight)}" />`)}
          ${field(initialTimed ? "SECONDS" : "REPS", `<input class="modal-input" id="logReps" type="number" min="1" max="${metricCeiling(initialTimed)}" value="${initialReps}" />`, "logRepsLabel")}
          ${field("SETS", `<input class="modal-input" id="logSets" type="number" min="1" max="20" value="${p.sets || 1}" />`)}
          ${field("DATE", `<input class="modal-input" id="logDate" type="date" value="${esc(p.date || D.todayKey())}" />`)}
        </div>`,
      actions: [
        { label: "CANCEL" },
        {
          label: "RECORD SETS",
          kind: "primary",
          onClick: (overlay) => {
            const name = (overlay.querySelector("#logName").value || "").trim();
            const s = ctx.getState();
            const tr = ensure(s);
            const planned = findPlanExercise(tr, name, p.exId);
            const timed = planned ? isTimed(planned) : timedFor(name);
            const weight = Math.max(0, round1(num(overlay.querySelector("#logWeight").value)));
            const reps = clamp(Math.round(num(overlay.querySelector("#logReps").value)), 1, metricCeiling(timed));
            const sets = clamp(Math.round(num(overlay.querySelector("#logSets").value) || 1), 1, 20);
            const date = overlay.querySelector("#logDate").value || D.todayKey();
            if (!name || !reps) { UI.toast("warn", "INVALID SET", "Enter an exercise and a " + (timed ? "duration" : "rep count") + "."); return true; }
            const snapshot = {
              exId: p.exId || (planned ? planned.id : ""),
              plannedWeight: planned ? planned.weight : weight,
              plannedReps: planned ? planned.reps : reps,
              plannedSets: planned ? planned.sets : sets
            };
            for (let i = 0; i < sets; i++) {
              tr.logs.push(Object.assign({
                id: uid(), date, name: name.slice(0, 48), weight, reps, timed,
                at: new Date().toISOString(), source: "manual"
              }, snapshot));
            }
            const progressed = autoProgress(s, name, date, p.exId);
            syncStrengthLog();
            ctx.commit();
            const detail = timed ? reps + " SEC HOLD" + (weight > 0 ? " @ " + weight + " KG" : "") : weight + " KG × " + reps;
            if (progressed) {
              const pTitle = progressed.type === "weight" ? "WEIGHT INCREASE · "
                : progressed.type === "range" ? "RANGE EXTENDED · "
                  : progressed.timed ? "HOLD PROGRESSION · " : "REP PROGRESSION · ";
              const pLog = progressed.type === "weight" ? "Weight increased: "
                : progressed.type === "range" ? (progressed.timed ? "Hold range extended: " : "Rep range extended: ")
                  : progressed.timed ? "Hold time increased: " : "Rep progression: ";
              UI.toast("success", pTitle + progressed.name.toUpperCase(), progressed.text + " — plan updated automatically.");
              UI.addLog(s, "good", pLog + progressed.name + " " + progressed.text + ".");
            } else {
              UI.toast("success", "SETS RECORDED", sets + " × " + name.toUpperCase() + " · " + detail);
            }
            UI.addLog(s, "good", "Logged " + sets + " set" + (sets === 1 ? "" : "s") + " of " + name + " (" + detail + ").");
            ctx.sfx();
          }
        }
      ]
    });
    enterSubmit("logName");
  }

  function confirmModal(title, body, label, action) {
    UI.openModal({
      title,
      body: `<p>${body}</p>`,
      actions: [
        { label: "CANCEL" },
        { label, kind: "danger", onClick: action }
      ]
    });
  }

  function seedSample() {
    const state = ctx.getState();
    const t = ensure(state);
    const monday = weekKeyOf(D.todayKey());
    const logs = [];
    const used = [];
    for (let w = 7; w >= 0; w--) {
      const weekStart = D.keyAdd(monday, -w * 7);
      [0, 2, 4].forEach((offset) => {
        const date = D.keyAdd(weekStart, offset);
        if (date > D.todayKey()) return;
        const template = t.weeks[0].days[offset].length ? t.weeks[0].days[offset] : defaultTraining().weeks[0].days[offset];
        template.forEach((ex) => {
          const timed = isTimed(ex);
          if (!(ex.weight > 0) && !timed) return;
          const weekStep = 7 - w;
          const inc = metricStep(timed);
          const range = Math.max(1, Math.round((ex.repMax - ex.repMin) / inc) + 1);
          const wrapped = Math.floor(weekStep / range);
          const weight = round1(ex.weight + (ex.weight > 0 ? wrapped * incrementFor(ex.name) : 0));
          const reps = Math.min(ex.repMax, ex.repMin + ((weekStep % range) * inc));
          for (let set = 0; set < Math.min(ex.sets, 5); set++) {
            logs.push({ id: uid(), date, name: ex.name, weight, reps, timed,
              exId: ex.id, plannedWeight: weight, plannedReps: reps, plannedSets: ex.sets,
              at: new Date().toISOString(), source: "sample" });
          }
          if (used.indexOf(ex.name) === -1) used.push(ex.name);
        });
      });
    }
    t.logs = logs;
    t.progressExercise = used[used.length - 1] || "";
    syncStrengthLog();
    ctx.commit();
    UI.toast("success", "SAMPLE DATA INSTALLED", logs.length + " sets across 8 weeks of progressive overload.");
    UI.addLog(state, "good", "Sample training ledger loaded — 8 weeks of set history.");
    ctx.sfx();
  }

  /* ---------------------------------------------------------
     events
     --------------------------------------------------------- */
  function handle(action, data, el) {
    const state = ctx.getState();
    const t = ensure(state);
    const week = t.weeks[t.activeWeek];

    switch (action) {
      case "prev-week":
        if (t.activeWeek > 0) { t.activeWeek--; ctx.commit(); }
        break;
      case "next-week":
        if (t.activeWeek < t.weeks.length - 1) { t.activeWeek++; ctx.commit(); }
        break;
      case "day":
        t.selectedDay = clamp(num(data.day), 0, 6);
        ctx.commit();
        break;
      case "add-ex":
        openExerciseModal(null);
        break;
      case "edit-ex": {
        const ex = week.days[t.selectedDay].find((x) => x.id === data.id);
        if (ex) openExerciseModal(ex);
        break;
      }
      case "del-ex": {
        const list = week.days[t.selectedDay];
        const index = list.findIndex((x) => x.id === data.id);
        if (index === -1) return;
        const name = list[index].name;
        list.splice(index, 1);
        ctx.commit();
        UI.toast("warn", "EXERCISE REMOVED", name.toUpperCase() + " deleted from this day.");
        UI.addLog(state, "warn", "Exercise removed from protocol: " + name + ".");
        break;
      }
      case "log": {
        const ex = week.days[t.selectedDay].find((x) => x.id === data.id);
        openLogModal(ex ? { name: ex.name, weight: ex.weight, reps: ex.reps, sets: 1, exId: ex.id } : {});
        break;
      }
      case "log-set":
        openLogModal({});
        break;
      case "today-log": {
        const ex = t.weeks[t.activeWeek].days[todayIndex()].find((x) => x.id === data.id);
        openLogModal(ex
          ? { name: ex.name, weight: ex.weight, reps: ex.reps, sets: 1, date: D.todayKey(), exId: ex.id }
          : { date: D.todayKey() });
        break;
      }
      case "today-log-any":
        openLogModal({ date: D.todayKey() });
        break;
      case "today-borrow": {
        const days = t.weeks[t.activeWeek].days;
        const today = todayIndex();
        let source = -1;
        for (let i = 1; i <= 7; i++) {
          const k = (today + i) % 7;
          if (days[k].length) { source = k; break; }
        }
        if (source === -1) { UI.toast("warn", "NO SESSION TO BORROW", "Program at least one training day in this week first."); return; }
        days[today] = days[source].map((ex) => Object.assign({}, ex, { id: uid() }));
        ctx.commit();
        UI.toast("success", "SESSION BORROWED", DAY_NAMES[source] + "'s drills copied to " + DAY_NAMES[today] + ".");
        UI.addLog(state, "good", "Borrowed " + DAY_NAMES[source] + " protocol for " + DAY_NAMES[today] + ".");
        break;
      }
      case "today-open-plan":
        t.selectedDay = todayIndex();
        ctx.commit();
        const plan = $(".plan-panel");
        if (plan) plan.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      case "progress":
        t.progressExercise = data.name || "";
        ctx.commit();
        break;
      case "rename-week":
        UI.openModal({
          title: "Rename Training Week",
          body: `<p>Give this block a designation worthy of the chamber.</p>
            ${field("WEEK NAME", `<input class="modal-input" id="weekName" maxlength="40" value="${esc(week.name)}" />`)}`,
          actions: [
            { label: "CANCEL" },
            {
              label: "SAVE", kind: "primary", onClick: (overlay) => {
                const value = (overlay.querySelector("#weekName").value || "").trim();
                if (!value) { UI.toast("warn", "INVALID NAME", "The week needs a designation."); return true; }
                week.name = value.slice(0, 40);
                ctx.commit();
                UI.toast("success", "WEEK RENAMED", week.name.toUpperCase());
              }
            }
          ]
        });
        enterSubmit();
        break;
      case "add-week": {
        const copy = defaultWeek(t.weeks.length);
        week.days.forEach((list, i) => { copy.days[i] = list.map((ex) => Object.assign({}, ex, { id: uid() })); });
        t.weeks.push(copy);
        t.activeWeek = t.weeks.length - 1;
        ctx.commit();
        UI.toast("success", "WEEK PROGRAMMED", "A new training week was cloned from the current block.");
        UI.addLog(state, "good", "New training week added to the protocol.");
        break;
      }
      case "del-week":
        if (t.weeks.length < 2) return;
        confirmModal("Delete Training Week?", "This removes " + esc(week.name) + " and all of its programmed days. Logged sets are kept.", "DELETE WEEK", () => {
          const s = ctx.getState();
          const tr = ensure(s);
          tr.weeks.splice(tr.activeWeek, 1);
          tr.activeWeek = clamp(tr.activeWeek, 0, tr.weeks.length - 1);
          ctx.commit();
          UI.toast("warn", "WEEK DELETED", "The protocol has been shortened.");
          UI.addLog(s, "warn", "Training week deleted from protocol.");
        });
        break;
      case "copy-day": {
        const day = t.selectedDay;
        let source = null;
        if (day > 0 && week.days[day - 1].length) source = week.days[day - 1];
        else if (t.activeWeek > 0 && t.weeks[t.activeWeek - 1].days[day].length) source = t.weeks[t.activeWeek - 1].days[day];
        if (!source) {
          UI.toast("warn", "NO SOURCE DAY", "Add exercises to the previous day or previous week first.");
          return;
        }
        week.days[day] = source.map((ex) => Object.assign({}, ex, { id: uid() }));
        ctx.commit();
        UI.toast("success", "DAY COPIED", DAY_NAMES[day] + " now mirrors the previous protocol.");
        break;
      }
      case "clear-day":
        confirmModal("Clear Training Day?", "All exercises programmed for " + DAY_NAMES[t.selectedDay] + " will be removed. Logged sets are kept.", "CLEAR DAY", () => {
          const s = ctx.getState();
          ensure(s).weeks[ensure(s).activeWeek].days[ensure(s).selectedDay] = [];
          ctx.commit();
          UI.toast("warn", "DAY CLEARED", DAY_NAMES[t.selectedDay] + " is now a rest day.");
          UI.addLog(s, "warn", "Training day cleared: " + DAY_NAMES[ensure(s).selectedDay] + ".");
        });
        break;
      case "del-log": {
        const index = t.logs.findIndex((l) => l.id === data.id);
        if (index === -1) return;
        const removed = t.logs.splice(index, 1)[0];
        syncStrengthLog();
        ctx.commit();
        UI.toast("warn", "SET REMOVED", removed.name + " · " + (isTimed(removed)
          ? removed.reps + " SEC HOLD" : removed.weight + " KG × " + removed.reps));
        break;
      }
      case "clear-logs":
        if (!t.logs.length) { UI.toast("warn", "LEDGER EMPTY", "There are no sets to clear."); return; }
        confirmModal("Purge Set Ledger?", "This deletes all " + t.logs.length + " logged sets. Personal records, 1RM and volume will reset. Your weekly plan is kept.", "PURGE LEDGER", () => {
          const s = ctx.getState();
          ensure(s).logs = [];
          syncStrengthLog();
          ctx.commit();
          UI.toast("warn", "LEDGER PURGED", "Training analytics have been reset.");
          UI.addLog(s, "warn", "Training set ledger purged by operator.");
        });
        break;
      case "seed":
        confirmModal("Install Sample Training Data?", "This replaces your current set ledger with 8 weeks of progressive sample sets across the current plan's training days.", "INSTALL SAMPLE", seedSample);
        break;
      default:
        break;
    }
  }

  function bindStatic() {
    const map = {
      "#planPrev": "prev-week", "#planNext": "next-week", "#planAddBtn": "add-ex",
      "#planRenameBtn": "rename-week", "#planCopyBtn": "copy-day", "#planAddWeekBtn": "add-week",
      "#planDelWeekBtn": "del-week", "#planClearBtn": "clear-day", "#logSetBtn": "log-set",
      "#clearLogsBtn": "clear-logs", "#seedTrainingBtn": "seed",
      "#todayLogBtn": "today-log-any", "#todayOpenPlanBtn": "today-open-plan"
    };
    Object.keys(map).forEach((sel) => {
      const el = $(sel);
      if (el) el.addEventListener("click", () => handle(map[sel], {}, el));
    });
  }

  /* Keep monthly peaks in step with every set-ledger mutation. */
  function syncStrengthLog() {
    if (window.SystemBody && window.SystemBody.syncFromLogs) {
      window.SystemBody.syncFromLogs(ctx.getState());
    }
  }

  function mount(options) {
    ctx = options;
    ensure(ctx.getState());
    bindStatic();
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-train]");
      if (!el || !ctx) return;
      handle(el.dataset.train, el.dataset, el);
    });
  }

  /* Shared by the Body Log's monthly strength ledger. */
  function exerciseNames() {
    return EXERCISES.map((e) => e.name);
  }

  function heaviestFromLedger(state, name, month) {
    const key = String(name || "").trim().toLowerCase();
    if (!key) return null;
    const logs = ensure(state).logs.filter((l) =>
      l.name.trim().toLowerCase() === key && String(l.date).slice(0, 7) === month);
    if (!logs.length) return null;
    const timed = logs.some((l) => isTimed(l)) || timedFor(name);
    const best = logs.reduce((a, b) => {
      if (timed) return b.reps > a.reps ? b : a;
      if (Math.abs(b.weight - a.weight) > 0.01) return b.weight > a.weight ? b : a;
      return b.reps > a.reps ? b : a;
    }, logs[0]);
    return { weight: best.weight, reps: best.reps, timed, date: best.date };
  }

  window.SystemTraining = {
    mount, render, ensure,
    exerciseNames,
    isExerciseTimed: timedFor,
    targetFor,
    heaviestFromLedger
  };
})();
