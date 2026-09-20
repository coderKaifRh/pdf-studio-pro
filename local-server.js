const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const BASE_DIR = __dirname;

function getNetworkIp() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        // Exclude virtual / host-only networks like VirtualBox (192.168.56.x)
        if (net.address.startsWith('192.168.56.')) continue;
        if (/wi-fi|wlan|wireless/i.test(name)) {
          return net.address; // Direct hit on Wi-Fi
        }
        candidates.push(net.address);
      }
    }
  }
  return candidates[0] || 'localhost';
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  let safePath = req.url.split('?')[0];
  if (safePath === '/' || safePath === '') {
    safePath = '/index.html';
  }

  const filePath = path.join(BASE_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const localUrl = `http://localhost:${PORT}/index.html`;
  const networkIp = getNetworkIp();
  const networkUrl = `http://${networkIp}:${PORT}/index.html`;

  console.log('='.repeat(60));
  console.log('  PDF Studio Pro is running!');
  console.log(`  > Local:   ${localUrl}`);
  console.log(`  > Network: ${networkUrl}  (Open this on your mobile phone)`);
  console.log('  Press Ctrl+C to stop the server.');
  console.log('='.repeat(60));

  // Open browser on Windows
  exec(`start ${localUrl}`);
});
