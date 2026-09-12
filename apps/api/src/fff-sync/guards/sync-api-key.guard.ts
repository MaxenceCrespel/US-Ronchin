import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Guards the handful of endpoints the local sync script (apps/api/src/local-fff-sync.ts) uses
 * to push data it scraped from a real computer's connection (see that script's own doc
 * comment for why the server can't scrape epreuves.fff.fr itself). A shared secret, not a real
 * user account — the script has no player identity of its own, and creating a dedicated
 * "robot" coach account for it would show up in Effectif's roster like any real person. The
 * secret lives in `FFF_SYNC_API_KEY` (server env) and must match the `X-Sync-Api-Key` header. */
@Injectable()
export class SyncApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('FFF_SYNC_API_KEY');
    if (!expected) {
      throw new UnauthorizedException(
        "Synchro locale désactivée — FFF_SYNC_API_KEY n'est pas configurée sur le serveur.",
      );
    }
    const request = context.switchToHttp().getRequest();
    const provided = request.headers['x-sync-api-key'];
    if (provided !== expected) {
      throw new UnauthorizedException('Clé de synchro invalide.');
    }
    return true;
  }
}
