import { GlobalRole, RestaurantRole } from "@menu/shared";
import { Request } from "express";

export type RequestUser = {
  sub: string;
  email: string;
  role: GlobalRole;
};

export type RestaurantContext = {
  id: string;
  slug: string;
  name: string;
  role: RestaurantRole;
};

export type AppRequest = Request & {
  user?: RequestUser;
  restaurant?: RestaurantContext;
};
