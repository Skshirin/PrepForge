// ============================================================================
// Tests: Kit Routes, Validation & Optimistic Concurrency
// ============================================================================

import request from 'supertest';
import { app } from '../index';
import { Kit } from '../models';

describe('Kit Routes & Access Control', () => {
  describe('Authentication Guards', () => {
    it('rejects POST /api/kits without authentication', async () => {
      const res = await request(app)
        .post('/api/kits')
        .send({ jd: 'Some job description with sufficient length', days: 5 });

      expect(res.status).toBe(401);
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('rejects GET /api/kits without authentication', async () => {
      const res = await request(app).get('/api/kits');
      expect(res.status).toBe(401);
    });

    it('rejects GET /api/kits/:id without authentication', async () => {
      const res = await request(app).get('/api/kits/507f1f77bcf86cd799439011');
      expect(res.status).toBe(401);
    });

    it('rejects PUT /api/kits/:id without authentication', async () => {
      const res = await request(app)
        .put('/api/kits/507f1f77bcf86cd799439011')
        .send({ version: 1 });
      expect(res.status).toBe(401);
    });

    it('rejects POST /api/kits/:id/regenerate without authentication', async () => {
      const res = await request(app)
        .post('/api/kits/507f1f77bcf86cd799439011/regenerate')
        .send({ section: 'questions' });
      expect(res.status).toBe(401);
    });

    it('rejects POST /api/kits/:id/export without authentication', async () => {
      const res = await request(app)
        .post('/api/kits/507f1f77bcf86cd799439011/export')
        .send({ format: 'json' });
      expect(res.status).toBe(401);
    });

    it('rejects DELETE /api/kits/:id without authentication', async () => {
      const res = await request(app).delete('/api/kits/507f1f77bcf86cd799439011');
      expect(res.status).toBe(401);
    });

    it('rejects GET /api/generation/:jobId without authentication', async () => {
      const res = await request(app).get('/api/generation/507f1f77bcf86cd799439011');
      expect(res.status).toBe(401);
    });
  });
});
