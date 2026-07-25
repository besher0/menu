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

export type StoredRestaurant = { slug?: string; id?: string; name?: string };

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
  const parsedRestaurant = resolveStoredRestaurant(session);

  return {
    ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    ...(parsedRestaurant?.id ? { "x-restaurant-id": parsedRestaurant.id } : {})
  };
}

export function adminAuthHeaders(): Record<string, string> {
  const session = getBrowserSession();

  return {
    ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {})
  };
}

export function getStoredRestaurant(): StoredRestaurant | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem("menu-builder-restaurant");
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredRestaurant;
  } catch {
    window.localStorage.removeItem("menu-builder-restaurant");
    return null;
  }
}

export function canUseRestaurant(restaurant: StoredRestaurant | null | undefined, session = getBrowserSession()) {
  if (!restaurant?.id && !restaurant?.slug) {
    return false;
  }

  if (!session || session.user.role === "SUPER_ADMIN") {
    return true;
  }

  return session.memberships.some((membership) => {
    const membershipRestaurant = membership.restaurant;
    return (
      (restaurant.id && membershipRestaurant.id === restaurant.id) ||
      (restaurant.slug && membershipRestaurant.slug === restaurant.slug)
    );
  });
}

export function resolveStoredRestaurant(session = getBrowserSession()): StoredRestaurant | null {
  const stored = getStoredRestaurant();

  if (canUseRestaurant(stored, session)) {
    return stored;
  }

  const fallback = session?.memberships[0]?.restaurant ?? null;
  if (fallback) {
    setStoredRestaurant(fallback);
  } else if (stored && typeof window !== "undefined" && session?.user.role !== "SUPER_ADMIN") {
    window.localStorage.removeItem("menu-builder-restaurant");
  }

  return fallback;
}

export function setStoredRestaurant(restaurant: { id: string; slug: string; name?: string }) {
  if (typeof window === "undefined") {
    return false;
  }

  if (!canUseRestaurant(restaurant)) {
    return false;
  }

  window.localStorage.setItem("menu-builder-restaurant", JSON.stringify(restaurant));
  return true;
}
