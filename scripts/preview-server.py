#!/usr/bin/env python3
"""Serve renderer/ for the _*.html harnesses, with caching switched off.

python3 -m http.server sends Last-Modified and honours conditional requests,
so a browser keeps serving pixel.js / species.js out of its own cache. That
has now cost two rounds of "I changed it and the page is identical" — once
on the trick CSS, once on the back-of-the-head sprite, where the page ran a
stale species.js and silently fell back to the front-facing art.

Serves the REPO ROOT, not renderer/, so a harness can reach care.js and
missions.js with ../ — the growth-stage page lifts the title ladder out of
care.js rather than keeping its own copy of it. Pages therefore live at
/renderer/_name.html.

    python3 scripts/preview-server.py [port]
"""
import sys
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def send_header(self, key, value):
        # drop the validators that let a browser ask "still the same?"
        if key.lower() in ('last-modified', 'etag'):
            return
        super().send_header(key, value)

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8731
    handler = functools.partial(NoCache, directory='.')
    print('repo root on http://127.0.0.1:%d/renderer/  (no cache)' % port)
    ThreadingHTTPServer(('127.0.0.1', port), handler).serve_forever()
