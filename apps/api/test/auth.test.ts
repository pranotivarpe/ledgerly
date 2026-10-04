import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { app, getCookie, ORIGIN, resetDb, signUp } from './helpers.js';

beforeEach(resetDb);

describe('POST /api/auth/signup', () => {
  it('creates the user, an organization and an OWNER membership, and sets auth cookies', async () => {
    const res = await request(app).post('/api/auth/signup').set('Origin', ORIGIN).send({
      name: 'Alex Morgan',
      email: 'Alex@Northwind.io',
      password: 'super-secret-pw',
      organizationName: 'Northwind Studio',
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Alex Morgan', email: 'alex@northwind.io' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.organizations[0]).toMatchObject({
      slug: 'northwind-studio',
      role: 'OWNER',
      plan: 'FREE',
    });

    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('ll_access=') && c.includes('HttpOnly'))).toBe(true);
    expect(cookies.some((c) => c.startsWith('ll_refresh=') && c.includes('Path=/api/auth'))).toBe(
      true,
    );

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'alex@northwind.io' } });
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
  });

  it('rejects a duplicate email with 409', async () => {
    await signUp({ email: 'taken@example.com' });
    const res = await request(app).post('/api/auth/signup').set('Origin', ORIGIN).send({
      name: 'Other',
      email: 'TAKEN@example.com',
      password: 'another-password',
      organizationName: 'Other Co',
    });
    expect(res.status).toBe(409);
  });

  it('validates input', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .set('Origin', ORIGIN)
      .send({ name: '', email: 'not-an-email', password: 'short', organizationName: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.details.fieldErrors)).toEqual(
      expect.arrayContaining(['name', 'email', 'password', 'organizationName']),
    );
  });

  it('gives a second org with the same name a unique slug', async () => {
    const a = await signUp({ organizationName: 'Pixel Forge' });
    const b = await signUp({ organizationName: 'Pixel Forge' });
    expect(a.org.slug).toBe('pixel-forge');
    expect(b.org.slug).toMatch(/^pixel-forge-[a-f0-9]{4}$/);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    const { body } = await signUp();
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: body.email, password: body.password });
    expect(res.status).toBe(200);
    expect(getCookie(res.headers['set-cookie'], 'll_access')).toBeTruthy();
  });

  it('returns the same generic 401 for a wrong password and an unknown email', async () => {
    const { body } = await signUp();
    const wrongPw = await request(app)
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: body.email, password: 'wrong-password' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: 'nobody@example.com', password: 'whatever-pw' });
    expect(wrongPw.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPw.body.error.message).toBe(unknown.body.error.message);
  });
});

describe('sessions', () => {
  it('GET /me requires authentication', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /me returns the user and their organizations', async () => {
    const { agent, org } = await signUp();
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.organizations).toEqual([
      expect.objectContaining({ id: org.id, role: 'OWNER' }),
    ]);
  });

  it('rotates refresh tokens: the old one stops working after use', async () => {
    const signup = await request(app).post('/api/auth/signup').set('Origin', ORIGIN).send({
      name: 'R',
      email: 'rotate@example.com',
      password: 'rotate-password',
      organizationName: 'Rotate Co',
    });
    const oldRefresh = getCookie(signup.headers['set-cookie'], 'll_refresh');

    const first = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', `ll_refresh=${oldRefresh}`);
    expect(first.status).toBe(204);
    const newRefresh = getCookie(first.headers['set-cookie'], 'll_refresh');
    expect(newRefresh).toBeTruthy();
    expect(newRefresh).not.toBe(oldRefresh);

    const replay = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', `ll_refresh=${oldRefresh}`);
    expect(replay.status).toBe(401);
  });

  it('logout deletes the server-side session and clears cookies', async () => {
    const { agent } = await signUp();
    expect(await prisma.session.count()).toBe(1);

    await agent.post('/api/auth/logout').set('Origin', ORIGIN).expect(204);

    expect(await prisma.session.count()).toBe(0);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('a revoked session rejects a replayed access token', async () => {
    const signup = await request(app).post('/api/auth/signup').set('Origin', ORIGIN).send({
      name: 'L',
      email: 'logout@example.com',
      password: 'logout-password',
      organizationName: 'Logout Co',
    });
    const access = getCookie(signup.headers['set-cookie'], 'll_access');
    const refresh = getCookie(signup.headers['set-cookie'], 'll_refresh');

    await request(app)
      .post('/api/auth/logout')
      .set('Origin', ORIGIN)
      .set('Cookie', `ll_refresh=${refresh}`)
      .expect(204);

    const res = await request(app).get('/api/auth/me').set('Cookie', `ll_access=${access}`);
    expect(res.status).toBe(401);
  });
});

describe('CSRF origin check', () => {
  it('blocks state-changing requests from a foreign origin', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'a@b.co', password: 'x' });
    expect(res.status).toBe(403);
  });
});
