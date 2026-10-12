import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwtService: JwtService
  ) {}

  async login(dto: LoginDto) {
    let user;

    try {
      user = await this.prisma.user.findUnique({
        where: { email: dto.email },
        include: {
          memberships: {
            include: {
              restaurant: true
            }
          }
        }
      });
    } catch {
      throw new ServiceUnavailableException("Database is not reachable. Check DATABASE_URL and Neon connectivity.");
    }

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role
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
