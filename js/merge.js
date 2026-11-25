/* =========================================================
   ARISE // Cloud Link merge engine
   ---------------------------------------------------------
   Merges two whole-state snapshots section by section so
   independent edits on different devices survive. Cloud
   metadata and device identity are never merged.
   ========================================================= */
(function () {
  "use strict";

  const D = window.SystemData;

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value === undefined ? null : value));
  }

  function sectionTime(state, name) {
    return num(state && state.sync && state.sync.sections ? state.sync.sections[name] : 0);
  }

  function newSectionTimes(local, remote) {
    const merged = Object.assign({}, local.sync.sections || {}, remote.sync.sections || {});
    ["settings", "health", "claimed", "training", "body", "strength", "logs"].forEach((key) => {
      merged[key] = Math.max(sectionTime(local, key), sectionTime(remote, key));
    });
    return merged;
  }

  function mergeDeleted(localDeleted, remoteDeleted) {
    const out = {};
    ["trainingLogs", "bodyEntries", "strengthEntries"].forEach((bucket) => {
      const a = (localDeleted && localDeleted[bucket]) || {};
      const b = (remoteDeleted && remoteDeleted[bucket]) || {};
      const ids = Array.from(new Set(Object.keys(a).concat(Object.keys(b))));
      out[bucket] = {};
      ids.forEach((id) => { out[bucket][id] = Math.max(num(a[id]), num(b[id])); });
    });
    return out;
  }

  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
    const keys = Object.keys(value).sort();
    return "{" + keys.map((key) => JSON.stringify(key) + ":" + stableStringify(value[key])).join(",") + "}";
  }

  function signature(state) {
    const s = D.normalizeState(state);
    const training = s.training || {};
    const body = s.body || {};
    const strength = s.strength || {};
    const health = s.health || {};
    const pick = {
      version: s.version,
      hunter: s.hunter,
      sound: !!s.sound,
      notifications: s.notifications !== false,
      bonusXp: num(s.bonusXp),
      goals: s.goals,
      days: s.days,
      workouts: s.workouts,
      imports: s.imports,
      claimed: s.claimed,
      lastSync: s.lastSync,
      lastImport: s.lastImport,
      logs: Array.isArray(s.logs) ? s.logs : [],
      training: {
        activeWeek: training.activeWeek,
        selectedDay: training.selectedDay,
        weeks: training.weeks || []
      },
      body: { entries: body.entries || [] },
      strength: { entries: strength.entries || [] },
      health: {
        lastSyncAt: num(health.lastSyncAt),
        autoSync: health.autoSync === true,
        scopes: health.scopes || [],
        email: health.email || null,
        lastError: health.lastError || null
      },
      deleted: s.deleted,
      sync: { sections: s.sync.sections || {} }
    };
    return "v1:" + stableStringify(pick);
  }

  function recordMap(list, idFn) {
    const map = new Map();
    (Array.isArray(list) ? list : []).forEach((raw) => {
      if (!raw || typeof raw !== "object") return;
      const id = String(idFn(raw) || "");
      if (!id) return;
      const item = clone(raw);
      item.id = id;
      item.updatedAt = num(item.updatedAt);
      item.updatedBy = String(item.updatedBy || "");
      map.set(id, item);
    });
    return map;
  }

  function newerRecord(a, b) {
    if (!a) return b;
    if (!b) return a;
    const atA = num(a.updatedAt);
    const atB = num(b.updatedAt);
    if (atB !== atA) return atB > atA ? b : a;
    return String(b.updatedBy || "") > String(a.updatedBy || "") ? b : a;
  }

  function mergeRecords(localList, remoteList, idFn, deleted) {
    const localMap = recordMap(localList, idFn);
    const remoteMap = recordMap(remoteList, idFn);
    const ids = Array.from(new Set(Array.from(localMap.keys()).concat(Array.from(remoteMap.keys()))));
    const out = [];

    ids.forEach((id) => {
      const localItem = localMap.get(id) || null;
      const remoteItem = remoteMap.get(id) || null;
      const removedAt = num(deleted[id]);
      const newestRecordAt = Math.max(num(localItem && localItem.updatedAt), num(remoteItem && remoteItem.updatedAt));

      // Only an explicit tombstone removes a record. A whole-snapshot upload
      // from another device is not proof that a missing record was deleted.
      if (removedAt && removedAt >= newestRecordAt) {
        deleted[id] = removedAt;
        return;
      }

      const winner = newerRecord(localItem, remoteItem);
      if (winner) out.push(winner);
    });

    return out;
  }

  function mergeLogs(localLogs, remoteLogs) {
    const seen = new Set();
    const merged = [];
    (Array.isArray(remoteLogs) ? remoteLogs : []).concat(Array.isArray(localLogs) ? localLogs : []).forEach((log) => {
      if (!log || typeof log !== "object") return;
      const key = log.id ? "id:" + log.id : "at:" + String(log.at || "") + ":" + String(log.msg || "");
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(clone(log));
    });
    merged.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
    return merged.slice(0, 36);
  }

  function merge(localRaw, remoteRaw) {
    const local = D.normalizeState(localRaw);
    const remote = D.normalizeState(remoteRaw);
    const out = D.normalizeState(local);
    const times = newSectionTimes(local, remote);
    out.sync = {
      deviceId: local.sync.deviceId,
      sections: times
    };
    out.deleted = mergeDeleted(local.deleted, remote.deleted);

    const settingsWinner = sectionTime(remote, "settings") > sectionTime(local, "settings") ? remote : local;
    out.hunter = clone(settingsWinner.hunter || local.hunter);
    out.sound = settingsWinner.sound !== false;
    out.notifications = settingsWinner.notifications !== false;
    out.goals = clone(settingsWinner.goals || local.goals);
    out.health.autoSync = settingsWinner.health.autoSync === true;
    out.health.scopes = Array.isArray(settingsWinner.health.scopes) ? clone(settingsWinner.health.scopes) : [];
    out.health.email = settingsWinner.health.email || null;
    out.health.lastError = settingsWinner.health.lastError || null;

    const remoteArchiveAt = Math.max(num(remote.health.lastSyncAt), num(remote.lastSync));
    const localArchiveAt = Math.max(num(local.health.lastSyncAt), num(local.lastSync));
    const archiveWinner = remoteArchiveAt > localArchiveAt ? remote : local;
    out.days = clone(archiveWinner.days);
    out.workouts = clone(archiveWinner.workouts);
    out.imports = clone(archiveWinner.imports);
    out.lastSync = archiveWinner.lastSync || null;
    out.lastImport = clone(archiveWinner.lastImport);
    out.health.lastSyncAt = archiveWinner.health.lastSyncAt || null;

    const claimed = {};
    Object.keys(local.claimed || {}).forEach((key) => { if (local.claimed[key]) claimed[key] = true; });
    Object.keys(remote.claimed || {}).forEach((key) => { if (remote.claimed[key]) claimed[key] = true; });
    out.claimed = claimed;
    let claimedXp = 0;
    Object.keys(claimed).forEach((key) => { claimedXp += D.questXp ? D.questXp(key) : 0; });
    out.bonusXp = Math.max(num(settingsWinner.bonusXp), num(local.bonusXp), num(remote.bonusXp), claimedXp);

    const trainingWinner = sectionTime(remote, "training") > sectionTime(local, "training") ? remote : local;
    const trainingBase = clone(trainingWinner.training) || clone(local.training) ||
      { activeWeek: 0, selectedDay: 0, progressExercise: "", weeks: [], logs: [] };
    if (!Array.isArray(trainingBase.weeks)) trainingBase.weeks = [];
    trainingBase.logs = mergeRecords(
      local.training && local.training.logs,
      remote.training && remote.training.logs,
      (item) => item.id,
      out.deleted.trainingLogs
    );
    out.training = trainingBase;

    const bodyWinner = sectionTime(remote, "body") > sectionTime(local, "body") ? remote : local;
    out.body.entries = mergeRecords(
      local.body.entries,
      remote.body.entries,
      (item) => item.id || item.date,
      out.deleted.bodyEntries
    );
    out.body.reminder = clone(bodyWinner.body.reminder || local.body.reminder || out.body.reminder);

    const strengthWinner = sectionTime(remote, "strength") > sectionTime(local, "strength") ? remote : local;
    out.strength.entries = mergeRecords(
      local.strength.entries,
      remote.strength.entries,
      (item) => item.id || String(item.month || "") + "|" + String(item.name || ""),
      out.deleted.strengthEntries
    );
    out.strength.viewMonth = strengthWinner.strength.viewMonth || local.strength.viewMonth || out.strength.viewMonth;
    out.strength.progressExercise = strengthWinner.strength.progressExercise || "";

    out.logs = mergeLogs(local.logs, remote.logs);
    out.cloud = clone(local.cloud);
    return { state: out, changed: signature(local) !== signature(out) };
  }

  window.SystemMerge = { merge, signature, stableStringify };
})();
