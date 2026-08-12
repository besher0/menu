import { describe, expect, it, vi } from "vitest";
import { BuilderService } from "./builder.service";

function createService(prisma: Record<string, any>) {
  return new BuilderService(prisma as any, { canUseFeature: vi.fn(), assertFeature: vi.fn() } as any);
}

describe("BuilderService persistence", () => {
  it("does not recreate deleted sections when a builder page is empty", async () => {
    const prisma = {
      menu: {
        findFirst: vi.fn().mockResolvedValue({
          id: "menu-1",
          name: "Main",
          slug: "main-menu",
          status: "DRAFT",
          pages: [
            {
              id: "page-1",
              title: "Home",
              slug: "home",
              isHome: true,
              status: "DRAFT",
              sortOrder: 0,
              sections: []
            }
          ]
        }),
        create: vi.fn()
      }
    };
    const service = createService(prisma);

    const builder = await service.getBuilder("restaurant-1");

    expect(builder.pages[0].sections).toEqual([]);
    expect(prisma.menu.create).not.toHaveBeenCalled();
  });

  it("does not recreate a deleted HERO section when other sections still exist", async () => {
    const prisma = {
      menu: {
        findFirst: vi.fn().mockResolvedValue({
          id: "menu-1",
          name: "Main",
          slug: "main-menu",
          status: "DRAFT",
          pages: [
            {
              id: "page-1",
              title: "Home",
              slug: "home",
              isHome: true,
              status: "DRAFT",
              sortOrder: 0,
              sections: [
                {
                  id: "section-category",
                  type: "CATEGORY_GRID",
                  sortOrder: 0,
                  isActive: true,
                  settings: { layout: "horizontal-chips" }
                }
              ]
            }
          ]
        }),
        create: vi.fn()
      }
    };
    const service = createService(prisma);

    const builder = await service.getBuilder("restaurant-1");

    expect(builder.pages[0].sections.map((section: { type: string }) => section.type)).toEqual(["CATEGORY_GRID"]);
    expect(prisma.menu.create).not.toHaveBeenCalled();
  });

  it("merges settingsPatch with the latest section settings", async () => {
    const existingBanner = { id: "banner-1", imageUrl: "/banner.jpg", sortOrder: 0, isActive: true };
    const prisma = {
      menuSection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "section-1",
          settings: {
            title: "Old title",
            subtitle: "Keep me",
            adBanners: [existingBanner]
          }
        }),
        update: vi.fn().mockResolvedValue({})
      }
    };
    const service = createService(prisma);

    await service.updateSection("restaurant-1", "section-1", {
      settingsPatch: { title: "Fresh title" }
    });

    expect(prisma.menuSection.update).toHaveBeenCalledWith({
      where: { id: "section-1" },
      data: {
        settings: {
          title: "Fresh title",
          subtitle: "Keep me",
          adBanners: [existingBanner]
        }
      }
    });
  });

  it("keeps newer banner data when an older builder state saves another HERO field", async () => {
    const latestBanner = { id: "banner-new", imageUrl: "/new.jpg", sortOrder: 0, isActive: true };
    const prisma = {
      menuSection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "hero-section",
          settings: {
            title: "Hero",
            adBanners: [latestBanner]
          }
        }),
        update: vi.fn().mockResolvedValue({})
      }
    };
    const service = createService(prisma);

    await service.updateSection("restaurant-1", "hero-section", {
      settingsPatch: { title: "Updated hero" }
    });

    expect(prisma.menuSection.update.mock.calls[0][0].data.settings.adBanners).toEqual([latestBanner]);
  });
});
