import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const UPLOADS_ROOT = path.resolve(__dirname, 'uploads');
const INDEX_FILE = path.resolve(UPLOADS_ROOT, 'sessions.json');
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB per photo
const SESSION_ID_RE = /^[A-Z0-9-]{4,24}$/;
const PHOTO_ID_RE = /^[a-f0-9-]{8,64}$/;

interface StoredPhoto {
  id: string;
  sessionId: string;
  filename: string;
  mimeType: string;
  width?: number;
  height?: number;
  sizeBytes: number;
  guestName: string;
  caption: string;
  createdAt: string;
  favorite: boolean;
  driveFileId?: string;
  driveWebViewLink?: string;
}

interface StoredSlideshowConfig {
  eventDate: string;
  venue: string;
  welcomeMessage: string;
  showDate: boolean;
  showVenue: boolean;
  showWelcomeMessage: boolean;
  showGuestCredit: boolean;
  showCornerQr: boolean;
  intervalSeconds: number;
}

interface StoredSession {
  id: string;
  title: string;
  subtitle: string;
  createdAt: string;
  hostTokenHash: string;
  slideshow?: StoredSlideshowConfig;
  photos: StoredPhoto[];
}

interface PersistedStore {
  sessions: Record<string, StoredSession>;
}

function ensureUploadsDir(): void {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function verifyHostToken(session: StoredSession, provided: string | undefined): boolean {
  if (!provided || typeof provided !== 'string' || provided.length < 16) {
    return false;
  }
  const providedHash = Buffer.from(hashToken(provided), 'hex');
  const storedHash = Buffer.from(session.hostTokenHash, 'hex');
  if (providedHash.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(providedHash, storedHash);
}

function loadStore(): PersistedStore {
  ensureUploadsDir();
  if (!fs.existsSync(INDEX_FILE)) {
    return { sessions: {} };
  }
  try {
    const raw = fs.readFileSync(INDEX_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as PersistedStore;
    if (parsed && typeof parsed.sessions === 'object') {
      return parsed;
    }
  } catch (err) {
    console.error('Failed to read sessions store, starting fresh:', err);
  }
  return { sessions: {} };
}

function saveStore(store: PersistedStore): void {
  ensureUploadsDir();
  const tempPath = `${INDEX_FILE}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), 'utf-8');
  fs.renameSync(tempPath, INDEX_FILE);
}

function generateSessionCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return `SW-${code}`;
}

function detectImageType(buffer: Buffer): { mimeType: string; ext: string } | null {
  if (buffer.length < 12) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', ext: 'jpg' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mimeType: 'image/png', ext: 'png' };
  }
  // WEBP: RIFF....WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mimeType: 'image/webp', ext: 'webp' };
  }
  return null;
}

function sanitizeText(input: unknown, maxLen: number, fallback = ''): string {
  if (typeof input !== 'string') return fallback;
  return input.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLen) || fallback;
}

function isSafeDriveUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 500) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'drive.google.com';
  } catch {
    return false;
  }
}

function resolveConfinedPhotoPath(sessionId: string, filename: string): string | null {
  const sessionDir = path.resolve(UPLOADS_ROOT, sessionId);
  if (!sessionDir.startsWith(UPLOADS_ROOT + path.sep)) return null;
  const fullPath = path.resolve(sessionDir, path.basename(filename));
  if (!fullPath.startsWith(sessionDir + path.sep)) return null;
  return fullPath;
}

function serializePhoto(photo: StoredPhoto) {
  return {
    ...photo,
    url: `/api/sessions/${encodeURIComponent(photo.sessionId)}/photos/${encodeURIComponent(photo.id)}/file`,
  };
}

function buildDefaultSlideshowConfig(subtitle: string): StoredSlideshowConfig {
  return {
    eventDate: subtitle || new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
    venue: '',
    welcomeMessage: 'Scan the QR code to share your moments live on screen',
    showDate: true,
    showVenue: false,
    showWelcomeMessage: false,
    showGuestCredit: true,
    showCornerQr: true,
    intervalSeconds: 5,
  };
}

function serializeSession(session: StoredSession, includePhotos = true) {
  const slideshow = session.slideshow || buildDefaultSlideshowConfig(session.subtitle);
  return {
    id: session.id,
    title: session.title,
    subtitle: session.subtitle,
    createdAt: session.createdAt,
    photoCount: session.photos.length,
    slideshow,
    photos: includePhotos ? session.photos.map(serializePhoto) : [],
  };
}

const store = loadStore();

// Track WebSocket connections per session room
interface RoomClient {
  ws: WebSocket;
  role: 'host' | 'guest' | 'slideshow';
}
const roomClients = new Map<string, Set<RoomClient>>();

function broadcastToRoom(sessionId: string, event: Record<string, unknown>): void {
  const clients = roomClients.get(sessionId);
  if (!clients || clients.size === 0) return;
  const payload = JSON.stringify(event);
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

function broadcastPresence(sessionId: string): void {
  const clients = roomClients.get(sessionId);
  let guestCount = 0;
  let hostCount = 0;
  if (clients) {
    for (const c of clients) {
      if (c.ws.readyState === WebSocket.OPEN) {
        if (c.role === 'guest') guestCount++;
        else hostCount++;
      }
    }
  }
  broadcastToRoom(sessionId, {
    type: 'presence:update',
    sessionId,
    guestCount,
    hostCount,
  });
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16mb' }));

  // Create a new live event session
  app.post('/api/sessions', (req, res) => {
    const title = sanitizeText(req.body?.title, 80, 'Evening Celebration');
    const subtitle = sanitizeText(
      req.body?.subtitle,
      120,
      new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    );

    let id = generateSessionCode();
    while (store.sessions[id]) {
      id = generateSessionCode();
    }

    const hostToken = crypto.randomBytes(24).toString('hex');
    const session: StoredSession = {
      id,
      title,
      subtitle,
      createdAt: new Date().toISOString(),
      hostTokenHash: hashToken(hostToken),
      slideshow: buildDefaultSlideshowConfig(subtitle),
      photos: [],
    };

    store.sessions[id] = session;
    const sessionDir = path.resolve(UPLOADS_ROOT, id);
    if (sessionDir.startsWith(UPLOADS_ROOT + path.sep)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    saveStore(store);

    res.status(201).json({
      ...serializeSession(session),
      hostToken,
    });
  });

  // Get session metadata and photos (guests only need summary when ?summary=1)
  app.get('/api/sessions/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId.toUpperCase();
    if (!SESSION_ID_RE.test(sessionId)) {
      res.status(400).json({ error: 'Invalid session code.' });
      return;
    }
    const session = store.sessions[sessionId];
    if (!session) {
      res.status(404).json({ error: 'Event session not found.' });
      return;
    }

    const summaryOnly = req.query.summary === '1';
    res.json(serializeSession(session, !summaryOnly));
  });

  // Update session title/subtitle (host-only)
  app.patch('/api/sessions/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId.toUpperCase();
    if (!SESSION_ID_RE.test(sessionId)) {
      res.status(400).json({ error: 'Invalid session code.' });
      return;
    }
    const session = store.sessions[sessionId];
    if (!session) {
      res.status(404).json({ error: 'Event session not found.' });
      return;
    }
    const hostToken = req.header('X-Host-Token');
    if (!verifyHostToken(session, hostToken)) {
      res.status(403).json({ error: 'Host authorization required.' });
      return;
    }

    if (typeof req.body?.title === 'string') {
      session.title = sanitizeText(req.body.title, 80, session.title);
    }
    if (typeof req.body?.subtitle === 'string') {
      session.subtitle = sanitizeText(req.body.subtitle, 120, '');
    }
    if (req.body?.slideshow && typeof req.body.slideshow === 'object') {
      const incoming = req.body.slideshow as Record<string, unknown>;
      const current = session.slideshow || buildDefaultSlideshowConfig(session.subtitle);
      session.slideshow = {
        eventDate:
          typeof incoming.eventDate === 'string'
            ? sanitizeText(incoming.eventDate, 80, '')
            : current.eventDate,
        venue:
          typeof incoming.venue === 'string'
            ? sanitizeText(incoming.venue, 100, '')
            : current.venue,
        welcomeMessage:
          typeof incoming.welcomeMessage === 'string'
            ? sanitizeText(incoming.welcomeMessage, 160, '')
            : current.welcomeMessage,
        showDate: typeof incoming.showDate === 'boolean' ? incoming.showDate : current.showDate,
        showVenue: typeof incoming.showVenue === 'boolean' ? incoming.showVenue : current.showVenue,
        showWelcomeMessage:
          typeof incoming.showWelcomeMessage === 'boolean'
            ? incoming.showWelcomeMessage
            : current.showWelcomeMessage,
        showGuestCredit:
          typeof incoming.showGuestCredit === 'boolean'
            ? incoming.showGuestCredit
            : current.showGuestCredit,
        showCornerQr:
          typeof incoming.showCornerQr === 'boolean' ? incoming.showCornerQr : current.showCornerQr,
        intervalSeconds:
          typeof incoming.intervalSeconds === 'number' && Number.isFinite(incoming.intervalSeconds)
            ? Math.max(2, Math.min(30, Math.round(incoming.intervalSeconds)))
            : current.intervalSeconds,
      };
    }
    saveStore(store);

    const payload = {
      id: session.id,
      title: session.title,
      subtitle: session.subtitle,
      photoCount: session.photos.length,
      slideshow: session.slideshow || buildDefaultSlideshowConfig(session.subtitle),
    };
    broadcastToRoom(sessionId, { type: 'session:updated', session: payload });
    res.json(payload);
  });

  // Upload a new photo from guest mobile camera or host laptop
  app.post('/api/sessions/:sessionId/photos', (req, res) => {
    const sessionId = req.params.sessionId.toUpperCase();
    if (!SESSION_ID_RE.test(sessionId)) {
      res.status(400).json({ error: 'Invalid session code.' });
      return;
    }
    const session = store.sessions[sessionId];
    if (!session) {
      res.status(404).json({ error: 'Event session not found. Please scan a valid QR code.' });
      return;
    }

    const rawDataUrl = req.body?.imageData;
    if (typeof rawDataUrl !== 'string' || rawDataUrl.length < 32) {
      res.status(400).json({ error: 'Missing image payload.' });
      return;
    }

    const base64Match = rawDataUrl.match(/^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!base64Match) {
      res.status(400).json({ error: 'Unsupported image format. Use JPEG, PNG, or WebP.' });
      return;
    }

    const buffer = Buffer.from(base64Match[1], 'base64');
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
      res.status(413).json({ error: 'Photo exceeds maximum size limit of 10 MB.' });
      return;
    }

    const detected = detectImageType(buffer);
    if (!detected) {
      res.status(400).json({ error: 'Uploaded file is not a valid JPEG, PNG, or WebP image.' });
      return;
    }

    const photoId = crypto.randomUUID();
    const filename = `${photoId}.${detected.ext}`;
    const sessionDir = path.resolve(UPLOADS_ROOT, sessionId);
    if (!sessionDir.startsWith(UPLOADS_ROOT + path.sep)) {
      res.status(400).json({ error: 'Invalid session path.' });
      return;
    }
    fs.mkdirSync(sessionDir, { recursive: true });

    const destPath = resolveConfinedPhotoPath(sessionId, filename);
    if (!destPath) {
      res.status(400).json({ error: 'Invalid storage path.' });
      return;
    }

    fs.writeFileSync(destPath, buffer);

    const width = Number.isFinite(Number(req.body?.width)) ? Math.max(1, Math.min(12000, Math.round(Number(req.body.width)))) : undefined;
    const height = Number.isFinite(Number(req.body?.height)) ? Math.max(1, Math.min(12000, Math.round(Number(req.body.height)))) : undefined;

    const storedPhoto: StoredPhoto = {
      id: photoId,
      sessionId,
      filename,
      mimeType: detected.mimeType,
      width,
      height,
      sizeBytes: buffer.length,
      guestName: sanitizeText(req.body?.guestName, 60, 'Guest'),
      caption: sanitizeText(req.body?.caption, 140, ''),
      createdAt: new Date().toISOString(),
      favorite: false,
    };

    session.photos.unshift(storedPhoto);
    saveStore(store);

    const serialized = serializePhoto(storedPhoto);
    broadcastToRoom(sessionId, { type: 'photo:created', photo: serialized });

    res.status(201).json({ photo: serialized });
  });

  // Serve an uploaded photo file securely
  app.get('/api/sessions/:sessionId/photos/:photoId/file', (req, res) => {
    const sessionId = req.params.sessionId.toUpperCase();
    const photoId = req.params.photoId;
    if (!SESSION_ID_RE.test(sessionId) || !PHOTO_ID_RE.test(photoId)) {
      res.status(400).json({ error: 'Invalid photo identifier.' });
      return;
    }

    const session = store.sessions[sessionId];
    if (!session) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }

    const photo = session.photos.find((p) => p.id === photoId);
    if (!photo) {
      res.status(404).json({ error: 'Photo not found.' });
      return;
    }

    const filePath = resolveConfinedPhotoPath(sessionId, photo.filename);
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Photo file missing.' });
      return;
    }

    res.setHeader('Content-Type', photo.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(filePath);
  });

  // Update photo metadata (favorite, Google Drive file link) — host-only
  app.patch('/api/sessions/:sessionId/photos/:photoId', (req, res) => {
    const sessionId = req.params.sessionId.toUpperCase();
    const photoId = req.params.photoId;
    if (!SESSION_ID_RE.test(sessionId) || !PHOTO_ID_RE.test(photoId)) {
      res.status(400).json({ error: 'Invalid identifier.' });
      return;
    }

    const session = store.sessions[sessionId];
    if (!session) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    if (!verifyHostToken(session, req.header('X-Host-Token'))) {
      res.status(403).json({ error: 'Host authorization required.' });
      return;
    }

    const photo = session.photos.find((p) => p.id === photoId);
    if (!photo) {
      res.status(404).json({ error: 'Photo not found.' });
      return;
    }

    if (typeof req.body?.favorite === 'boolean') {
      photo.favorite = req.body.favorite;
    }
    if (typeof req.body?.driveFileId === 'string') {
      const cleanedId = req.body.driveFileId.trim();
      if (/^[A-Za-z0-9_-]{8,128}$/.test(cleanedId)) {
        photo.driveFileId = cleanedId;
      } else if (cleanedId === '') {
        delete photo.driveFileId;
        delete photo.driveWebViewLink;
      }
    }
    if (typeof req.body?.driveWebViewLink === 'string' && isSafeDriveUrl(req.body.driveWebViewLink)) {
      photo.driveWebViewLink = req.body.driveWebViewLink;
    }

    saveStore(store);
    const serialized = serializePhoto(photo);
    broadcastToRoom(sessionId, { type: 'photo:updated', photo: serialized });
    res.json({ photo: serialized });
  });

  // Delete a photo — host-only
  app.delete('/api/sessions/:sessionId/photos/:photoId', (req, res) => {
    const sessionId = req.params.sessionId.toUpperCase();
    const photoId = req.params.photoId;
    if (!SESSION_ID_RE.test(sessionId) || !PHOTO_ID_RE.test(photoId)) {
      res.status(400).json({ error: 'Invalid identifier.' });
      return;
    }

    const session = store.sessions[sessionId];
    if (!session) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    if (!verifyHostToken(session, req.header('X-Host-Token'))) {
      res.status(403).json({ error: 'Host authorization required.' });
      return;
    }

    const idx = session.photos.findIndex((p) => p.id === photoId);
    if (idx === -1) {
      res.status(404).json({ error: 'Photo not found.' });
      return;
    }

    const [removed] = session.photos.splice(idx, 1);
    const filePath = resolveConfinedPhotoPath(sessionId, removed.filename);
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error('Failed to delete photo file:', err);
      }
    }
    saveStore(store);

    broadcastToRoom(sessionId, { type: 'photo:deleted', photoId });
    res.json({ ok: true, photoId });
  });

  // Frontend serving: Vite dev middleware in development, static dist/ in production
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);

  // Attach room-isolated WebSocket server on /ws
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws, req) => {
    try {
      const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const sessionId = (parsedUrl.searchParams.get('sessionId') || '').toUpperCase();
      const rawRole = parsedUrl.searchParams.get('role');
      const role: RoomClient['role'] =
        rawRole === 'guest' ? 'guest' : rawRole === 'slideshow' ? 'slideshow' : 'host';

      if (!SESSION_ID_RE.test(sessionId) || !store.sessions[sessionId]) {
        ws.close(1008, 'Unknown session');
        return;
      }

      const client: RoomClient = { ws, role };
      if (!roomClients.has(sessionId)) {
        roomClients.set(sessionId, new Set());
      }
      roomClients.get(sessionId)!.add(client);

      ws.send(JSON.stringify({ type: 'connected', sessionId, role }));
      broadcastPresence(sessionId);

      ws.on('close', () => {
        const set = roomClients.get(sessionId);
        if (set) {
          set.delete(client);
          if (set.size === 0) roomClients.delete(sessionId);
        }
        broadcastPresence(sessionId);
      });

      ws.on('error', () => {
        ws.close();
      });
    } catch {
      ws.close(1011, 'Connection error');
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SnapWall Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
