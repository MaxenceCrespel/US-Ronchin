import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ActivityTrackingService } from './activity-tracking.service';

/** Runs after guards (so `request.user` is already populated when the route is
 * authenticated), records activity without ever delaying or failing the real request. */
@Injectable()
export class ActivityTrackingInterceptor implements NestInterceptor {
  constructor(private readonly activityTrackingService: ActivityTrackingService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (user) {
      this.activityTrackingService.recordActivity(user.id).catch(() => {});
    }
    return next.handle();
  }
}
