import http.server
import os
import sys

log = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'server.log')
os.chdir(sys.argv[1])


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Content-Security-Policy', "default-src 'self'")
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, form, *args):
        with open(log, 'a') as out:
            out.write(form % args + '\n')


http.server.ThreadingHTTPServer(('127.0.0.1', 50777), Handler).serve_forever()
