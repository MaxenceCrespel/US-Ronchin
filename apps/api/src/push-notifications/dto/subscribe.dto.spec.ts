import { ValidationPipe } from '@nestjs/common';
import { SubscribeDto } from './subscribe.dto';

// Same options as the global pipe in main.ts — forbidNonWhitelisted is what used to turn a
// browser's own PushSubscription.toJSON() into a 400.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const meta = { type: 'body' as const, metatype: SubscribeDto };

const browserPayload = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  expirationTime: null,
  keys: { p256dh: 'BOr...key', auth: 'auth-secret' },
};

describe('SubscribeDto', () => {
  it('accepts a subscription exactly as the browser serializes it', async () => {
    await expect(pipe.transform(browserPayload, meta)).resolves.toBeInstanceOf(
      SubscribeDto,
    );
  });

  it('accepts a payload without expirationTime', async () => {
    const withoutExpiration = {
      endpoint: browserPayload.endpoint,
      keys: browserPayload.keys,
    };
    await expect(
      pipe.transform(withoutExpiration, meta),
    ).resolves.toBeInstanceOf(SubscribeDto);
  });

  it('still rejects missing keys', async () => {
    await expect(
      pipe.transform({ endpoint: browserPayload.endpoint }, meta),
    ).rejects.toThrow();
  });
});
