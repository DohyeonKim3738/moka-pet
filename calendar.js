'use strict';

/* ------------------------------------------------------------------ *
 * calendar.js — reads the next day of events and decides when the pet
 * should speak up.
 *
 * Polling and firing are deliberately separate clocks: events are
 * fetched every few minutes, but the check for "is anything due?" runs
 * every 30s off the cached list. That way a reminder lands on time
 * without hammering the API, and a network blip never skips one.
 *
 * Event titles stay in memory and go straight to the notification.
 * They are never written to a log or to disk.
 * ------------------------------------------------------------------ */

const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

const POLL_MS = 5 * 60 * 1000;
const TICK_MS = 30 * 1000;
const HORIZON_H = 36;

let deps = null;             // { getAccessToken, onSignedOut, onNotify, getSettings, getSeen, setSeen }
let pollTimer = null;
let tickTimer = null;
let events = [];
let lastError = '';
let lastSync = 0;

function start(d) {
  deps = d;
  stop();
  poll();
  pollTimer = setInterval(poll, POLL_MS);
  tickTimer = setInterval(tick, TICK_MS);
}

function stop() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  events = [];
}

function state() {
  return { count: events.length, lastSync, lastError };
}

/* ---------- fetching ---------- */

async function poll() {
  if (!deps) return;
  let token;
  try { token = await deps.getAccessToken(); }
  catch (e) { events = []; return; }               // not signed in yet

  const now = new Date();
  const max = new Date(now.getTime() + HORIZON_H * 3600 * 1000);
  const qs = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: max.toISOString(),
    singleEvents: 'true',                          // expand recurring series
    orderBy: 'startTime',
    maxResults: '50'
  });

  try {
    const res = await fetch(EVENTS_URL + '?' + qs.toString(), {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (res.status === 401 || res.status === 403) {
      // the grant is gone (revoked, or the client was changed)
      lastError = '권한이 만료됐습니다. 다시 로그인해 주세요.';
      events = [];
      deps.onSignedOut();
      return;
    }
    if (!res.ok) { lastError = 'HTTP ' + res.status; return; }

    const json = await res.json();
    events = (json.items || [])
      .filter((e) => e.status !== 'cancelled')
      .map((e) => ({
        id: e.id,
        title: (e.summary || '(제목 없음)').trim(),
        allDay: !!(e.start && e.start.date),
        start: (e.start && (e.start.dateTime || e.start.date)) || null,
        startMs: e.start && e.start.dateTime ? Date.parse(e.start.dateTime) : null
      }))
      .filter((e) => e.start);

    lastError = '';
    lastSync = Date.now();
  } catch (e) {
    lastError = '캘린더를 불러오지 못했습니다.';
  }
}

/* ---------- firing ---------- */

function localDayKey(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function hhmm(ms) {
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function tick() {
  if (!deps) return;
  const s = deps.getSettings();
  if (!s.enabled) return;

  const now = Date.now();
  const seen = deps.getSeen();
  const today = localDayKey(new Date(now));

  /* --- morning briefing --- */
  if (s.briefEnabled) {
    const [bh, bm] = String(s.briefAt || '09:00').split(':').map(Number);
    const briefAt = new Date(now);
    briefAt.setHours(bh || 0, bm || 0, 0, 0);
    const key = 'brief:' + today;
    // only inside the hour after the set time, so launching the app at
    // 6pm does not fire a stale morning briefing
    if (!seen[key] && now >= briefAt.getTime() && now - briefAt.getTime() < 3600 * 1000) {
      const todays = events.filter((e) => {
        const d = e.allDay ? new Date(e.start + 'T00:00:00') : new Date(e.startMs);
        return localDayKey(d) === today;
      });
      seen[key] = now;
      deps.setSeen(seen);
      if (todays.length) {
        const lines = todays.slice(0, 4).map((e) =>
          (e.allDay ? '종일' : hhmm(e.startMs)) + '  ' + e.title);
        if (todays.length > 4) lines.push('외 ' + (todays.length - 4) + '건');
        deps.onNotify({ kind: 'brief', head: '오늘 일정 ' + todays.length + '건', lines });
      } else {
        deps.onNotify({ kind: 'brief', head: '오늘은 일정이 없어요', lines: [] });
      }
    }
  }

  /* --- upcoming events --- */
  const lead = Math.max(1, Math.min(60, s.leadMinutes || 10)) * 60 * 1000;
  for (const e of events) {
    if (e.allDay || !e.startMs) continue;          // all-day belongs to the briefing
    const key = e.id + ':' + e.startMs;
    if (seen[key]) continue;
    const due = e.startMs - lead;
    // a window, not an instant: a missed tick must not swallow the reminder
    if (now >= due && now < e.startMs) {
      seen[key] = now;
      deps.setSeen(seen);
      const mins = Math.max(1, Math.round((e.startMs - now) / 60000));
      deps.onNotify({
        kind: 'event',
        head: mins + '분 뒤',
        lines: [e.title, hhmm(e.startMs) + ' 시작']
      });
    }
  }
}

/* keys older than two days are dead weight */
function prune(seen) {
  const cutoff = Date.now() - 2 * 24 * 3600 * 1000;
  const out = {};
  for (const k of Object.keys(seen || {})) if (seen[k] > cutoff) out[k] = seen[k];
  return out;
}

module.exports = { start, stop, state, prune, poll };
