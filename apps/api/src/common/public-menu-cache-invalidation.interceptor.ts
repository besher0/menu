import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { invalidatePublicMenuCache } from "../modules/public-menu/public-menu.cache";

@Injectable()
export class PublicMenuCacheInvalidationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ method?: string; originalUrl?: string }>();
    const method = request.method?.toUpperCase();
    const path = (request.originalUrl ?? "").split("?")[0];
    // Analytics, authentication and order submissions do not change public menu content.
    const irrelevant = /\/(track|analytics|auth|orders)(\/|$)/.test(path);
    const mutates = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
    return next.handle().pipe(tap({ next: () => {
      if (mutates && !irrelevant) invalidatePublicMenuCache();
    } }));
  }
}
