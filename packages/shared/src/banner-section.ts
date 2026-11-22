type BannerMenu<Section> = {
  slug?: string;
  pages?: Array<{ isHome?: boolean; sections?: Section[] }>;
};

// Both callers supply this restaurant's published menus, pages and sections in display order.
export function bannerSection<Section extends { type: string }>(menus: BannerMenu<Section>[] = []) {
  const primary = menus.find((menu) => menu.slug === "main-menu");
  const ordered = primary ? [primary, ...menus.filter((menu) => menu !== primary)] : menus;
  for (const menu of ordered) {
    for (const page of menu.pages ?? []) {
      const hero = page.isHome && page.sections?.find((section) => section.type === "HERO");
      if (hero) return hero;
    }
  }
  return undefined;
}
