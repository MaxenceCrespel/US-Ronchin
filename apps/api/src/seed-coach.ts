import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AppModule } from './app.module';
import { UsersService } from './users/users.service';
import { PlayerSubPosition, PreferredFoot, UserRole } from './users/entities/user.entity';

const SALT_ROUNDS = 10;

async function seedCoach() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const configService = app.get(ConfigService);
  const usersService = app.get(UsersService);

  const email = configService.get<string>('SEED_COACH_EMAIL');
  const password = configService.get<string>('SEED_COACH_PASSWORD');
  const firstName = configService.get<string>('SEED_COACH_FIRST_NAME', 'Coach');
  const lastName = configService.get<string>('SEED_COACH_LAST_NAME', 'Ronchin');

  if (!email || !password) {
    console.error(
      'Définis SEED_COACH_EMAIL et SEED_COACH_PASSWORD (dans .env ou en variable d\'environnement) avant de lancer ce script.',
    );
    await app.close();
    process.exit(1);
  }

  const existing = await usersService.findByEmail(email);
  if (existing) {
    console.log(`Un compte existe déjà pour ${email} (id: ${existing.id}).`);
    await app.close();
    return;
  }

  const pending = await usersService.createPendingUser({
    email,
    firstName,
    lastName,
    isLicensed: true,
  });
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await usersService.setPassword(pending.id, passwordHash);
  await usersService.adminUpdate(pending.id, {
    role: UserRole.COACH,
    // Mandatory profile fields — without these, /complete-profile would block this
    // account from reaching anywhere else in the app (see RequireAuth.tsx), which
    // breaks any automated flow (E2E tests, first-login smoke checks) using it.
    positions: [PlayerSubPosition.CENTER_MIDFIELDER],
    preferredFoot: PreferredFoot.RIGHT,
    birthDate: '1985-01-01',
    phone: '0600000000',
    heightCm: 180,
    weightKg: 78,
    // Without this, the onboarding tour auto-opens on first login (see
    // OnboardingTour.tsx) and swaps in fake demo data over the real page —
    // breaks any automated flow expecting the real home page content.
    hasSeenOnboarding: true,
  });

  console.log(`Compte coach créé pour ${email}.`);
  await app.close();
}

seedCoach().catch((error) => {
  console.error(error);
  process.exit(1);
});
