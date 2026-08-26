'use strict';

/* ------------------------------------------------------------------
 * updater.js — is there a newer version?
 *
 * Not an auto-updater. These builds are unsigned, and an unsigned macOS
 * app cannot replace itself: Squirrel.Mac refuses, and pretending
 * otherwise would leave people on an old build believing they were
 * current. So this checks GitHub Releases, says so, and sends you to the
 * page. Downloading and dragging is two clicks, and it always works.
 *
 * The check is a plain public API call — no token, no telemetry, and it
 * sends nothing but the request itself.
 * ------------------------------------------------------------------ */

const API = 'https://api.github.com/repos/';

/* "v1.20.1" / "1.20.1-beta" -> [1, 20, 1] */
function parts(v) {
  return String(v || '').replace(/^v/i, '').split('-')[0].split('.')
    .map((n) => parseInt(n, 10) || 0);
}

function isNewer(remote, local) {
  const a = parts(remote), b = parts(local);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

/* Returns { version, url, notes } when something newer exists, else null.
   Never throws: no network, a rate limit or a repo that does not exist
   yet all mean "nothing to report". */
async function check(repo, current) {
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  let json;
  try {
    const res = await fetch(API + repo + '/releases/latest', {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'moka-pet' }
    });
    if (!res.ok) return null;
    json = await res.json();
  } catch (e) {
    return null;
  }
  if (!json || json.draft || json.prerelease) return null;
  const version = String(json.tag_name || json.name || '').replace(/^v/i, '');
  if (!version || !isNewer(version, current)) return null;
  return {
    version,
    url: json.html_url || ('https://github.com/' + repo + '/releases/latest'),
    notes: String(json.body || '').split('\n').slice(0, 3).join(' ').trim()
  };
}

module.exports = { check, isNewer, parts };
