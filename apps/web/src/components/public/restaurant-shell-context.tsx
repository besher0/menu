"use client";

import { createContext, useContext } from "react";
import type { RestaurantConfigurationCache } from "./restaurant-shell-model";

export type RestaurantShellContextValue = {
  navigate(href: string, replace?: boolean): boolean;
  configurations: RestaurantConfigurationCache;
  holdSnapshot(): () => void;
};
export const RestaurantShellContext = createContext<RestaurantShellContextValue | null>(null);
export const useRestaurantShell = () => useContext(RestaurantShellContext);
