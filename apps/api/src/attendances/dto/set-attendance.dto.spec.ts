import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MAX_GUESTS_PER_PLAYER, SetAttendanceDto } from './set-attendance.dto';

const check = (body: unknown) => validate(plainToInstance(SetAttendanceDto, body));

describe('SetAttendanceDto guests', () => {
  it('accepts a normal list', async () => {
    expect(await check({ status: 'PRESENT', guests: [{ firstName: 'Karim', lastName: 'B' }] })).toHaveLength(0);
  });

  it('rejects a guest without a first name', async () => {
    expect(await check({ status: 'PRESENT', guests: [{ firstName: '' }] })).not.toHaveLength(0);
    expect(await check({ status: 'PRESENT', guests: [{ firstName: '   ' }] })).not.toHaveLength(0);
  });

  it('rejects an absurdly long guest list', async () => {
    const guests = Array.from({ length: MAX_GUESTS_PER_PLAYER + 1 }, () => ({ firstName: 'x' }));
    expect(await check({ status: 'PRESENT', guests })).not.toHaveLength(0);
  });

  it('accepts the maximum', async () => {
    const guests = Array.from({ length: MAX_GUESTS_PER_PLAYER }, () => ({ firstName: 'x' }));
    expect(await check({ status: 'PRESENT', guests })).toHaveLength(0);
  });
});
