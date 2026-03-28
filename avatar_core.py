import http.server
import socketserver
import webbrowser
import os

# Port and directory config
PORT = 8000
WEB_DIR = os.path.join(os.path.dirname(__file__), 'static')

# Switch to static folder
os.chdir(WEB_DIR)
Handler = http.server.SimpleHTTPRequestHandler

# Start local neural server
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print("\n[INIT] Booting A.V.A.T.A.R Core System...")
    print(f"[ONLINE] Neural Engine active on port {PORT}\n")
    webbrowser.open_new(f"http://localhost:{PORT}")
    httpd.serve_forever()