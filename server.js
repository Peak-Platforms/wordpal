const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 8080;

// AzuraCast Icecast source settings
const ICECAST_HOST = '157.245.208.49';
const ICECAST_PORT = 8010;
const ICECAST_MOUNT = '/live.mp3';
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
// HTTP SERVER (frontend)
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
  console.log('Leader connected — starting FFmpeg → Icecast stream');

  // Base64 authorization
  const auth = Buffer.from(`${ICECAST_USER}:${ICECAST_PASS}`).toString('base64');

  // Spawn FFmpeg to convert WebM/Opus from browser to MP3 for Icecast
  const ffmpeg = spawn('ffmpeg', [
    '-f', 'webm',            // input format
    '-i', 'pipe:0',          // read from stdin (WebSocket)
    '-c:a', 'libmp3lame',    // MP3 encoder
    '-b:a', '192k',          // bitrate
    '-content_type', 'audio/mpeg',
    '-f', 'mp3',             // output format
    `icecast://source:rcnYnytt@${ICECAST_HOST}:${ICECAST_PORT}${ICECAST_MOUNT}`
  ]);

  ffmpeg.stderr.on('data', (data) => {
    // FFmpeg logs
    console.log(`FFmpeg: ${data.toString()}`);
  });

  ffmpeg.on('exit', (code, signal) => {
    console.log(`FFmpeg exited with code ${code}, signal ${signal}`);
  });

  ffmpeg.on('error', (err) => {
    console.error('FFmpeg error:', err.message);
  });

  // Receive audio chunks from browser and pipe into FFmpeg stdin
  ws.on('message', (data) => {
    try {
      ffmpeg.stdin.write(data);
    } catch (err) {
      console.error('FFmpeg stdin write error:', err.message);
    }
  });

  ws.on('close', () => {
    console.log('Leader disconnected — closing FFmpeg');
    try { ffmpeg.stdin.end(); } catch {}
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    try { ffmpeg.stdin.end(); } catch {}
  });
});

// -----------------------------
// START SERVER
// -----------------------------
server.listen(PORT, () => {
  console.log(`WordPal server running on port ${PORT}`);
});
