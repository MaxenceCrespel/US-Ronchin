import { bearer, createTestApp, TestApp } from './test-utils/test-app';
import { UserRole } from './users/entities/user.entity';

describe('integration harness', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('serves an authenticated request through the real stack', async () => {
    const { token } = await t.createUser({ role: UserRole.COACH });
    const res = await t.http().get('/api/users/me').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('COACH');
  });

  it('rejects an unauthenticated request', async () => {
    expect((await t.http().get('/api/users/me')).status).toBe(401);
  });
});
