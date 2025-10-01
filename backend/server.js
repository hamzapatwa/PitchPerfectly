import express from 'express';
import multer from 'multer';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({limit: '2mb'}));

const upload = multer({ dest: 'uploads/' });

// In-memory stores for demo
const rooms = new Map();
const results = new Map();

app.post('/upload', upload.single('file'), (req, res) => {
  const track_id = path.basename(req.file.filename);
  res.json({ track_id });
});

app.post('/analyze/:track_id', (req, res) => {
  // TODO: enqueue Python job; demo returns a fake reference_id
  const reference_id = 'ref_' + req.params.track_id;
  res.json({ reference_id });
});

app.post('/finish/:session_id', (req, res) => {
  results.set(req.params.session_id, req.body);
  res.json({ ok: true });
});

app.get('/results/:session_id', (req, res) => {
  res.json(results.get(req.params.session_id) || { error: 'not found' });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/room' });

wss.on('connection', (ws, req) => {
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'join') {
        ws.room = msg.roomId;
        if (!rooms.has(ws.room)) rooms.set(ws.room, new Set());
        rooms.get(ws.room).add(ws);
      } else if (msg.type === 'hud') {
        // relay HUD metrics to room
        const peers = rooms.get(ws.room) || [];
        for (const p of peers) if (p !== ws && p.readyState === 1) p.send(JSON.stringify({ type:'hud', payload: msg.payload }));
      }
    } catch {}
  });
  ws.on('close', () => {
    if (ws.room && rooms.has(ws.room)) rooms.get(ws.room).delete(ws);
  });
});

server.listen(8080, () => console.log('Server on :8080'));