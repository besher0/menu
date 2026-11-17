import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { credentialVersion } from "../../common/security/session-credential";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  private readonly dummyPasswordHash = bcrypt.hash(randomBytes(32).toString("hex"), 10);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwtService: JwtService
  ) {}

  async login(dto: LoginDto) {
    let user;

    try {
      user = await this.prisma.user.findUnique({
        where: { email: dto.email },
        select: {
          id: true, email: true, name: true, role: true, passwordHash: true,
          memberships: {
            where: { restaurant: { deletedAt: null } },
            select: { role: true, restaurant: { select: { id: true, name: true, slug: true } } }
          }
        }
      });
    } catch {
      throw new ServiceUnavailableException("Authentication is temporarily unavailable.");
    }

    const passwordMatches = await bcrypt.compare(dto.password, user?.passwordHash ?? await this.dummyPasswordHash);
    if (!user || !passwordMatches) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      cv: credentialVersion(user.passwordHash)
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      memberships: user.memberships.map((membership) => ({
        role: membership.role,
        restaurant: {
          id: membership.restaurant.id,
          name: membership.restaurant.name,
          slug: membership.restaurant.slug
        }
      }))
    };
  }
}
