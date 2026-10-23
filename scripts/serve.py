# Static server for local play. Same as `python3 -m http.server`, but tells the browser never to reuse old files,
# so a refresh always loads the current ES modules together (a stale ui.js beside a new main.js breaks the page).
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ThreadingHTTPServer(('127.0.0.1', port), partial(NoCache, directory='.')).serve_forever()
