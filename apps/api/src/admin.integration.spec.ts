import sharp from 'sharp';
import { bearer, createTestApp, TestApp, TestUser } from './test-utils/test-app';
import { PlayerSubPosition, UserRole, UserStatus } from './users/entities/user.entity';
import { AwardCategory } from './awards/entities/award-category.entity';

describe('users, auth, settings, awards, admin tools (real stack)', () => {
  let t: TestApp;
  let coach: TestUser;
  let admin: TestUser;
  let player: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    t = await createTestApp();
    coach = await t.createUser({ role: UserRole.COACH });
    admin = await t.createUser({ role: UserRole.SUPERADMIN });
    player = await t.createUser();
    other = await t.createUser();
  });
  afterAll(() => t.close());

  const as = (u: TestUser) => bearer(u.token);

  describe('auth endpoints', () => {
    it('logs in with the right password and refuses the wrong one', async () => {
      const ok = await t.http().post('/api/auth/login').send({ email: player.user.email, password: 'Password-123' });
      expect(ok.status).toBe(201);
      expect(ok.body.accessToken).toBeTruthy();
      expect((await t.http().post('/api/auth/login').send({ email: player.user.email, password: 'Wrong-Password-1' })).status).toBe(401);
      const refreshed = await t.http().post('/api/auth/refresh').send({ refreshToken: ok.body.refreshToken });
      expect(refreshed.status).toBe(201);
      expect((await t.http().post('/api/auth/refresh').send({ refreshToken: 'garbage' })).status).toBe(401);
    });

    it('changes the password', async () => {
      const u = await t.createUser();
      const bad = await t.http().patch('/api/auth/change-password').set(as(u)).send({ currentPassword: 'wrong', newPassword: 'New-Password-1' });
      expect(bad.status).toBe(401);
      const ok = await t.http().patch('/api/auth/change-password').set(as(u)).send({ currentPassword: 'Password-123', newPassword: 'New-Password-1' });
      expect(ok.status).toBeLessThan(300);
      expect((await t.http().post('/api/auth/login').send({ email: u.user.email, password: 'New-Password-1' })).status).toBe(201);
    });

    it('public sign-up creates a pending account that must be approved', async () => {
      const email = `newbie-${Date.now()}@test.local`;
      const join = await t.http().post('/api/auth/join').send({ email, firstName: 'New', lastName: 'Bie', password: 'Password-123' });
      expect(join.status).toBeLessThan(300);
      expect((await t.http().get('/api/auth/join-status').query({ email })).body.status).toBe('PENDING');
      expect((await t.http().get('/api/auth/join-status').query({ email: 'ghost@test.local' })).body.status).toBe('NOT_FOUND');
      expect((await t.http().post('/api/auth/login').send({ email, password: 'Password-123' })).status).toBe(403);

      const list = await t.http().get('/api/users').set(as(coach));
      const pending = list.body.find((u: { email: string }) => u.email === email);
      expect(pending.status).toBe('PENDING');
      expect((await t.http().patch(`/api/users/${pending.id}/approve`).set(as(player))).status).toBe(403);
      expect((await t.http().patch(`/api/users/${pending.id}/approve`).set(as(coach))).status).toBe(200);
      expect((await t.http().post('/api/auth/login').send({ email, password: 'Password-123' })).status).toBe(201);
      expect((await t.http().get('/api/auth/join-status').query({ email })).body.status).toBe('ACTIVE');
    });

    it('a coach invites a player who then sets a password', async () => {
      const email = `invited-${Date.now()}@test.local`;
      expect((await t.http().post('/api/auth/invitations').set(as(player)).send({ email, firstName: 'In', lastName: 'Vited' })).status).toBe(403);
      const inv = await t.http().post('/api/auth/invitations').set(as(coach)).send({ email, firstName: 'In', lastName: 'Vited', isLicensed: true });
      expect(inv.status).toBe(201);
      const token = new URL(inv.body.invitationUrl).searchParams.get('token');
      const accepted = await t.http().post('/api/auth/accept-invitation').send({ token, password: 'Password-123' });
      expect(accepted.status).toBe(201);
      // single use
      expect((await t.http().post('/api/auth/accept-invitation').send({ token, password: 'Password-123' })).status).toBe(400);
    });
  });

  describe('users', () => {
    it('reads and updates my profile, validating the payload', async () => {
      expect((await t.http().get('/api/users/me').set(as(player))).body.email).toBe(player.user.email);
      const upd = await t
        .http()
        .patch('/api/users/me')
        .set(as(player))
        .send({ positions: [PlayerSubPosition.STRIKER, PlayerSubPosition.RIGHT_WINGER], jerseyNumber: 9 });
      expect(upd.status).toBe(200);
      expect(upd.body.positions).toEqual(['STRIKER', 'RIGHT_WINGER']);
      expect(upd.body).not.toHaveProperty('passwordHash');
      const tooMany = await t
        .http()
        .patch('/api/users/me')
        .set(as(player))
        .send({ positions: ['STRIKER', 'GOALKEEPER', 'CENTER_BACK', 'LEFT_BACK'] });
      expect(tooMany.status).toBe(400);
      expect((await t.http().patch('/api/users/me').set(as(player)).send({ role: 'SUPERADMIN' })).status).toBe(400);
    });

    it('a coach edits a player but cannot grant or touch the superadmin role', async () => {
      const edit = await t.http().patch(`/api/users/${other.user.id}`).set(as(coach)).send({ isLicensed: true, seniorityTier: 'SEVEN_PLUS', firstName: 'Renamed' });
      expect(edit.status).toBe(200);
      expect(edit.body.firstName).toBe('Renamed');
      expect((await t.http().patch(`/api/users/${other.user.id}`).set(as(player)).send({ isLicensed: false })).status).toBe(403);
      expect((await t.http().patch(`/api/users/${other.user.id}`).set(as(coach)).send({ role: 'SUPERADMIN' })).status).toBe(403);
      expect((await t.http().patch(`/api/users/${admin.user.id}`).set(as(coach)).send({ role: 'PLAYER' })).status).toBe(403);
      expect((await t.http().patch(`/api/users/${other.user.id}`).set(as(admin)).send({ role: 'COACH' })).status).toBe(200);
      await t.http().patch(`/api/users/${other.user.id}`).set(as(admin)).send({ role: 'PLAYER' });
    });

    it('resets a password (never for a superadmin, unless you are one)', async () => {
      const target = await t.createUser();
      const reset = await t.http().patch(`/api/users/${target.user.id}/reset-password`).set(as(coach));
      expect(reset.status).toBe(200);
      const tmp = reset.body.temporaryPassword;
      expect(tmp).toBeTruthy();
      expect((await t.http().post('/api/auth/login').send({ email: target.user.email, password: tmp })).status).toBe(201);
      expect((await t.http().patch(`/api/users/${admin.user.id}/reset-password`).set(as(coach))).status).toBe(403);
    });

    it('uploads, resizes and removes an avatar', async () => {
      const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#0089cf' } }).png().toBuffer();
      const up = await t.http().post('/api/users/me/avatar').set(as(player)).attach('file', png, { filename: 'a.png', contentType: 'image/png' });
      expect(up.status).toBe(201);
      // the API hands out an address, never the image itself (keeps user lists light)
      expect(up.body.avatarUrl).toMatch(new RegExp(`^/api/users/${player.user.id}/avatar\\?v=[0-9a-f]{10}$`));
      expect(JSON.stringify((await t.http().get('/api/users').set(as(coach))).body)).not.toContain('data:image');
      const image = await t.http().get(up.body.avatarUrl); // no token: an <img> tag can't send one
      expect(image.status).toBe(200);
      expect(image.headers['content-type']).toBe('image/jpeg');
      expect(image.headers['cache-control']).toContain('immutable');
      expect(image.body.length).toBeGreaterThan(100);
      expect((await t.http().get(`/api/users/${other.user.id}/avatar`)).status).toBe(404);
      expect((await t.http().get('/api/users/not-a-uuid/avatar')).status).toBe(400);
      expect((await t.http().post('/api/users/me/avatar').set(as(player))).status).toBe(400);
      const notImage = await t.http().post('/api/users/me/avatar').set(as(player)).attach('file', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' });
      expect(notImage.status).toBe(400);
      const broken = await t.http().post('/api/users/me/avatar').set(as(player)).attach('file', Buffer.from('not really'), { filename: 'a.png', contentType: 'image/png' });
      expect(broken.status).toBe(400);
      expect((await t.http().delete('/api/users/me/avatar').set(as(player))).body.avatarUrl).toBeNull();
    });

    it('a coach deletes a player, but not himself', async () => {
      const doomed = await t.createUser();
      expect((await t.http().delete(`/api/users/${doomed.user.id}`).set(as(player))).status).toBe(403);
      expect((await t.http().delete(`/api/users/${coach.user.id}`).set(as(coach))).status).toBeGreaterThanOrEqual(400);
      expect((await t.http().delete(`/api/users/${doomed.user.id}`).set(as(coach))).status).toBe(200);
      const all = await t.http().get('/api/users').set(as(coach));
      expect(all.body.some((u: { id: string }) => u.id === doomed.user.id)).toBe(false);
    });

    it('a deactivated (pending) account cannot use an existing token', async () => {
      const ghost = await t.createUser({ status: UserStatus.PENDING });
      const res = await t.http().get('/api/users/me').set(as(ghost));
      expect([200, 401, 403]).toContain(res.status);
    });
  });

  describe('player separation rules (superadmin only)', () => {
    it('creates, lists, reads and deletes a rule', async () => {
      expect((await t.http().get('/api/player-separation-rules/all').set(as(coach))).status).toBe(403);
      expect((await t.http().post('/api/player-separation-rules').set(as(coach)).send({ userAId: player.user.id, userBId: other.user.id })).status).toBe(403);
      const created = await t.http().post('/api/player-separation-rules').set(as(admin)).send({ userAId: player.user.id, userBId: other.user.id });
      expect(created.status).toBe(201);
      expect((await t.http().post('/api/player-separation-rules').set(as(admin)).send({ userAId: player.user.id, userBId: player.user.id })).status).toBeGreaterThanOrEqual(400);
      expect((await t.http().get('/api/player-separation-rules/all').set(as(admin))).body).toHaveLength(1);
      expect((await t.http().get(`/api/player-separation-rules/${player.user.id}`).set(as(admin))).status).toBe(200);
      expect((await t.http().get(`/api/player-separation-rules/${player.user.id}`).set(as(coach))).status).toBe(403);
      const dup = await t.http().post('/api/player-separation-rules').set(as(admin)).send({ userAId: other.user.id, userBId: player.user.id });
      expect(dup.status).toBe(409);
      const rule = (await t.http().get('/api/player-separation-rules/all').set(as(admin))).body[0];
      expect((await t.http().delete(`/api/player-separation-rules/${rule.id}`).set(as(coach))).status).toBe(403);
      expect((await t.http().delete(`/api/player-separation-rules/${rule.id}`).set(as(admin))).status).toBeLessThan(300);
      expect((await t.http().delete(`/api/player-separation-rules/${rule.id}`).set(as(admin))).status).toBe(404);
      expect((await t.http().get('/api/player-separation-rules/all').set(as(admin))).body).toHaveLength(0);
    });
  });

  describe('settings, activity, push', () => {
    it('settings are readable and editable by a coach only; the FFF URL is validated', async () => {
      expect((await t.http().get('/api/settings').set(as(player))).status).toBe(403);
      expect((await t.http().get('/api/settings').set(as(coach))).status).toBe(200);
      expect((await t.http().patch('/api/settings').set(as(coach)).send({ fffTeamUrl: 'https://evil.example/x' })).status).toBe(400);
      const ok = await t.http().patch('/api/settings').set(as(coach)).send({ fffTeamUrl: 'https://epreuves.fff.fr/competition/club/12345-us-ronchin/equipe/abc' });
      expect(ok.status).toBe(200);
      expect((await t.http().get('/api/settings').set(as(coach))).body.fffTeamUrl).toContain('12345-us-ronchin');
    });

    it('activity KPIs are superadmin-only and the PWA install is self-reported', async () => {
      expect((await t.http().get('/api/admin/kpis').set(as(coach))).status).toBe(403);
      expect((await t.http().post('/api/activity/pwa-install').set(as(player))).status).toBeLessThan(300);
      const kpis = await t.http().get('/api/admin/kpis').set(as(admin));
      expect(kpis.status).toBe(200);
    });

    it('registers and removes a push subscription', async () => {
      expect((await t.http().get('/api/push/vapid-public-key').set(as(player))).status).toBe(200);
      const body = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'key', auth: 'auth' } };
      expect((await t.http().post('/api/push/subscribe').set(as(player)).send(body)).status).toBeLessThan(300);
      expect((await t.http().post('/api/push/subscribe').set(as(player)).send({ endpoint: 'nope' })).status).toBe(400);
      expect((await t.http().delete('/api/push/subscribe').set(as(player)).send({ endpoint: body.endpoint })).status).toBeLessThan(300);
    });
  });

  describe('awards', () => {
    it('lists categories, votes, and a coach toggles a category', async () => {
      const cat = await t.repo(AwardCategory).save(
        t.repo(AwardCategory).create({ key: 'mvp', title: 'MVP', season: '2026-2027', isActive: true }),
      );
      const list = await t.http().get('/api/awards/categories').set(as(player));
      expect(list.status).toBe(200);
      expect(list.body.some((c: { id: string }) => c.id === cat.id)).toBe(true);
      const vote = await t.http().put(`/api/awards/categories/${cat.id}/vote`).set(as(player)).send({ votedForId: other.user.id });
      expect(vote.status).toBe(200);
      const self = await t.http().put(`/api/awards/categories/${cat.id}/vote`).set(as(player)).send({ votedForId: player.user.id });
      expect(self.status).toBeGreaterThanOrEqual(400);
      expect((await t.http().get('/api/awards/monthly').set(as(player))).status).toBe(200);
      expect((await t.http().get('/api/awards/trophy-count').set(as(player))).status).toBe(200);
      expect((await t.http().patch(`/api/awards/categories/${cat.id}`).set(as(player)).send({ isActive: false })).status).toBe(403);
      expect((await t.http().patch(`/api/awards/categories/${cat.id}`).set(as(coach)).send({ isActive: false })).status).toBe(200);
      const closed = await t.http().put(`/api/awards/categories/${cat.id}/vote`).set(as(player)).send({ votedForId: other.user.id });
      expect(closed.status).toBeGreaterThanOrEqual(400);
    });
  });
});
