export type BrowserSession = {
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

export function getBrowserSession(): BrowserSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem("menu-builder-session");
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as BrowserSession;
  } catch {
    window.localStorage.removeItem("menu-builder-session");
    return null;
  }
}

export function authHeaders(): Record<string, string> {
  const session = getBrowserSession();
  const parsedRestaurant = getStoredRestaurant();

  return {
    ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    ...(parsedRestaurant?.id ? { "x-restaurant-id": parsedRestaurant.id } : {}),
    ...(parsedRestaurant?.slug ? { "x-restaurant-slug": parsedRestaurant.slug } : {})
  };
}

export function getStoredRestaurant(): { slug?: string; id?: string; name?: string } | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem("menu-builder-restaurant");
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as { slug?: string; id?: string; name?: string };
  } catch {
    window.localStorage.removeItem("menu-builder-restaurant");
    return null;
  }
}

export function setStoredRestaurant(restaurant: { id: string; slug: string; name?: string }) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem("menu-builder-restaurant", JSON.stringify(restaurant));
}
