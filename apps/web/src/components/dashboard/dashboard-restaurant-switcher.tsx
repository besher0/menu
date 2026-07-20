"use client";

import { useEffect, useState } from "react";
import { Store } from "lucide-react";
import { API_URL } from "@/lib/client-api";
import { authHeaders, getBrowserSession, getStoredRestaurant, setStoredRestaurant } from "@/lib/session";

type RestaurantOption = {
  id: string;
  name: string;
  slug: string;
};

type ApiResponse<T> = {
  data: T;
  message?: string;
};

export function DashboardRestaurantSwitcher() {
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    const session = getBrowserSession();
    const stored = getStoredRestaurant();
    const params = new URLSearchParams(window.location.search);
    const queryId = params.get("restaurantId");
    const querySlug = params.get("restaurantSlug");
    const queryName = params.get("restaurantName") ?? undefined;

    if (queryId && querySlug) {
      setStoredRestaurant({ id: queryId, slug: querySlug, name: queryName });
      setSelectedId(queryId);
    } else if (stored?.id) {
      setSelectedId(stored.id);
    }

    async function loadRestaurants() {
      const memberships = session?.memberships.map((membership) => membership.restaurant) ?? [];

      if (session?.user.role !== "SUPER_ADMIN") {
        setRestaurants(memberships);
        if (!queryId && !stored?.id && memberships[0]) {
          setSelectedId(memberships[0].id);
          setStoredRestaurant(memberships[0]);
        }
        return;
      }

      try {
        const response = await fetch(`${API_URL}/admin/restaurants`, {
          headers: authHeaders(),
          cache: "no-store"
        });
        const payload = (await response.json().catch(() => null)) as ApiResponse<RestaurantOption[]> | null;
        setRestaurants(response.ok ? payload?.data ?? memberships : memberships);
      } catch {
        setRestaurants(memberships);
      }
    }

    void loadRestaurants();
  }, []);

  function switchRestaurant(id: string) {
    const restaurant = restaurants.find((item) => item.id === id);
    if (!restaurant) return;

    setStoredRestaurant(restaurant);
    setSelectedId(id);

    const params = new URLSearchParams(window.location.search);
    params.set("restaurantId", restaurant.id);
    params.set("restaurantSlug", restaurant.slug);
    params.set("restaurantName", restaurant.name);
    window.location.assign(`${window.location.pathname}?${params.toString()}`);
  }

  if (restaurants.length <= 1) {
    return null;
  }

  return (
    <label className="dashboard-restaurant-switcher">
      <Store size={18} />
      <span>المطعم</span>
      <select value={selectedId} onChange={(event) => switchRestaurant(event.target.value)}>
        <option value="" disabled>
          اختر مطعم
        </option>
        {restaurants.map((restaurant) => (
          <option key={restaurant.id} value={restaurant.id}>
            {restaurant.name}
          </option>
        ))}
      </select>
    </label>
  );
}
