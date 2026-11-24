/* =========================================================
   ARISE // Google Fit uplink
   ---------------------------------------------------------
   Browser-side Google Fit REST integration. Uses Google
   Identity Services tokens (no backend) and converts Fit
   datasets/sessions into the same live snapshot shape used
   by SystemData.buildLiveResult().
   ========================================================= */
(function () {
  "use strict";

  const D = window.SystemData;
  const UI = window.SystemUI;
  const $ = (sel) => document.querySelector(sel);
  const API = "https://www.googleapis.com/fitness/v1/users/me";
  const DAY_MS = 86400000;
  const SCOPES = [
    "https://www.googleapis.com/auth/fitness.activity.read",
    "https://www.googleapis.com/auth/fitness.sleep.read",
    "https://www.googleapis.com/auth/fitness.heart_rate.read",
    "https://www.googleapis.com/auth/fitness.body_temperature.read"
  ];

  const ACTIVITY_NAMES = {
    0: "In Vehicle", 1: "Biking", 3: "Still", 4: "Unknown", 5: "Tilting",
    7: "Walking", 8: "Running", 9: "Aerobics", 10: "Badminton", 11: "Baseball",
    12: "Basketball", 13: "Biathlon", 14: "Handbiking", 15: "Mountain Biking",
    16: "Road Biking", 17: "Spinning", 18: "Stationary Biking", 19: "Utility Biking",
    20: "Boxing", 21: "Calisthenics", 22: "Circuit Training", 23: "Cricket",
    24: "Dancing", 25: "Elliptical", 26: "Fencing", 27: "American Football",
    28: "Australian Football", 29: "Soccer", 30: "Frisbee", 31: "Gardening",
    32: "Golf", 33: "Gymnastics", 34: "Handball", 35: "Hiking", 36: "Hockey",
    37: "Horseback Riding", 38: "Housework", 39: "Jumping Rope", 40: "Kayaking",
    41: "Kettlebell Training", 42: "Kickboxing", 43: "Kitesurfing", 44: "Martial Arts",
    45: "Meditation", 46: "Mixed Martial Arts", 47: "P90X", 48: "Paragliding",
    49: "Pilates", 50: "Polo", 51: "Racquetball", 52: "Rock Climbing", 53: "Rowing",
    54: "Rowing Machine", 55: "Rugby", 56: "Jogging", 57: "Running on Sand",
    58: "Treadmill Running", 59: "Sailing", 60: "Scuba Diving", 61: "Skateboarding",
    62: "Skating", 63: "Cross Skating", 64: "Inline Skating", 65: "Skiing",
    66: "Back-country Skiing", 67: "Cross-country Skiing", 68: "Downhill Skiing",
    69: "Kite Skiing", 70: "Roller Skiing", 71: "Sledding", 72: "Sleep",
    73: "Snowboarding", 74: "Snowmobile", 75: "Snowshoeing", 76: "Squash",
    77: "Stair Climbing", 78: "Stair-climbing Machine", 79: "Stand-up Paddleboarding",
    80: "Strength Training", 81: "Surfing", 82: "Swimming", 83: "Pool Swimming",
    84: "Open Water Swimming", 85: "Table Tennis", 86: "Team Sports", 87: "Tennis",
    88: "Treadmill", 89: "Volleyball", 90: "Beach Volleyball", 91: "Indoor Volleyball",
    92: "Wakeboarding", 93: "Fitness Walking", 94: "Nordic Walking", 95: "Treadmill Walking",
    96: "Water Polo", 97: "Weightlifting", 98: "Wheelchair", 99: "Windsurfing",
    100: "Yoga", 101: "Zumba", 102: "Diving", 103: "Ergometer", 104: "Ice Skating",
    105: "Indoor Skating", 106: "Curling", 108: "Other", 109: "Interval Training",
    113: "Crossfit", 114: "HIIT", 115: "Interval Training", 116: "Walking with Stroller",
    117: "Elevator", 118: "Escalator", 119: "Archery", 120: "Softball",
    122: "Guided Breathing"
  };

  const SKIP_ACTIVITIES = { 0: true, 3: true, 4: true, 5: true, 72: true, 117: true, 118: true };

  let ctx = null;
  let token = "";
  let expiresAt = 0;
  let granted = [];
  let client = null;
  let pending = false;
  let tokenResolve = null;
  let tokenReject = null;
  let status = {
    configured: false,
    ready: false,
    syncing: false,
    authorized: false,
    message: "",
    checkedAt: 0
  };

  /* ---------------------------------------------------------
     helpers
     --------------------------------------------------------- */
  const round = (n, digits) => {
    const p = Math.pow(10, digits || 0);
    return Math.round((Number(n) || 0) * p) / p;
  };

  function dayKey(ms) {
    const d = new Date(Number(ms));
    if (isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function valueNumber(entry) {
    if (!entry) return null;
    const raw = entry.fpVal !== undefined ? entry.fpVal : entry.intVal;
    if (raw === undefined || raw === null) return null;
    const n = Number(raw);
    return isFinite(n) ? n : null;
  }

  function firstValue(point) {
    return valueNumber((point && point.value || [])[0]);
  }

  function nanosToMs(value) {
    if (!value) return 0;
    return Number(value) / 1000000;
  }

  function fit(state) {
    if (!state.fit || typeof state.fit !== "object") {
      state.fit = { lastSyncAt: null, lastError: null, email: null };
    }
    return state.fit;
  }

  function clientId() {
    const cfg = window.ARISE_FIREBASE_CONFIG || {};
    const id = String(cfg.fitClientId || cfg.googleClientId || "").trim();
    return id && !/^(YOUR|PASTE|ADD)_/i.test(id) ? id : "";
  }

  function emit() {
    render();
    if (ctx && typeof ctx.onFitStatus === "function") {
      ctx.onFitStatus(publicStatus());
    }
    if (ctx && typeof ctx.render === "function") {
      ctx.render();
    }
  }

  function publicStatus() {
    const saved = ctx && ctx.getState ? fit(ctx.getState()) : {};
    return {
      configured: status.configured,
      ready: status.ready,
      syncing: status.syncing,
      authorized: !!token && Date.now() < expiresAt,
      message: status.message || "",
      lastError: saved.lastError || "",
      lastSyncAt: saved.lastSyncAt || null,
      email: saved.email || null
    };
  }

  function friendlyError(err) {
    if (!err) return "Unknown Google Fit error.";
    const raw = String(err.message || err.error || err || "Unknown Google Fit error.");
    if (err.status === 403) {
      return raw + " Enable the Fitness API for this OAuth client and add the Google Fit scopes to the consent screen.";
    }
    if (err.status === 401) {
      return "Google Fit authorization expired. Press SYNC GOOGLE FIT to authorize again.";
    }
    return raw;
  }

  function handleError(title, err, modal) {
    const text = friendlyError(err);
    status.message = text;
    if (ctx) {
      const saved = fit(ctx.getState());
      saved.lastError = text;
      ctx.persist();
    }
    emit();
    UI.toast("error", title, text);
    if (modal) {
      UI.openModal({
        title,
        body: "<p>" + UI.escape(text) + "</p>",
        actions: [{ label: "OK", kind: "primary" }]
      });
    }
    return text;
  }

  /* ---------------------------------------------------------
     Google Identity Services token
     --------------------------------------------------------- */
  function gis() {
    return window.google && window.google.accounts && window.google.accounts.oauth2
      ? window.google.accounts.oauth2
      : null;
  }

  function initClient() {
    const lib = gis();
    const id = clientId();
    if (!lib || !id) return null;
    if (!client || client._clientId !== id) {
      client = lib.initTokenClient({
        client_id: id,
        scope: SCOPES.join(" "),
        callback: onToken,
        error_callback: onTokenError
      });
      client._clientId = id;
    }
    return client;
  }

  function settleToken(err, value) {
    const resolve = tokenResolve;
    const reject = tokenReject;
    pending = false;
    tokenResolve = null;
    tokenReject = null;
    if (value !== undefined && !err) {
      if (resolve) resolve(value);
    } else if (reject) {
      reject(err || new Error("Google authorization was cancelled."));
    }
  }

  function onToken(response) {
    if (!response || response.error) {
      settleToken(new Error(response && response.error_description || response && response.error || "Google authorization failed."));
      emit();
      return;
    }
    if (!response.access_token) {
      settleToken(new Error("Google did not return an access token."));
      emit();
      return;
    }
    token = response.access_token;
    const seconds = Math.max(60, Number(response.expires_in) || 3600);
    expiresAt = Date.now() + seconds * 1000 - 60000;
    granted = String(response.scope || "").split(/\s+/).filter(Boolean);
    status.authorized = true;
    status.message = "Google Fit connected";
    status.checkedAt = Date.now();
    if (ctx) {
      const saved = fit(ctx.getState());
      saved.lastError = null;
      ctx.persist();
    }
    settleToken(null, token);
    emit();
  }

  function onTokenError(err) {
    settleToken(new Error(err && err.type ? "Google authorization failed: " + err.type : "Google authorization failed."));
    emit();
  }

  function requestToken() {
    if (token && Date.now() < expiresAt) return Promise.resolve(token);
    if (pending && tokenReject) tokenReject(new Error("A new authorization request was started."));

    return new Promise((resolve, reject) => {
      tokenResolve = resolve;
      tokenReject = reject;
      pending = true;
      const c = initClient();
      if (!c) {
        settleToken(new Error(clientId()
          ? "Google sign-in is still loading. Try again in a moment."
          : "Add a Google client ID to firebase-config.js before connecting Google Fit."));
        return;
      }
      try {
        /* Must stay synchronous: GIS requires a user gesture. */
        c.requestAccessToken();
      } catch (err) {
        settleToken(err);
      }
    });
  }

  function ensureToken() {
    if (token && Date.now() < expiresAt) return Promise.resolve(token);
    return requestToken();
  }

  /* ---------------------------------------------------------
     Fit REST wrapper
     --------------------------------------------------------- */
  async function api(path, options) {
    const access = await ensureToken();
    const opts = options || {};
    const init = {
      method: opts.method || "GET",
      headers: {
        Authorization: "Bearer " + access,
        Accept: "application/json"
      }
    };
    if (opts.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    }

    const response = await fetch(API + path, init);
    if (!response.ok) {
      let detail = "";
      try {
        const payload = await response.json();
        detail = (payload && payload.error && (payload.error.message || payload.error.status)) || payload && payload.message || "";
      } catch (err) { /* response was not JSON */ }
      const error = new Error("Google Fit " + response.status + (detail ? ": " + detail : ""));
      error.status = response.status;
      if (response.status === 401) {
        token = "";
        expiresAt = 0;
        status.authorized = false;
      }
      throw error;
    }
    return response.json();
  }

  function aggregate(dataTypeName, startMs, endMs, extra) {
    const body = {
      startTimeMillis: startMs,
      endTimeMillis: endMs,
      aggregateBy: [{ dataTypeName: dataTypeName }],
      bucketByTime: { durationMillis: DAY_MS }
    };
    if (extra && extra.bucketBySession) {
      delete body.bucketByTime;
      body.bucketBySession = extra.bucketBySession;
    }
    if (extra && extra.dataSourceId) body.aggregateBy[0].dataSourceId = extra.dataSourceId;
    return api("/dataset:aggregate", { method: "POST", body });
  }

  function listSessions(startISO, endISO, activityType) {
    const params = new URLSearchParams({ startTime: startISO, endTime: endISO });
    if (activityType !== undefined) params.set("activityType", String(activityType));
    return api("/sessions?" + params.toString());
  }

  function attempt(label, fn) {
    return Promise.resolve()
      .then(fn)
      .then((value) => ({ label, value, error: null }))
      .catch((error) => ({ label, value: null, error }));
  }

  /* ---------------------------------------------------------
     Dataset reduction
     --------------------------------------------------------- */
  function bucketPoints(response) {
    const map = {};
    ((response && response.bucket) || []).forEach((bucket) => {
      const key = dayKey(bucket.startTimeMillis);
      if (!key) return;
      if (!map[key]) map[key] = [];
      ((bucket.dataset) || []).forEach((dataset) => {
        ((dataset && dataset.point) || []).forEach((point) => map[key].push(point));
      });
    });
    return map;
  }

  function sumPoints(map, select) {
    const out = {};
    Object.keys(map).forEach((key) => {
      let total = 0;
      let found = false;
      map[key].forEach((point) => {
        const value = select(point, key);
        if (typeof value === "number" && isFinite(value) && value > 0) {
          total += value;
          found = true;
        }
      });
      if (found) out[key] = total;
    });
    return out;
  }

  function averagePoints(map, select) {
    const out = {};
    Object.keys(map).forEach((key) => {
      const buckets = {};
      map[key].forEach((point) => {
        const row = select(point, key);
        if (!row) return;
        Object.keys(row).forEach((name) => {
          const value = row[name];
          if (typeof value === "number" && isFinite(value) && value > 0) {
            if (!buckets[name]) buckets[name] = [];
            buckets[name].push(value);
          }
        });
      });
      const row = {};
      Object.keys(buckets).forEach((name) => {
        const vals = buckets[name];
        row[name] = vals.reduce((a, b) => a + b, 0) / vals.length;
      });
      if (Object.keys(row).length) out[key] = row;
    });
    return out;
  }

  function countPoints(response) {
    let count = 0;
    ((response && response.bucket) || []).forEach((bucket) => {
      ((bucket.dataset) || []).forEach((dataset) => {
        count += ((dataset && dataset.point) || []).length;
      });
    });
    return count;
  }

  function collectSleepPoints(response) {
    const points = [];
    ((response && response.bucket) || []).forEach((bucket) => {
      ((bucket.dataset) || []).forEach((dataset) => {
        ((dataset && dataset.point) || []).forEach((point) => points.push(point));
      });
    });
    return points;
  }

  function pointRange(point) {
    const start = nanosToMs(point.startTimeNanos || (point.startTimeMillis ? Number(point.startTimeMillis) * 1000000 : 0));
    const endRaw = point.endTimeNanos || point.timestampNanos ||
      (point.endTimeMillis ? Number(point.endTimeMillis) * 1000000 : 0);
    const end = nanosToMs(endRaw) || start;
    return { start, end };
  }

  function sleepPart(point, from, to) {
    const range = pointRange(point);
    const start = Math.max(range.start || from, from);
    const end = Math.min(range.end || to, to);
    if (!(end > start)) return null;
    const stage = valueNumber((point.value || [])[0]);
    const part = { hours: (end - start) / 3600000 };
    if (stage === 5) part.deep = true;
    else if (stage === 6) part.rem = true;
    else if (stage === 4) part.light = true;
    else if (stage === 2) part.generic = true;
    else if (stage === 1 || stage === 3) part.awake = true;
    else return null;
    return part;
  }

  function buildSleep(sessionsResponse, segmentsResponse) {
    const sessions = ((sessionsResponse && sessionsResponse.session) || []).filter((s) => Number(s.activityType) === 72);
    const points = collectSleepPoints(segmentsResponse);
    const used = new Set();
    const acc = {};

    function add(key, part) {
      if (!key || !part) return;
      if (!acc[key]) acc[key] = { deep: 0, rem: 0, light: 0, generic: 0, awake: 0 };
      if (part.deep) acc[key].deep += part.hours;
      else if (part.rem) acc[key].rem += part.hours;
      else if (part.light) acc[key].light += part.hours;
      else if (part.generic) acc[key].generic += part.hours;
      else if (part.awake) acc[key].awake += part.hours;
    }

    sessions.forEach((session) => {
      const start = Number(session.startTimeMillis);
      const end = Number(session.endTimeMillis);
      const key = dayKey(end);
      let matched = false;
      points.forEach((point, index) => {
        if (used.has(index)) return;
        const range = pointRange(point);
        if (range.end < start || range.start > end) return;
        const part = sleepPart(point, start, end);
        if (!part) return;
        add(key, part);
        used.add(index);
        matched = true;
      });
      if (!matched && end > start) add(key, { generic: true, hours: (end - start) / 3600000 });
    });

    /* Sleep stages without a Fit sleep session still count, assigned to wake day. */
    if (!sessions.length) {
      points.forEach((point) => {
        const range = pointRange(point);
        add(dayKey(range.end), sleepPart(point, range.start, range.end));
      });
    }

    const out = {};
    Object.keys(acc).forEach((key) => {
      const row = acc[key];
      const granular = row.light + row.deep + row.rem;
      const core = granular > 0 ? row.light : row.generic;
      const total = row.deep + row.rem + core;
      if (total <= 0) return;
      out[key] = {
        sleepHours: round(total, 2),
        deepHours: round(row.deep, 2),
        remHours: round(row.rem, 2),
        coreHours: round(core, 2),
        awakeHours: round(row.awake, 2)
      };
    });
    return out;
  }

  function buildSessionEnergy(response, bmr, startMs, endMs) {
    const out = {};
    ((response && response.bucket) || []).forEach((bucket) => {
      const session = bucket.session;
      if (!session || !session.id) return;
      let total = 0;
      let direct = 0;
      ((bucket.dataset) || []).forEach((dataset) => {
        ((dataset && dataset.point) || []).forEach((point) => {
          const value = firstValue(point);
          if (!(value > 0)) return;
          total += value;
          if (/from_activities/i.test(String(point.originDataSourceId || ""))) direct += value;
        });
      });
      if (direct > 0) {
        out[session.id] = direct;
        return;
      }
      const start = Number(session.startTimeMillis);
      const end = Number(session.endTimeMillis);
      const key = dayKey(start);
      const days = Math.max(0.01, (end - start) / DAY_MS);
      out[session.id] = Math.max(0, total - (bmr[key] || 0) * days);
    });
    return out;
  }

  function buildWorkouts(sessionsResponse, sessionEnergyResponse, activeEnergy, bmr, startMs, endMs) {
    const sessions = ((sessionsResponse && sessionsResponse.session) || [])
      .filter((s) => !SKIP_ACTIVITIES[Number(s.activityType)]);

    const totalMinutes = {};
    sessions.forEach((s) => {
      const start = Number(s.startTimeMillis);
      const duration = (Number(s.endTimeMillis) - start) / 60000;
      if (!(duration >= 1)) return;
      const key = dayKey(start);
      totalMinutes[key] = (totalMinutes[key] || 0) + duration;
    });

    const sessionEnergy = buildSessionEnergy(sessionEnergyResponse, bmr, startMs, endMs);
    const workouts = [];
    sessions.forEach((s) => {
      const start = Number(s.startTimeMillis);
      const end = Number(s.endTimeMillis);
      const duration = (end - start) / 60000;
      if (!(duration >= 1)) return;
      const key = dayKey(start);
      let energy = sessionEnergy[s.id];
      if (!(energy > 0) && activeEnergy[key] > 0 && totalMinutes[key] > 0) {
        energy = activeEnergy[key] * (duration / totalMinutes[key]);
      }
      const activity = Number(s.activityType);
      workouts.push({
        rawName: String(s.name || ACTIVITY_NAMES[activity] || "Workout"),
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        duration: round(duration, 1),
        energy: Math.round(energy || 0),
        source: "Google Fit"
      });
    });
    return workouts;
  }

  /* ---------------------------------------------------------
     Snapshot builder
     --------------------------------------------------------- */
  async function loadSnapshot() {
    if (!clientId()) throw new Error("Add a Google client ID to firebase-config.js before connecting Google Fit.");

    /* Called synchronously from the click handler to preserve user activation. */
    await ensureToken();

    const now = new Date();
    const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startMs = localMidnight.getTime() - 39 * DAY_MS;
    const endMs = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - 1;
    const startISO = new Date(startMs).toISOString();
    const endISO = new Date(endMs).toISOString();

    const results = await Promise.all([
      attempt("steps", () => aggregate("com.google.step_count.delta", startMs, endMs)),
      attempt("energy", () => aggregate("com.google.calories.expended", startMs, endMs)),
      attempt("bmr", () => aggregate("com.google.calories.bmr", startMs, endMs)),
      attempt("active", () => aggregate("com.google.active_minutes", startMs, endMs)),
      attempt("heart", () => aggregate("com.google.heart_rate.summary", startMs, endMs)),
      attempt("temperature", () => aggregate("com.google.body.temperature", startMs, endMs)),
      attempt("sleepSessions", () => listSessions(startISO, endISO, 72)),
      attempt("sleepSegments", () => aggregate("com.google.sleep.segment", startMs, endMs)),
      attempt("sessions", () => listSessions(startISO, endISO)),
      attempt("sessionEnergy", () => aggregate("com.google.calories.expended", startMs, endMs, { bucketBySession: { minDurationMillis: 60000 } }))
    ]);
    const data = {};
    const errors = [];
    results.forEach((result) => {
      data[result.label] = result.value;
      if (result.error) errors.push(result.error);
    });

    const coreLabels = ["steps", "energy", "bmr", "active", "sleepSessions", "sleepSegments", "sessions"];
    const coreOk = coreLabels.some((label) => data[label]);
    if (!coreOk && errors.length) {
      const authError = errors.find((e) => e.status === 401 || e.status === 403) || errors[0];
      throw authError;
    }

    const steps = sumPoints(bucketPoints(data.steps), firstValue);
    const totalCalories = sumPoints(bucketPoints(data.energy), firstValue);
    const activityCalories = sumPoints(bucketPoints(data.energy), (point) =>
      /from_activities/i.test(String(point.originDataSourceId || "")) ? firstValue(point) : null);
    const bmr = averagePoints(bucketPoints(data.bmr), (point) => ({ calories: firstValue(point) }));
    const activeMinutes = sumPoints(bucketPoints(data.active), (point) => {
      const raw = firstValue(point);
      if (!(raw > 0)) return null;
      /* REST documents milliseconds; older clients wrote minutes. */
      return raw > 1440 ? raw / 60000 : raw;
    });
    const heart = averagePoints(bucketPoints(data.heart), (point) => {
      const values = point.value || [];
      return {
        avg: valueNumber(values[0]),
        max: valueNumber(values[1]),
        min: valueNumber(values[2])
      };
    });
    const temperature = averagePoints(bucketPoints(data.temperature), (point) => {
      const values = point.value || [];
      const location = valueNumber(values[1]);
      if (location && location !== 9) return null;
      return { celsius: valueNumber(values[0]) };
    });
    const sleep = buildSleep(data.sleepSessions, data.sleepSegments);

    const activeEnergy = {};
    Object.keys(totalCalories).forEach((key) => {
      const value = activityCalories[key] > 0
        ? activityCalories[key]
        : Math.max(0, totalCalories[key] - (bmr[key] && bmr[key].calories || 0));
      if (value > 0) activeEnergy[key] = value;
    });

    const workouts = buildWorkouts(data.sessions, data.sessionEnergy, activeEnergy,
      Object.keys(bmr).reduce((map, key) => { map[key] = bmr[key].calories || 0; return map; }, {}),
      startMs, endMs);

    const days = {};
    const metrics = new Set();
    function ensureDay(key) {
      if (!days[key]) days[key] = {};
      return days[key];
    }
    function put(key, name, value, digits) {
      if (!(value > 0)) return;
      ensureDay(key)[name] = round(value, digits === undefined ? 0 : digits);
      metrics.add(name);
    }

    Object.keys(steps).forEach((key) => put(key, "steps", steps[key]));
    Object.keys(activeEnergy).forEach((key) => put(key, "activeEnergy", activeEnergy[key]));
    Object.keys(bmr).forEach((key) => put(key, "basalEnergy", bmr[key].calories));
    Object.keys(activeMinutes).forEach((key) => put(key, "exerciseMinutes", activeMinutes[key]));
    Object.keys(sleep).forEach((key) => {
      put(key, "sleepHours", sleep[key].sleepHours, 2);
      put(key, "deepHours", sleep[key].deepHours, 2);
      put(key, "remHours", sleep[key].remHours, 2);
      put(key, "coreHours", sleep[key].coreHours, 2);
      put(key, "awakeHours", sleep[key].awakeHours, 2);
    });
    Object.keys(heart).forEach((key) => {
      put(key, "hrAvg", heart[key].avg);
      put(key, "hrMax", heart[key].max);
      put(key, "hrMin", heart[key].min);
    });
    Object.keys(temperature).forEach((key) => put(key, "wristTemp", temperature[key].celsius, 2));
    if (workouts.length) metrics.add("workouts");

    let records = results.reduce((sum, result) => sum + countPoints(result.value), 0);
    records += ((data.sessions && data.sessions.session) || []).length;
    records += ((data.sleepSessions && data.sleepSessions.session) || []).length;

    if (!Object.keys(days).length && !workouts.length) {
      UI.toast("warn", "NO GOOGLE FIT DATA", "Google Fit returned no records for the last 40 days.");
    }

    return {
      source: "Google Fit",
      filename: "google-fit-live",
      records,
      metrics: Array.from(metrics),
      days,
      workouts
    };
  }

  /* ---------------------------------------------------------
     public actions
     --------------------------------------------------------- */
  function markSynced(email) {
    if (!ctx) return;
    const saved = fit(ctx.getState());
    saved.lastSyncAt = new Date().toISOString();
    if (email) saved.email = email;
    saved.lastError = null;
    ctx.persist();
    status.message = "Google Fit synced";
    emit();
  }

  function connect() {
    status.configured = !!clientId();
    if (!status.configured) {
      handleError("GOOGLE FIT SETUP REQUIRED", new Error("Add fitClientId to firebase-config.js and enable the Fitness API for that OAuth client."), true);
      return;
    }
    if (!gis()) {
      UI.toast("warn", "GOOGLE SIGN-IN LOADING", "The Google Identity script is still loading. Try again in a moment.");
      return;
    }
    status.message = "Waiting for Google authorization";
    emit();
    ensureToken()
      .then(() => {
        UI.toast("success", "GOOGLE FIT CONNECTED", "Google Fit is authorized. Press SYNC GOOGLE FIT to pull your data.");
      })
      .catch((err) => handleError("GOOGLE FIT CONNECT FAILED", err, false));
  }

  async function sync() {
    if (status.syncing) {
      UI.toast("warn", "SYNC IN PROGRESS", "Wait for the current Google Fit sync to finish.");
      return;
    }
    status.configured = !!clientId();
    if (!status.configured) {
      handleError("GOOGLE FIT SETUP REQUIRED", new Error("Add fitClientId to firebase-config.js and enable the Fitness API for that OAuth client."), true);
      return;
    }
    if (!gis()) {
      UI.toast("warn", "GOOGLE SIGN-IN LOADING", "The Google Identity script is still loading. Try again in a moment.");
      return;
    }

    status.syncing = true;
    status.message = "Reading Google Fit data";
    emit();
    try {
      const snapshot = await loadSnapshot();
      const applied = ctx && typeof ctx.applySnapshot === "function"
        ? ctx.applySnapshot(snapshot)
        : false;
      status.message = applied
        ? "Google Fit synced"
        : "Review the replacement prompt to finish syncing";
    } catch (err) {
      handleError("GOOGLE FIT SYNC FAILED", err, true);
    } finally {
      status.syncing = false;
      emit();
    }
  }

  function disconnect() {
    UI.openModal({
      title: "Disconnect Google Fit?",
      body: "<p>Local ARISE data stays on this device. The browser's Google Fit access is revoked; you can reconnect at any time.</p>",
      actions: [
        { label: "CANCEL" },
        {
          label: "DISCONNECT",
          kind: "danger",
          onClick: () => {
            const revoke = gis() && gis().revoke;
            if (token && typeof revoke === "function") {
              revoke(token, () => { /* revocation is best-effort in-browser */ });
            }
            token = "";
            expiresAt = 0;
            granted = [];
            status.authorized = false;
            status.message = "Google Fit disconnected";
            if (ctx) {
              const saved = fit(ctx.getState());
              saved.email = null;
              saved.lastError = null;
              ctx.persist();
            }
            emit();
            UI.toast("warn", "GOOGLE FIT DISCONNECTED", "Local data was kept. Reconnect when you want another sync.");
          }
        }
      ]
    });
  }

  function render() {
    if (!ctx) return;
    const state = ctx.getState();
    const saved = fit(state);
    const current = publicStatus();
    const statusEl = $("#fitStatusText");
    const chip = $("#fitChip");
    const chipText = $("#fitChipText");
    const account = $("#fitAccountText");
    const last = $("#fitLastSyncText");
    const note = $("#fitNote");
    const connectBtn = $("#fitConnectBtn");
    const syncBtn = $("#fitSyncBtn");
    const disconnectBtn = $("#fitDisconnectBtn");

    let label = "READY";
    let detail = "Authorize Google Fit, then sync the last 40 days of data.";
    if (!current.configured) {
      label = "SETUP REQUIRED";
      detail = "Add fitClientId to firebase-config.js and enable Google Fit for that OAuth client.";
    } else if (!current.ready) {
      label = "LOADING GOOGLE";
      detail = "Waiting for the Google Identity Services script…";
    } else if (current.syncing) {
      label = "SYNCING";
      detail = "Reading Google Fit datasets and sessions…";
    } else if (current.lastError) {
      label = "SYNC ERROR";
      detail = current.lastError;
    } else if (current.authorized) {
      label = "CONNECTED";
      detail = "Google Fit is authorized. Press SYNC GOOGLE FIT to refresh your archive.";
    } else if (saved.lastSyncAt) {
      label = "LINKED";
      detail = "Authorization is session-only. Press SYNC GOOGLE FIT to authorize and refresh.";
    }

    if (statusEl) statusEl.textContent = label;
    if (chipText) chipText.textContent = current.syncing ? "SYNCING" : current.authorized ? "GOOGLE FIT LIVE" : saved.lastSyncAt ? "GOOGLE FIT LINKED" : "AWAITING SYNC";
    if (chip) {
      chip.classList.toggle("is-live", !!current.authorized || !!saved.lastSyncAt);
      chip.classList.toggle("is-due", !!current.lastError);
    }
    if (account) account.textContent = saved.email || (current.authorized ? "GOOGLE ACCOUNT" : "NOT LINKED");
    if (last) last.textContent = D.fmtDateTime(saved.lastSyncAt ? new Date(saved.lastSyncAt).toISOString() : null);
    if (note) note.textContent = detail;
    if (connectBtn) connectBtn.disabled = !current.configured || !current.ready || current.authorized;
    if (syncBtn) syncBtn.disabled = !current.configured || !current.ready || current.syncing;
    if (disconnectBtn) disconnectBtn.hidden = !saved.lastSyncAt && !current.authorized;
  }

  function bindStatic() {
    const map = {
      "#fitConnectBtn": connect,
      "#fitSyncBtn": () => { sync(); },
      "#fitDisconnectBtn": disconnect
    };
    Object.keys(map).forEach((sel) => {
      const el = $(sel);
      if (el) el.addEventListener("click", map[sel]);
    });
  }

  function mount(options) {
    ctx = options || {};
    status.configured = !!clientId();
    bindStatic();
    render();
    const started = Date.now();
    const tick = () => {
      if (gis()) {
        status.ready = true;
        status.checkedAt = Date.now();
        emit();
        return;
      }
      if (Date.now() - started > 10000) {
        status.message = "Google Identity Services did not load.";
        emit();
        return;
      }
      setTimeout(tick, 120);
    };
    tick();
  }

  window.SystemFit = {
    SCOPES,
    mount,
    connect,
    sync,
    disconnect,
    markSynced,
    render,
    status: publicStatus,
    loadSnapshot
  };
})();
