import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { config } from './config.js';
import { pool } from './db.js';
import { attachUser } from './auth/middleware.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { companiesRouter } from './routes/companies.js';
import { offersRouter, requestOffersRouter } from './routes/offers.js';
import { partnersRouter } from './routes/partners.js';
import { requestsRouter } from './routes/requests.js';
import { usersRouter } from './routes/users.js';

/**
 * CORS for a cookie-authenticated API: the origin has to be echoed from an
 * allow list, because `*` and credentials cannot be combined.
 */
function cors(req, res, next) {
  const origin = req.get('origin');
  if (origin && config.corsOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.set('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}

export function createApp() {
  const app = express();

  // Behind Netlify/Fly/nginx, req.ip must come from X-Forwarded-For, otherwise
  // the login rate limiter sees one proxy address for every visitor.
  app.set('trust proxy', config.isProduction ? 1 : false);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors);
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(attachUser);

  app.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', env: config.env });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unreachable' });
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/companies', companiesRouter);
  app.use('/api/partners', partnersRouter);
  app.use('/api/requests/:requestId/offers', requestOffersRouter);
  app.use('/api/requests', requestsRouter);
  app.use('/api/offers', offersRouter);
  app.use('/api/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
