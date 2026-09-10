// ============================================================================
// Server Application Entry Point
// ============================================================================

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

import { authRouter, kitRouter, generationRouter } from './routes';
import { globalErrorHandler } from './middleware';

dotenv.config();

export const app = express();

// ---- Configuration ---------------------------------------------------------

const PORT = parseInt(process.env.PORT || '5000', 10);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/trao_interview_kit';
const SESSION_SECRET = process.env.SESSION_SECRET || 'trao-interview-kit-insecure-dev-secret';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// ---- Middleware Setup ------------------------------------------------------

// CORS configuration (allow Next.js frontend with credentials for session cookie)
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      const allowedOrigins = [CLIENT_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'];
      if (allowedOrigins.includes(origin) || !isProduction) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Session setup: Use MongoStore sharing Mongoose client in normal/production modes; MemoryStore in tests
const sessionStore = isTest
  ? undefined
  : MongoStore.create({
      clientPromise: new Promise((resolve) => {
        if (mongoose.connection.readyState === 1) {
          return resolve(mongoose.connection.getClient() as any);
        }
        mongoose.connection.once('connected', () => {
          resolve(mongoose.connection.getClient() as any);
        });
      }),
      ttl: 14 * 24 * 60 * 60, // 14 days
      autoRemove: 'native',
    });

app.use(
  session({
    store: sessionStore,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'trao.sid',
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
    },
  })
);

// ---- Health Check Endpoint -------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    dbConnected: mongoose.connection.readyState === 1,
    environment: process.env.NODE_ENV || 'development',
  });
});

// ---- API Routes ------------------------------------------------------------

app.use('/api/auth', authRouter);
app.use('/api/kits', kitRouter);
app.use('/api/generation', generationRouter);

// 404 Handler for undefined API routes
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ---- Global Error Handler --------------------------------------------------

app.use(globalErrorHandler);

// ---- Server Lifecycle ------------------------------------------------------

export async function connectDatabase(uri = MONGODB_URI): Promise<boolean> {
  if (mongoose.connection.readyState === 1) return true;
  try {
    await mongoose.connect(uri);
    console.log('[MongoDB] Connected successfully to', uri.split('@').pop() || uri);
    return true;
  } catch (err: any) {
    console.error('[MongoDB] Connection error (bad auth or unreachable):', err.message);
    console.error('[MongoDB] Hint: Check MONGODB_URI credentials. URL-encode special chars in password (e.g. @ -> %40). Whitelist 0.0.0.0/0 in Atlas.');
    return false;
  }
}

export async function startServer(port = PORT): Promise<import('http').Server> {
  // Initiate database connection asynchronously without crashing the server startup
  connectDatabase().catch((err) => {
    console.error('[MongoDB] Async connection error:', err.message);
  });

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`[Server] Trao Interview Kit backend listening on port ${port}`);
      resolve(server);
    });
  });
}

// Global safety against unhandled rejections
process.on('unhandledRejection', (reason: any) => {
  console.warn('[Process] Unhandled rejection intercepted:', reason?.message || reason);
});

// Automatically start server if run directly (e.g., `node dist/index.js` or `ts-node src/index.ts`)
if (require.main === module) {
  startServer().catch((err) => {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  });
}

