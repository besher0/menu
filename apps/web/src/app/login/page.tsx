import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "تسجيل الدخول | Restaurant Menu Builder"
};

export default function LoginPage() {
  return <LoginForm />;
}
