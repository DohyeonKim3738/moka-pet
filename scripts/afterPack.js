'use strict';

/* ------------------------------------------------------------------
 * afterPack — give the macOS bundle a valid ad-hoc signature.
 *
 * Without an Apple certificate the app cannot be trusted by Gatekeeper,
 * but it can at least be *coherently* signed. electron-builder leaves it
 * linker-signed only, and `codesign --verify --deep` then fails with
 * "code has no resources but signature indicates they must be present" —
 * a bundle macOS treats as damaged rather than merely unknown.
 *
 * Re-signing the whole bundle ad-hoc fixes that. The app is still
 * unidentified, so it still needs its quarantine flag cleared on first
 * run, but it is no longer broken.
 * ------------------------------------------------------------------ */

const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename + '.app';
  const appPath = path.join(context.appOutDir, appName);

  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
      stdio: 'pipe'
    });
    execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], {
      stdio: 'pipe'
    });
    console.log('  • ad-hoc signed   ' + appName);
  } catch (e) {
    // Not fatal: an unsigned build still runs once quarantine is cleared.
    console.log('  • ad-hoc signing skipped: ' + (e.message || e));
  }
};
