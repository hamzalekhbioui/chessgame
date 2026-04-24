import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import friendRoutes from './routes/friends.js';
import userRoutes from './routes/users.js';
import gameRoutes from './routes/games.js';
import { setupSocketHandlers } from './socket/gameHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const httpServer = createServer(app);

const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
const allowedOrigins = [
  clientUrl,
  'http://localhost:5173',
  'http://localhost:3001',
];

const isAllowedOrigin = (origin: string | undefined) => {
  if (!origin) return true; // same-origin / server-to-server
  if (allowedOrigins.includes(origin)) return true;
  if (origin.endsWith('.ngrok-free.app') || origin.endsWith('.ngrok.io')) return true;
  return false;
};

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/users', userRoutes);
app.use('/api/games', gameRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve client build (for ngrok / production)
const clientBuildPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientBuildPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// Socket.IO
setupSocketHandlers(io);

const PORT = parseInt(process.env.PORT || '3001');
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Client URL: ${clientUrl}`);
});

// Graceful shutdown — save or abort active games before exiting
const shutdown = (signal: string) => {
  console.log(`[${signal}] Shutting down gracefully...`);
  httpServer.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
  // Force exit after 10 s if connections are stuck
  setTimeout(() => {
    console.error('Forced exit after timeout.');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
