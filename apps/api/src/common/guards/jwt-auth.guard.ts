import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../modules/prisma/prisma.service";
import { matchesCredentialVersion } from "../security/session-credential";
import { AppRequest } from "../app-request";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const authHeader = request.headers.authorization as string | undefined;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }

    const token = authHeader.slice("Bearer ".length);
    let claims: { sub?: unknown; cv?: unknown; exp?: number };
    try {
      claims = await this.jwtService.verifyAsync(token, { algorithms: ["HS256"], maxAge: "7d" });
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
    const subject = claims.sub;
    if (typeof subject !== "string" || !subject || !Number.isSafeInteger(claims.exp)) throw new UnauthorizedException("Invalid token");
    const user = await this.prisma.user.findUnique({
      where: { id: subject }, select: { id: true, email: true, role: true, passwordHash: true }
    });
    if (!user || !matchesCredentialVersion(claims.cv, user.passwordHash)) throw new UnauthorizedException("Invalid token");
    request.user = { sub: user.id, email: user.email, role: user.role };
    return true;
  }
}
