const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;

// Icecast / AzuraCast settings
const ICECAST_HOST = '157.245.208.49';
const ICECAST_PORT = 8010;
const ICECAST_MOUNT = '/live';
const ICECAST_USER = 'source';
const ICECAST_PASS = 'rcnYnytt';

// MIME types for static files
const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

// -----------------------------
// HTTP SERVER (serves frontend)
// -----------------------------
const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = filePath.split('?')[0];

  let fullPath = path.join(__dirname, filePath);

  if (!path.extname(fullPath) && !fs.existsSync(fullPath)) {
    fullPath += '.html';
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

// -----------------------------
// WEBSOCKET SERVER (audio relay)
// -----------------------------
const wss = new WebSocketServer({ server, path: '/broadcast' });

wss.on('connection', (ws) => {

  console.log('Leader connected — starting Icecast stream');

  const auth = Buffer
    .from(`${ICECAST_USER}:${ICECAST_PASS}`)
    .toString('base64');

  const options = {
    hostname: ICECAST_HOST,
    port: ICECAST_PORT,
    path: ICECAST_MOUNT,
    method: 'SOURCE',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'audio/webm;codecs=opus',
      'Ice-Name': 'WordPal Live',
      'Ice-Description': 'WordPal Live Broadcast',
      'Ice-Public': '0',
      'Ice-Audio-Info': 'bitrate=64'
    }
  };

  const iceReq = http.request(options, (res) => {
    console.log('Icecast response:', res.statusCode);

    if (res.statusCode !== 200) {
      console.error('Icecast rejected stream');
      ws.close();
    }
  });

  iceReq.on('error', (err) => {
    console.error('Icecast connection error:', err.message);
    ws.close();
  });

  // Relay audio chunks from browser to Icecast
  ws.on('message', (data) => {
    try {
      iceReq.write(data);
    } catch (err) {
      console.error('Write error:', err.message);
    }
  });

  ws.on('close', () => {
    console.log('Leader disconnected — ending Icecast stream');
    try {
      iceReq.end();
    } catch {}
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    try {
      iceReq.end();
    } catch {}
  });

});

// -----------------------------
// START SERVER
// -----------------------------
server.listen(PORT, () => {
  console.log(`WordPal server running on port ${PORT}`);
});
