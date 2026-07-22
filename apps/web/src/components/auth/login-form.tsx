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

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@menu.test");
  const [password, setPassword] = useState("password123");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const payload = (await response.json()) as LoginResponse;
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
      const detail = error instanceof Error ? error.message : "حدث خطأ غير متوقع.";
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

        <div className="login-hints">
          <b>حسابات seed</b>
          <span>Super Admin: admin@menu.test / password123</span>
          <span>Owner: owner@abomalek.test / password123</span>
        </div>
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
