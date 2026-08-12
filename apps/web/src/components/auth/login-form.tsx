"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, Utensils } from "lucide-react";

type LoginResponse = {
  data?: {
    accessToken: string;
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: "SUPER_ADMIN" | "USER";
    };
    memberships: Array<{
      role: string;
      restaurant: {
        id: string;
        name: string;
        slug: string;
      };
    }>;
  };
  message?: string;
  error?: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
const LOGIN_TIMEOUT_MS = 12000;

async function readLoginResponse(response: Response): Promise<LoginResponse> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as LoginResponse;
  } catch {
    return { message: text };
  }
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: controller.signal
      });
      window.clearTimeout(timeout);

      const payload = await readLoginResponse(response);
      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? "تعذر تسجيل الدخول. تأكد من تشغيل الـ API وقاعدة البيانات.");
      }

      const session = payload.data;

      if (!session?.accessToken) {
        throw new Error("رد تسجيل الدخول غير مكتمل.");
      }

      window.localStorage.setItem("menu-builder-session", JSON.stringify(session));
      const firstRestaurant = session.memberships[0]?.restaurant;
      if (firstRestaurant) {
        window.localStorage.setItem("menu-builder-restaurant", JSON.stringify(firstRestaurant));
      }

      router.push(session.user.role === "SUPER_ADMIN" ? "/admin" : "/dashboard");
    } catch (error) {
      setStatus("error");
      const detail = error instanceof DOMException && error.name === "AbortError"
        ? "انتهت مهلة تسجيل الدخول. غالباً قاعدة البيانات لا ترد حالياً."
        : error instanceof Error ? error.message : "حدث خطأ غير متوقع.";
      setMessage(`${detail} تأكد من تشغيل API على ${API_URL} ومن اتصال قاعدة البيانات.`);
    }
  }

  return (
    <div className="login-shell">
      <section className="login-panel">
        <div className="login-brand">
          <span>
            <Utensils size={38} />
          </span>
          <div>
            <h1>Restaurant Menu Builder</h1>
            <p>لوحة إدارة المطاعم والمنيو الذكي</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span>البريد الإلكتروني</span>
            <div>
              <Mail size={20} />
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
            </div>
          </label>

          <label>
            <span>كلمة المرور</span>
            <div>
              <Lock size={20} />
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
            </div>
          </label>

          {message ? <p className="login-error">{message}</p> : null}

          <button type="submit" disabled={status === "loading"}>
            {status === "loading" ? "جار تسجيل الدخول..." : "تسجيل الدخول"}
          </button>
        </form>

      </section>

      <section className="login-preview">
        <img src="/assets/public/menu-home.png" alt="Abo Malek menu preview" />
        <div>
          <b>منيوك جاهز للبناء</b>
          <span>ابدأ بإضافة مطعمك الحقيقي ثم المنتجات والفروع والثيم.</span>
        </div>
      </section>
    </div>
  );
}
