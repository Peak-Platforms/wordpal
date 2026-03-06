const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const ICECAST_HOST = '157.245.208.49';
const ICECAST_PORT = 8010;
const ICECAST_MOUNT = '/radio.mp3';
const ICECAST_PASS = 'rcnYnytt';

// MIME types for static files
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

// Create HTTP server for static files
const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  // Strip query strings
  filePath = filePath.split('?')[0];
  let fullPath = path.join(__dirname, filePath);
  // Try adding .html if no extension and file doesn't exist
  if (!path.extname(fullPath) && !require('fs').existsSync(fullPath)) {
    fullPath = fullPath + '.html';
  }
  const ext = path.extname(fullPath);

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

// WebSocket server for audio relay
const wss = new WebSocketServer({ server, path: '/broadcast' });

wss.on('connection', (ws) => {
  console.log('Leader connected — opening Icecast connection');

  const auth = Buffer.from(`source:${ICECAST_PASS}`).toString('base64');

  // Open persistent connection to Icecast
  const iceReq = http.request({
    hostname: ICECAST_HOST,
    port: ICECAST_PORT,
    path: ICECAST_MOUNT,
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'audio/webm;codecs=opus',
      'Transfer-Encoding': 'chunked',
      'Ice-Name': 'WordPal Live',
      'Ice-Public': '0',
    }
  }, (res) => {
    console.log('Icecast response:', res.statusCode);
  });

  iceReq.on('error', (e) => {
    console.error('Icecast error:', e.message);
    ws.send(JSON.stringify({ error: e.message }));
  });

  // Relay audio chunks from browser to Icecast
  ws.on('message', (data) => {
    try {
      iceReq.write(data);
    } catch(e) {
      console.error('Write error:', e.message);
    }
  });

  ws.on('close', () => {
    console.log('Leader disconnected — closing Icecast connection');
    try { iceReq.end(); } catch(e) {}
  });

  ws.on('error', (e) => {
    console.error('WebSocket error:', e.message);
    try { iceReq.end(); } catch(e) {}
  });
});

server.listen(PORT, () => {
  console.log(`WordPal server running on port ${PORT}`);
});
