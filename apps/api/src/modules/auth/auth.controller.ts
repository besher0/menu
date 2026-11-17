import { Body, Controller, Header, Inject, Post } from "@nestjs/common";
import { LoginDto } from "./dto/login.dto";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("login")
  @Header("Cache-Control", "no-store")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
