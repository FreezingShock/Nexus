# Static server for local play. Same as `python3 -m http.server`, but tells the browser never to reuse old files,
# so a refresh always loads the current ES modules together (a stale ui.js beside a new main.js breaks the page).
# Clear-Site-Data "cache" only drops cached files; localStorage (the town, settings, profile) is untouched.
import json
import sys
import time
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

    # A stand-in for the live site's feedback route (worker/index.js), so the feedback box can be tried on localhost.
    # Notes go to feedback-local.jsonl next to index.html (git ignores it); nothing leaves the computer.
    def do_POST(self):
        if self.path.split('?')[0] != '/api/feedback':
            self.send_error(404)
            return
        try:
            size = int(self.headers.get('Content-Length') or 0)
            note = json.loads(self.rfile.read(min(size, 8192)) or b'{}')
            message = str(note.get('message', '')).strip()[:1000]
            if not message:
                raise ValueError('empty')
            row = {'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'kind': note.get('kind'), 'name': note.get('name'),
                   'message': message, 'version': note.get('version')}
            if not note.get('website'):
                with open('feedback-local.jsonl', 'a', encoding='utf-8') as f:
                    f.write(json.dumps(row, ensure_ascii=False) + '\n')
            body, code = b'{"ok":true}', 200
        except Exception:
            body, code = b'{"ok":false}', 400
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ThreadingHTTPServer(('127.0.0.1', port), partial(NoCache, directory='.')).serve_forever()
