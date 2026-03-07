const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// Liquidsoap harbor - accepts live DJ streams
const HARBOR_HOST = '157.245.208.49';
const HARBOR_PORT = 8015;
const HARBOR_MOUNT = '/';
const HARBOR_USER = 'live';
const HARBOR_PASS = 'live123';

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = filePath.split('?')[0];
  let fullPath = path.join(__dirname, filePath);
  if (!path.extname(fullPath) && !fs.existsSync(fullPath)) {
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

const wss = new WebSocketServer({ server, path: '/broadcast' });

wss.on('connection', (ws) => {
  console.log('Leader connected — starting FFmpeg → Icecast stream');

  const icecastUrl = `icecast://${HARBOR_USER}:${HARBOR_PASS}@${HARBOR_HOST}:${HARBOR_PORT}${HARBOR_MOUNT}`;

  const ffmpeg = spawn('ffmpeg', [
    '-re',
    '-i', 'pipe:0',              // read webm/opus from stdin
    '-vn',
    '-acodec', 'libmp3lame',
    '-ab', '128k',
    '-ar', '44100',
    '-f', 'mp3',
    icecastUrl
  ]);

  ffmpeg.stderr.on('data', (d) => console.log('FFmpeg:', d.toString().trim()));
  ffmpeg.on('close', (code, signal) => console.log(`FFmpeg exited with code ${code}, signal ${signal}`));
  ffmpeg.on('error', (e) => console.error('FFmpeg spawn error:', e.message));

  ws.on('message', (data) => {
    try {
      ffmpeg.stdin.write(data);
    } catch(e) {
      console.warn('FFmpeg write error:', e.message);
    }
  });

  ws.on('close', () => {
    console.log('Leader disconnected — closing FFmpeg');
    try { ffmpeg.stdin.end(); } catch(e) {}
    try { ffmpeg.kill('SIGTERM'); } catch(e) {}
  });

  ws.on('error', (e) => {
    console.error('WebSocket error:', e.message);
    try { ffmpeg.kill('SIGTERM'); } catch(e) {}
  });
});

server.listen(PORT, () => {
  console.log(`WordPal server running on port ${PORT}`);
});
