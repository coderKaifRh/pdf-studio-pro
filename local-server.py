import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 3000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class PDFStudioHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def guess_type(self, path):
        # Ensure correct MIME type for modern ES modules (.mjs)
        if path.endswith('.mjs'):
            return 'application/javascript'
        if path.endswith('.js'):
            return 'application/javascript'
        if path.endswith('.css'):
            return 'text/css'
        if path.endswith('.pdf'):
            return 'application/pdf'
        return super().guess_type(path)

    def end_headers(self):
        # Allow range requests & CORS
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

def run_server():
    os.chdir(DIRECTORY)
    # Allow port reuse
    socketserver.TCPServer.allow_reuse_address = True
    
    port = PORT
    for attempt in range(5):
        try:
            with socketserver.TCPServer(("", port), PDFStudioHandler) as httpd:
                url = f"http://localhost:{port}/index.html"
                print("=" * 60)
                print("  PDF Studio Pro is running!")
                print(f"  URL: {url}")
                print("  Press Ctrl+C to stop the server.")
                print("=" * 60)
                webbrowser.open(url)
                httpd.serve_forever()
                break
        except OSError:
            port += 1

if __name__ == '__main__':
    try:
        run_server()
    except KeyboardInterrupt:
        print("\nPDF Studio Pro server stopped.")
        sys.exit(0)
