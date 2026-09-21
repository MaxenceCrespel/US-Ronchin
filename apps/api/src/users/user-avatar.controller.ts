import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import { UsersService } from './users.service';

/** Serves a member's photo as a real image (see avatarAddress). Deliberately without the JWT
 * guard: an <img> tag cannot send an Authorization header, and the address only works for
 * someone who already knows the member's id — which the squad list is what gives out. */
@Controller('users')
export class UserAvatarController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id/avatar')
  async getAvatar(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const user = await this.usersService.findById(id);
    const match = user.avatarUrl ? /^data:(image\/[a-z+.-]+);base64,(.+)$/s.exec(user.avatarUrl) : null;
    if (!match) throw new NotFoundException('Aucune photo');
    res.set({
      'Content-Type': match[1],
      // The address carries a fingerprint (?v=) of the picture, so it can be cached for good.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(Buffer.from(match[2], 'base64'));
  }
}
