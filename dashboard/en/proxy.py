"""Serve dashboard + proxy n8n API to avoid CORS.

Usage: python proxy.py
Dashboard: http://localhost:8080
Proxies /api/* and /healthz to n8n at N8N_TARGET.
"""
import http.server
import urllib.request
import urllib.error
import os

N8N_TARGET = os.environ.get("N8N_TARGET", "http://localhost:5678")
PORT = int(os.environ.get("PORT", "8080"))


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/api/") or self.path == "/healthz":
            self.proxy()
        else:
            super().do_GET()

    def proxy(self):
        url = N8N_TARGET + self.path
        req = urllib.request.Request(url)
        api_key = self.headers.get("X-N8N-API-KEY")
        if api_key:
            req.add_header("X-N8N-API-KEY", api_key)
        try:
            with urllib.request.urlopen(req, timeout=15) as res:
                body = res.read()
                self.send_response(res.status)
                self.send_header("Content-Type", res.headers.get("Content-Type", "application/json"))
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(str(e).encode())


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f"Dashboard: http://localhost:{PORT}  (proxying n8n at {N8N_TARGET})")
    http.server.ThreadingHTTPServer(("", PORT), Handler).serve_forever()
