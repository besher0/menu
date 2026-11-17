import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { roleHasPermission } from "@menu/shared";
import { AppRequest } from "../../common/app-request";

@Injectable()
export class MediaWriteGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AppRequest>();
    if (["GET","HEAD"].includes(request.method) || request.restaurant && roleHasPermission(request.restaurant.role,"menu.publish")) return true;
    throw new ForbiddenException("Publishing media requires restaurant publishing permission");
  }
}
