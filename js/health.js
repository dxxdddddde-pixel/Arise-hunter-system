/* =========================================================
   ARISE // Google Health uplink
   ---------------------------------------------------------
   Browser-side Google Health REST integration. Uses the
   Authorization Code flow with PKCE (S256) and CSRF state,
   with no backend and no client secret. Google Health data
   is mapped into the same live snapshot shape consumed by
   SystemData.buildLiveResult().
   ========================================================= */
(function () {
  "use strict";

  const D = window.SystemData;
  const UI = window.SystemUI;
  const $ = (sel) => document.querySelector(sel);

  const API = "https://health.googleapis.com/v4";
  const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
  const TOKEN_URL = "https://oauth2.googleapis.com/token";
  const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

  const ACTIVITY_SCOPE = "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly";
  const METRICS_SCOPE = "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly";
  const SLEEP_SCOPE = "https://www.googleapis.com/auth/googlehealth.sleep.readonly";
  const SCOPES = [ACTIVITY_SCOPE, METRICS_SCOPE, SLEEP_SCOPE];
  const SCOPE_LABELS = {
    [ACTIVITY_SCOPE]: "Activity & Fitness",
    [METRICS_SCOPE]: "Health Metrics",
    [SLEEP_SCOPE]: "Sleep"
  };

  const OAUTH = {
    verifier: "arise-health-oauth-verifier",
    state: "arise-health-oauth-state",
    action: "arise-health-oauth-action",
    redirect: "arise-health-oauth-redirect"
  };
  const memoryStore = {};

  const WINDOW_DAYS = 40;
  const SHORT_WINDOW_DAYS = 14;

  let ctx = null;
  let token = "";
  let expiresAt = 0;
  let granted = [];
  let scopeKnown = true;
  let status = {
    configured: false,
    ready: false,
    syncing: false,
    authorized: false,
    partial: false,
    apiPartial: false,
    message: "",
    checkedAt: 0
  };

  /* ---------------------------------------------------------
     helpers
     --------------------------------------------------------- */
  const round = (n, digits) => {
    const p = Math.pow(10, digits || 0);
    return Math.round((number(n) || 0) * p) / p;
  };

  function number(value) {
    if (value === undefined || value === null || value === "") return 0;
    const n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function dayKey(value) {
    if (value === null || value === undefined || value === "") return "";
    const raw = typeof value === "number" || /^\d+$/.test(String(value)) ? Number(value) : value;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function civilKey(civil) {
    const date = civil && civil.date;
    if (!date || !number(date.year)) return "";
    return String(date.year) + "-" + String(number(date.month)).padStart(2, "0") + "-" + String(number(date.day)).padStart(2, "0");
  }

  function localDay(offset) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + (offset || 0));
  }

  function civil(date) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate()
    };
  }

  function civilRange(startOffset, days) {
    return {
      start: { date: civil(localDay(startOffset)) },
      end: { date: civil(localDay(startOffset + days)) }
    };
  }

  function chunkRanges(days, maxDays) {
    const ranges = [];
    let offset = -(days - 1);
    let left = days;
    while (left > 0) {
      const size = Math.min(maxDays, left);
      ranges.push(civilRange(offset, size));
      offset += size;
      left -= size;
    }
    return ranges;
  }

  function sessionFilter(type, field, startKey, endKey) {
    const exclusiveEnd = D.keyAdd(endKey, 1);
    const path = type + ".interval." + field;
    return path + ' >= "' + startKey + '" AND ' + path + ' < "' + exclusiveEnd + '"';
  }

  function durationSeconds(value) {
    if (typeof value === "number" && isFinite(value)) return value;
    const match = /^(-?\d+(?:\.\d+)?)s$/i.exec(String(value || "").trim());
    return match ? Number(match[1]) : 0;
  }

  function health(state) {
    if (!state.health || typeof state.health !== "object") {
      state.health = { lastSyncAt: null, lastError: null, email: null, scopes: [] };
    }
    if (!Array.isArray(state.health.scopes)) state.health.scopes = [];
    return state.health;
  }

  function clientId() {
    const cfg = window.ARISE_FIREBASE_CONFIG || {};
    const id = String(cfg.healthClientId || cfg.googleClientId || "").trim();
    return id && !/^(YOUR|PASTE|ADD)_/i.test(id) ? id : "";
  }

  function redirectUri() {
    const cfg = window.ARISE_FIREBASE_CONFIG || {};
    const configured = String(cfg.healthRedirectUri || "").trim();
    if (configured && !/^(YOUR|PASTE|ADD)_/i.test(configured)) return configured;
    return location.origin + location.pathname;
  }

  function getStored(key) {
    try {
      const value = sessionStorage.getItem(key);
      return value === null ? memoryStore[key] || null : value;
    } catch (err) {
      return memoryStore[key] || null;
    }
  }

  function setStored(key, value) {
    memoryStore[key] = value;
    try { sessionStorage.setItem(key, value); } catch (err) { /* private mode */ }
  }

  function clearStored(key) {
    delete memoryStore[key];
    try { sessionStorage.removeItem(key); } catch (err) { /* private mode */ }
  }

  function clearOAuthState() {
    Object.keys(OAUTH).forEach((key) => clearStored(OAUTH[key]));
  }

  function emit() {
    render();
    if (ctx && typeof ctx.render === "function") ctx.render();
  }

  function missingScopes() {
    if (!scopeKnown) return [];
    return SCOPES.filter((scope) => !scopeGranted(scope));
  }

  function publicStatus() {
    const saved = ctx && ctx.getState ? health(ctx.getState()) : {};
    const authorized = !!token && Date.now() < expiresAt;
    const missing = authorized ? missingScopes() : [];
    return {
      configured: status.configured,
      ready: status.ready,
      syncing: status.syncing,
      authorized,
      partial: authorized && (!scopeKnown || missing.length > 0 || status.apiPartial),
      missingScopes: missing,
      scopeUnknown: authorized && !scopeKnown,
      apiPartial: status.apiPartial,
      scopes: granted.slice(),
      message: status.message || "",
      lastError: saved.lastError || "",
      lastSyncAt: saved.lastSyncAt || null,
      email: saved.email || null
    };
  }

  function friendlyError(err) {
    if (!err) return "Unknown Google Health error.";
    const raw = String(err.message || err.error || err || "Unknown Google Health error.");
    if (err.status === 403) {
      return raw + " Check that the Google Health API is enabled, the read scopes are on the consent screen, and the account is a test user if the app is in testing.";
    }
    if (err.status === 401) {
      return "Google Health authorization expired. Press SYNC GOOGLE HEALTH to authorize again.";
    }
    if (/redirect_uri_mismatch/i.test(raw)) {
      return raw + " Register the exact redirect URI shown in the browser address bar setup: use healthRedirectUri in firebase-config.js or let the app use the current page URL.";
    }
    return raw;
  }

  function handleError(title, err, modal) {
    const text = friendlyError(err);
    status.message = text;
    if (ctx) {
      const saved = health(ctx.getState());
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
     OAuth 2.0 Authorization Code + PKCE
     --------------------------------------------------------- */
  function randomBytes(count) {
    const bytes = new Uint8Array(count);
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < count; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes;
  }

  function base64url(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function randomToken(count) {
    return base64url(randomBytes(count || 32));
  }

  function codeChallenge(verifier) {
    if (!window.crypto || !window.crypto.subtle || typeof window.TextEncoder !== "function") {
      throw new Error("Google Health PKCE requires a secure HTTPS or localhost origin. Open this page from GitHub Pages or http://localhost:8080.");
    }
    const data = new window.TextEncoder().encode(verifier);
    return window.crypto.subtle.digest("SHA-256", data).then((buffer) => base64url(new Uint8Array(buffer)));
  }

  function scopeGranted(scope) {
    if (!granted.length) return false;
    return granted.some((value) => value.toLowerCase() === scope.toLowerCase());
  }

  function canRead(scope) {
    return !scopeKnown || scopeGranted(scope);
  }

  function startOAuth(action) {
    const id = clientId();
    if (!id) {
      handleError("GOOGLE HEALTH SETUP REQUIRED", new Error("Add healthClientId to firebase-config.js before connecting Google Health."), true);
      return Promise.resolve();
    }

    const verifier = randomToken(32);
    const state = randomToken(24);
    const redirect = redirectUri();

    return codeChallenge(verifier)
      .then((challenge) => {
        setStored(OAUTH.verifier, verifier);
        setStored(OAUTH.state, state);
        setStored(OAUTH.action, action || "connect");
        setStored(OAUTH.redirect, redirect);

        const params = new URLSearchParams({
          client_id: id,
          redirect_uri: redirect,
          response_type: "code",
          scope: SCOPES.join(" "),
          state,
          code_challenge: challenge,
          code_challenge_method: "S256",
          access_type: "online",
          include_granted_scopes: "true",
          prompt: "consent"
        });
        status.message = "Waiting for Google authorization";
        emit();
        location.assign(AUTH_URL + "?" + params.toString());
      })
      .catch((err) => handleError("GOOGLE HEALTH AUTHORIZATION FAILED", err, true));
  }

  function callbackParams() {
    const url = new URL(location.href);
    const expected = getStored(OAUTH.state);
    if (!expected) return null;
    if (!url.searchParams.has("code") && !url.searchParams.has("state") && !url.searchParams.has("error")) return null;
    return {
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
      error: url.searchParams.get("error"),
      description: url.searchParams.get("error_description") || "",
      expected
    };
  }

  function cleanCallbackUrl() {
    try {
      const url = new URL(location.href);
      ["code", "state", "error", "error_description", "scope"].forEach((name) => url.searchParams.delete(name));
      history.replaceState(null, "", url.pathname + (url.search ? url.search : "") + url.hash);
    } catch (err) { /* file protocol or restricted history */ }
  }

  function exchangeCode(code, verifier, redirect) {
    const body = new URLSearchParams({
      code,
      client_id: clientId(),
      redirect_uri: redirect,
      grant_type: "authorization_code",
      code_verifier: verifier
    });
    return fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", Accept: "application/json" },
      body: body.toString()
    }).then((response) => {
      if (!response.ok) {
        return response.json().catch(() => null).then((payload) => {
          const detail = payload && (payload.error_description || payload.error) || "Google token exchange failed.";
          const error = new Error("Google Health " + response.status + ": " + detail);
          error.status = response.status;
          throw error;
        });
      }
      return response.json();
    });
  }

  function applyToken(response) {
    if (!response || !response.access_token) throw new Error("Google did not return an access token.");
    token = response.access_token;
    const seconds = Math.max(60, Number(response.expires_in) || 3600);
    expiresAt = Date.now() + seconds * 1000 - 60000;
    if (response.scope === undefined || response.scope === null) {
      scopeKnown = false;
      granted = [];
    } else {
      scopeKnown = true;
      granted = String(response.scope).split(/\s+/).filter(Boolean);
    }
    status.apiPartial = false;
    status.authorized = true;
    status.checkedAt = Date.now();
    status.message = !scopeKnown ? "Google Health connected · granted scopes not reported"
      : granted.length ? "Google Health connected" : "Google Health connected with no read scopes";
    if (ctx) {
      const saved = health(ctx.getState());
      saved.lastError = null;
      saved.scopes = granted.slice();
      ctx.persist();
    }
  }

  function handleOAuthCallback() {
    const params = callbackParams();
    if (!params) return Promise.resolve();
    cleanCallbackUrl();

    if (!params.state || params.state !== params.expected) {
      clearOAuthState();
      handleError("GOOGLE HEALTH CONNECT FAILED", new Error("The Google authorization state did not match. Restart the connection and do not reload during it."), true);
      return Promise.resolve();
    }
    if (params.error) {
      clearOAuthState();
      const detail = params.description || params.error;
      handleError("GOOGLE HEALTH CONNECT FAILED", new Error("Google authorization was not granted: " + detail), true);
      return Promise.resolve();
    }
    if (!params.code) {
      clearOAuthState();
      handleError("GOOGLE HEALTH CONNECT FAILED", new Error("Google returned an incomplete authorization response."), true);
      return Promise.resolve();
    }

    const verifier = getStored(OAUTH.verifier);
    const redirect = getStored(OAUTH.redirect) || redirectUri();
    const action = getStored(OAUTH.action) || "connect";
    if (!verifier) {
      clearOAuthState();
      handleError("GOOGLE HEALTH CONNECT FAILED", new Error("The PKCE verifier was missing. Restart the connection."), true);
      return Promise.resolve();
    }

    status.message = "Finishing Google Health authorization";
    emit();

    return exchangeCode(params.code, verifier, redirect)
      .then((response) => {
        clearOAuthState();
        applyToken(response);
        emit();
        if (action === "sync") {
          sync();
        } else {
          UI.toast("success", "GOOGLE HEALTH CONNECTED", "Google Health is authorized. Press SYNC GOOGLE HEALTH to pull your data.");
        }
      })
      .catch((err) => {
        clearOAuthState();
        handleError("GOOGLE HEALTH CONNECT FAILED", err, true);
      });
  }

  function hasValidToken() {
    if (token && Date.now() < expiresAt) return true;
    token = "";
    expiresAt = 0;
    granted = [];
    scopeKnown = true;
    status.apiPartial = false;
    status.authorized = false;
    return false;
  }

  /* ---------------------------------------------------------
     Health REST wrapper
     --------------------------------------------------------- */
  function api(path, options) {
    if (!hasValidToken()) {
      throw new Error("Google Health authorization is required. Press SYNC GOOGLE HEALTH to authorize again.");
    }
    const opts = options || {};
    const init = {
      method: opts.method || "GET",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/json"
      }
    };
    if (opts.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    }

    return fetch(API + path, init).then((response) => {
      if (!response.ok) {
        return response.json().catch(() => null).then((payload) => {
          const detail = payload && payload.error && (payload.error.message || payload.error.status) || payload && payload.message || "";
          const error = new Error("Google Health " + response.status + (detail ? ": " + detail : ""));
          error.status = response.status;
          if (response.status === 401) {
            token = "";
            expiresAt = 0;
            granted = [];
            scopeKnown = true;
            status.apiPartial = false;
            status.authorized = false;
          }
          throw error;
        });
      }
      return response.json();
    });
  }

  function dailyRollUp(type, range, pageSize) {
    const base = { range, windowSizeDays: 1, pageSize };
    const collected = [];
    let pageToken = "";
    let pages = 0;

    function next() {
      const body = Object.assign({}, base);
      if (pageToken) body.pageToken = pageToken;
      return api("/users/me/dataTypes/" + encodeURIComponent(type) + "/dataPoints:dailyRollUp", { method: "POST", body })
        .then((response) => {
          collected.push.apply(collected, (response && response.rollupDataPoints) || []);
          pageToken = response && response.nextPageToken || "";
          pages++;
          if (!pageToken || pages >= 8) return collected;
          return next();
        });
    }
    return next();
  }

  function dailyRollUpWindow(type, days, maxDays, pageSize) {
    return Promise.all(chunkRanges(days, maxDays).map((range) => dailyRollUp(type, range, pageSize)))
      .then((results) => results.reduce((all, rows) => all.concat(rows), []));
  }

  function queryDataPoints(type, pageSize, maxPages, method, filter) {
    const collected = [];
    const verb = method === "reconcile" ? ":reconcile" : "";
    let pageToken = "";
    let pages = 0;

    function next() {
      const params = new URLSearchParams({ pageSize: String(pageSize) });
      if (filter) params.set("filter", filter);
      if (pageToken) params.set("pageToken", pageToken);
      return api("/users/me/dataTypes/" + encodeURIComponent(type) + "/dataPoints" + verb + "?" + params.toString())
        .then((response) => {
          collected.push.apply(collected, (response && response.dataPoints) || []);
          pageToken = response && response.nextPageToken || "";
          pages++;
          if (!pageToken || pages >= (maxPages || 4)) return collected;
          return next();
        });
    }
    return next();
  }

  function attempt(label, fn) {
    return Promise.resolve()
      .then(fn)
      .then((value) => ({ label, value, error: null }))
      .catch((error) => ({ label, value: null, error }));
  }

  /* ---------------------------------------------------------
     Snapshot builder
     --------------------------------------------------------- */
  async function loadSnapshot() {
    if (!clientId()) throw new Error("Add healthClientId to firebase-config.js before connecting Google Health.");
    if (!hasValidToken()) throw new Error("Google Health authorization is required. Press SYNC GOOGLE HEALTH to authorize again.");
    if (scopeKnown && !granted.length) throw new Error("No Google Health read scopes were granted. Reconnect and allow at least Activity & Fitness, Sleep, or Health Metrics.");

    const startKey = D.keyAdd(D.todayKey(), -(WINDOW_DAYS - 1));
    const endKey = D.todayKey();
    const inWindow = (key) => !!key && key >= startKey && key <= endKey;
    const jobs = [];

    if (canRead(ACTIVITY_SCOPE)) {
      jobs.push(
        attempt("steps", () => dailyRollUpWindow("steps", WINDOW_DAYS, WINDOW_DAYS, 90)),
        attempt("activeEnergy", () => dailyRollUpWindow("active-energy-burned", WINDOW_DAYS, WINDOW_DAYS, 90)),
        attempt("totalCalories", () => dailyRollUpWindow("total-calories", WINDOW_DAYS, SHORT_WINDOW_DAYS, 14)),
        attempt("activeMinutes", () => dailyRollUpWindow("active-minutes", WINDOW_DAYS, SHORT_WINDOW_DAYS, 14)),
        attempt("heartRate", () => dailyRollUpWindow("heart-rate", WINDOW_DAYS, SHORT_WINDOW_DAYS, 14)),
        attempt("exercises", () => queryDataPoints(
          "exercise", 25, 40, "", sessionFilter("exercise", "civil_start_time", startKey, endKey)
        ))
      );
    }
    if (canRead(METRICS_SCOPE)) {
      jobs.push(
        attempt("hrv", () => queryDataPoints("daily-heart-rate-variability", 1000, 4)),
        attempt("rhr", () => queryDataPoints("daily-resting-heart-rate", 1000, 4)),
        attempt("respiratory", () => queryDataPoints("daily-respiratory-rate", 1000, 4)),
        attempt("vo2max", () => queryDataPoints("daily-vo2-max", 1000, 4)),
        attempt("temperature", () => dailyRollUpWindow("core-body-temperature", WINDOW_DAYS, WINDOW_DAYS, 90))
      );
    }
    if (canRead(SLEEP_SCOPE)) {
      jobs.push(attempt("sleep", () => queryDataPoints(
        "sleep", 25, 40, "reconcile", sessionFilter("sleep", "civil_end_time", startKey, endKey)
      )));
    }
    jobs.push(attempt("identity", () => api("/users/me/identity")));

    const results = await Promise.all(jobs);
    const data = {};
    const errors = [];
    results.forEach((result) => {
      data[result.label] = result.value;
      if (result.error) errors.push(result.error);
    });
    status.apiPartial = errors.length > 0;

    const hasData = results.some((result) => {
      if (result.label === "identity") return false;
      return Array.isArray(result.value) && result.value.length > 0;
    });
    if (!hasData && errors.length) {
      const authError = errors.find((e) => e.status === 401 || e.status === 403) || errors[0];
      throw authError;
    }

    const days = {};
    const metricNames = new Set();
    let records = 0;

    function put(key, name, value, digits) {
      const cleanKey = String(key || "").slice(0, 10);
      if (!inWindow(cleanKey) || !(value > 0)) return;
      if (!days[cleanKey]) days[cleanKey] = {};
      days[cleanKey][name] = round((days[cleanKey][name] || 0) + value, digits === undefined ? 0 : digits);
      metricNames.add(name);
    }

    function rollupKey(point) {
      return civilKey(point && point.civilStartTime);
    }

    const totalCalories = {};
    const activeEnergy = {};

    (data.steps || []).forEach((point) => {
      const key = rollupKey(point);
      const value = number(point.steps && point.steps.countSum);
      put(key, "steps", value);
      if (value > 0) records++;
    });
    (data.activeEnergy || []).forEach((point) => {
      const key = rollupKey(point);
      const value = number(point.activeEnergyBurned && point.activeEnergyBurned.kcalSum);
      put(key, "activeEnergy", value);
      if (value > 0) {
        activeEnergy[key] = (activeEnergy[key] || 0) + value;
        records++;
      }
    });
    (data.totalCalories || []).forEach((point) => {
      const key = rollupKey(point);
      const value = number(point.totalCalories && point.totalCalories.kcalSum);
      if (value > 0) {
        totalCalories[key] = (totalCalories[key] || 0) + value;
        records++;
      }
    });
    Object.keys(totalCalories).forEach((key) => {
      const basal = totalCalories[key] - (activeEnergy[key] || 0);
      if (basal > 0) put(key, "basalEnergy", basal);
    });

    (data.activeMinutes || []).forEach((point) => {
      const rows = (point.activeMinutes && point.activeMinutes.activeMinutesRollupByActivityLevel) || [];
      const total = rows.reduce((sum, row) => sum + number(row && row.activeMinutesSum), 0);
      put(rollupKey(point), "exerciseMinutes", total);
      if (total > 0) records++;
    });

    (data.heartRate || []).forEach((point) => {
      const hr = point.heartRate || {};
      const key = rollupKey(point);
      put(key, "hrAvg", number(hr.beatsPerMinuteAvg));
      put(key, "hrMax", number(hr.beatsPerMinuteMax));
      put(key, "hrMin", number(hr.beatsPerMinuteMin));
      if (number(hr.beatsPerMinuteAvg) > 0) records++;
    });

    (data.temperature || []).forEach((point) => {
      const temp = point.coreBodyTemperature || {};
      put(rollupKey(point), "wristTemp", number(temp.temperatureCelsiusAvg), 2);
      if (number(temp.temperatureCelsiusAvg) > 0) records++;
    });

    const dailyPoints = [
      { rows: data.hrv, field: "dailyHeartRateVariability", metric: "hrv", pick: (p) => p.averageHeartRateVariabilityMilliseconds, digits: 0 },
      { rows: data.rhr, field: "dailyRestingHeartRate", metric: "rhr", pick: (p) => p.beatsPerMinute, digits: 0 },
      { rows: data.respiratory, field: "dailyRespiratoryRate", metric: "respiratory", pick: (p) => p.breathsPerMinute, digits: 2 },
      { rows: data.vo2max, field: "dailyVo2Max", metric: "vo2max", pick: (p) => p.vo2Max, digits: 2 }
    ];
    dailyPoints.forEach((cfg) => {
      (cfg.rows || []).forEach((point) => {
        const value = point && point[cfg.field];
        const key = value && value.date ? civilKey({ date: value.date }) : "";
        put(key, cfg.metric, number(cfg.pick(value)), cfg.digits);
        if (number(cfg.pick(value)) > 0) records++;
      });
    });

    (data.sleep || []).forEach((point) => {
      const sleep = point && point.sleep;
      if (!sleep) return;
      const interval = sleep.interval || {};
      const key = civilKey(interval.civilEndTime) || dayKey(interval.endTime);
      const summary = sleep.summary || {};
      const stages = summary.stagesSummary || [];
      const stageMinutes = (type) => stages.reduce((sum, row) => {
        return sum + (String(row && row.type || "").toUpperCase() === type ? number(row.minutes) : 0);
      }, 0);
      const asleep = number(summary.minutesAsleep);
      const deep = stageMinutes("DEEP");
      const rem = stageMinutes("REM");
      const light = stageMinutes("LIGHT") || Math.max(0, asleep - deep - rem);
      put(key, "sleepHours", asleep / 60, 2);
      put(key, "deepHours", deep / 60, 2);
      put(key, "remHours", rem / 60, 2);
      put(key, "coreHours", light / 60, 2);
      put(key, "awakeHours", number(summary.minutesAwake) / 60, 2);
      if (asleep > 0) records++;
    });

    const workouts = [];
    (data.exercises || []).forEach((point) => {
      const exercise = point && point.exercise;
      if (!exercise) return;
      const interval = exercise.interval || {};
      const start = interval.startTime || "";
      const end = interval.endTime || "";
      const windowKey = civilKey(interval.civilStartTime) || dayKey(start) || dayKey(end);
      if (!inWindow(windowKey)) return;
      const measured = durationSeconds(exercise.activeDuration) / 60;
      const fallback = start && end ? (new Date(end).getTime() - new Date(start).getTime()) / 60000 : 0;
      const duration = measured > 0 ? measured : fallback;
      if (!(duration >= 1)) return;
      const metrics = exercise.metricsSummary || {};
      workouts.push({
        rawName: String(exercise.displayName || exercise.exerciseType || "Workout"),
        start: start ? new Date(start).toISOString() : "",
        end: end ? new Date(end).toISOString() : null,
        duration: round(duration, 1),
        energy: Math.round(number(metrics.caloriesKcal)),
        source: "Google Health"
      });
      records++;
    });
    if (workouts.length) metricNames.add("workouts");

    if (!Object.keys(days).length && !workouts.length) {
      UI.toast("warn", "NO GOOGLE HEALTH DATA", "Google Health returned no records for the last 40 days.");
    }

    status.partial = !scopeKnown || missingScopes().length > 0 || errors.length > 0;
    return {
      source: "Google Health",
      filename: "google-health-live",
      records,
      metrics: Array.from(metricNames),
      days,
      workouts
    };
  }

  /* ---------------------------------------------------------
     public actions
     --------------------------------------------------------- */
  function markSynced(email) {
    if (!ctx) return;
    const saved = health(ctx.getState());
    saved.lastSyncAt = new Date().toISOString();
    if (email) saved.email = email;
    saved.lastError = null;
    saved.scopes = granted.slice();
    ctx.persist();
    status.message = status.partial ? "Google Health synced · partial data" : "Google Health synced";
    emit();
  }

  function connect() {
    status.configured = !!clientId();
    status.ready = status.configured;
    if (!status.configured) {
      handleError("GOOGLE HEALTH SETUP REQUIRED", new Error("Add healthClientId to firebase-config.js and enable the Google Health API for that OAuth client."), true);
      return;
    }
    if (hasValidToken()) {
      UI.toast("success", "GOOGLE HEALTH CONNECTED", "Google Health is authorized. Press SYNC GOOGLE HEALTH to pull your data.");
      return;
    }
    startOAuth("connect").catch((err) => handleError("GOOGLE HEALTH CONNECT FAILED", err, true));
  }

  async function sync() {
    if (status.syncing) {
      UI.toast("warn", "SYNC IN PROGRESS", "Wait for the current Google Health sync to finish.");
      return;
    }
    status.apiPartial = false;
    status.configured = !!clientId();
    status.ready = status.configured;
    if (!status.configured) {
      handleError("GOOGLE HEALTH SETUP REQUIRED", new Error("Add healthClientId to firebase-config.js and enable the Google Health API for that OAuth client."), true);
      return;
    }
    if (!hasValidToken()) {
      startOAuth("sync").catch((err) => handleError("GOOGLE HEALTH CONNECT FAILED", err, true));
      return;
    }

    status.syncing = true;
    status.message = "Reading Google Health data";
    emit();
    try {
      const snapshot = await loadSnapshot();
      const applied = ctx && typeof ctx.applySnapshot === "function"
        ? ctx.applySnapshot(snapshot)
        : false;
      status.message = applied
        ? (status.partial ? "Google Health synced · partial data" : "Google Health synced")
        : "Review the replacement prompt to finish syncing";
    } catch (err) {
      handleError("GOOGLE HEALTH SYNC FAILED", err, true);
    } finally {
      status.syncing = false;
      emit();
    }
  }

  function disconnect() {
    UI.openModal({
      title: "Disconnect Google Health?",
      body: "<p>Local ARISE data stays on this device. This browser's Google Health access is revoked; you can reconnect at any time.</p>",
      actions: [
        { label: "CANCEL" },
        {
          label: "DISCONNECT",
          kind: "danger",
          onClick: () => {
            const access = token;
            if (access) {
              const body = new URLSearchParams({ token: access });
              fetch(REVOKE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
                body: body.toString()
              }).catch(() => { /* revocation is best-effort */ });
            }
            token = "";
            expiresAt = 0;
            granted = [];
            scopeKnown = true;
            status.authorized = false;
            status.partial = false;
            status.apiPartial = false;
            status.message = "Google Health disconnected";
            clearOAuthState();
            if (ctx) {
              const saved = health(ctx.getState());
              saved.lastSyncAt = null;
              saved.email = null;
              saved.lastError = null;
              saved.scopes = [];
              ctx.persist();
            }
            emit();
            UI.toast("warn", "GOOGLE HEALTH DISCONNECTED", "Local data was kept. Reconnect when you want another sync.");
          }
        }
      ]
    });
  }

  function render() {
    if (!ctx) return;
    const state = ctx.getState();
    const saved = health(state);
    const current = publicStatus();
    const statusEl = $("#healthStatusText");
    const chip = $("#healthChip");
    const chipText = $("#healthChipText");
    const account = $("#healthAccountText");
    const last = $("#healthLastSyncText");
    const note = $("#healthNote");
    const connectBtn = $("#healthConnectBtn");
    const syncBtn = $("#healthSyncBtn");
    const disconnectBtn = $("#healthDisconnectBtn");

    let label = "READY";
    let detail = "Authorize Google Health, then sync the last 40 days of available data.";
    if (!current.configured) {
      label = "SETUP REQUIRED";
      detail = "Add healthClientId to firebase-config.js and enable the Google Health API for that OAuth client.";
    } else if (current.syncing) {
      label = "SYNCING";
      detail = "Reading Google Health rollups, daily summaries, sleep and workouts…";
    } else if (current.lastError) {
      label = "SYNC ERROR";
      detail = current.lastError;
    } else if (current.authorized && current.partial) {
      const reasons = [];
      if (current.scopeUnknown) reasons.push("Google did not report the granted scopes");
      if (current.missingScopes.length) {
        reasons.push("Missing: " + current.missingScopes.map((scope) => SCOPE_LABELS[scope] || scope).join(", "));
      }
      if (current.apiPartial) reasons.push("Some Google Health endpoints returned errors");
      label = "PARTIAL LINK";
      detail = (reasons.length ? reasons.join(". ") + ". " : "") + "Unavailable metrics stay blank.";
    } else if (current.authorized) {
      label = "CONNECTED";
      detail = "Google Health is authorized. Press SYNC GOOGLE HEALTH to refresh your archive.";
    } else if (saved.lastSyncAt) {
      label = "LINKED";
      detail = "Authorization is session-only. Press SYNC GOOGLE HEALTH to authorize and refresh.";
    }

    if (statusEl) statusEl.textContent = label;
    if (chipText) {
      chipText.textContent = current.syncing ? "SYNCING"
        : current.authorized && current.partial ? "PARTIAL HEALTH LINK"
        : current.authorized ? "GOOGLE HEALTH LIVE"
        : saved.lastSyncAt ? "GOOGLE HEALTH LINKED"
        : "AWAITING SYNC";
    }
    if (chip) {
      chip.classList.toggle("is-live", !!current.authorized || !!saved.lastSyncAt);
      chip.classList.toggle("is-due", !!current.lastError);
    }
    if (account) account.textContent = saved.email || (current.authorized ? "GOOGLE ACCOUNT" : "NOT LINKED");
    if (last) last.textContent = D.fmtDateTime(saved.lastSyncAt ? new Date(saved.lastSyncAt).toISOString() : null);
    if (note) note.textContent = detail;
    if (connectBtn) connectBtn.disabled = !current.configured || current.authorized;
    if (syncBtn) syncBtn.disabled = !current.configured || current.syncing;
    if (disconnectBtn) disconnectBtn.hidden = !saved.lastSyncAt && !current.authorized;
  }

  function bindStatic() {
    const map = {
      "#healthConnectBtn": connect,
      "#healthSyncBtn": () => { sync(); },
      "#healthDisconnectBtn": disconnect
    };
    Object.keys(map).forEach((selector) => {
      const el = $(selector);
      if (el) el.addEventListener("click", map[selector]);
    });
  }

  function mount(options) {
    ctx = options || {};
    status.configured = !!clientId();
    status.ready = status.configured;
    bindStatic();
    render();
    handleOAuthCallback().catch((err) => handleError("GOOGLE HEALTH CONNECT FAILED", err, true));
  }

  window.SystemHealth = {
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
