// ============================================================================
// Tests: Auth Routes & Validation
// ============================================================================

import request from 'supertest';
import { app } from '../index';
import { User } from '../models';

describe('Auth Routes', () => {
  describe('POST /api/auth/register', () => {
    it('rejects registration with invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'password123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('rejects registration with short password (< 8 characters)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('rejects duplicate email if user already exists', async () => {
      jest.spyOn(User, 'findOne').mockResolvedValueOnce({
        _id: '507f1f77bcf86cd799439011',
        email: 'existing@example.com',
      } as any);

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'existing@example.com', password: 'password123' });

      expect(res.status).toBe(409);
      expect(res.body.error).toHaveProperty('code', 'EMAIL_EXISTS');

      jest.restoreAllMocks();
    });
  });

  describe('POST /api/auth/login', () => {
    it('rejects login with missing credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('returns 401 on nonexistent user', async () => {
      jest.spyOn(User, 'findOne').mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'unknown@example.com', password: 'password123' });

      expect(res.status).toBe(401);
      expect(res.body.error).toHaveProperty('code', 'INVALID_CREDENTIALS');

      jest.restoreAllMocks();
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 when no session exists', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('returns user when valid Bearer token is provided', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439011',
        email: 'tokenuser@example.com',
        createdAt: new Date(),
      };

      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser),
      } as any);

      const { createAuthToken } = require('../utils');
      const token = createAuthToken(mockUser._id);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toHaveProperty('email', 'tokenuser@example.com');

      jest.restoreAllMocks();
    });

    it('returns 401 when invalid Bearer token is provided', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.tampered.token');

      expect(res.status).toBe(401);
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('returns 200 on logout', async () => {
      const res = await request(app).post('/api/auth/logout');
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Logged out successfully');
    });
  });
});
