# Static server for local play. Same as `python3 -m http.server`, but tells the browser never to reuse old files,
# so a refresh always loads the current ES modules together (a stale ui.js beside a new main.js breaks the page).
# Clear-Site-Data "cache" only drops cached files; localStorage (the town, settings, profile) is untouched.
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        # The page also wipes this origin's HTTP cache (never its saves): modules cached by an older server, or pulled in
        # by import() where a hard refresh does not reach, can never run beside a newer index.html.
        if self.path.split('?')[0] in ('/', '/index.html'):
            self.send_header('Clear-Site-Data', '"cache"')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ThreadingHTTPServer(('127.0.0.1', port), partial(NoCache, directory='.')).serve_forever()
