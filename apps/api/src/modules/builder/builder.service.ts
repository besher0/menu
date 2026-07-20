import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { defaultSectionSettings } from "@menu/shared";
import { Prisma } from "@prisma/client";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PrismaService } from "../prisma/prisma.service";
import { AddSectionDto } from "./dto/add-section.dto";
import { ReorderSectionsDto } from "./dto/reorder-sections.dto";
import { UpdateSectionDto } from "./dto/update-section.dto";

@Injectable()
export class BuilderService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FeatureFlagsService) private readonly featureFlags: FeatureFlagsService
  ) {}

  async getBuilder(restaurantId: string) {
    const menu = await this.ensureMenu(restaurantId);
    return this.serializeMenu(menu);
  }

  async addSection(restaurantId: string, dto: AddSectionDto) {
    await this.assertPageBelongsToRestaurant(restaurantId, dto.pageId);
    const maxSort = await this.prisma.menuSection.aggregate({
      where: { pageId: dto.pageId },
      _max: { sortOrder: true }
    });

    const section = await this.prisma.menuSection.create({
      data: {
        pageId: dto.pageId,
        type: dto.type,
        sortOrder: dto.sortOrder ?? (maxSort._max.sortOrder ?? -1) + 1,
        settings: defaultSectionSettings(dto.type) as Prisma.InputJsonValue,
        isActive: true
      }
    });

    return section;
  }

  async updateSection(restaurantId: string, id: string, dto: UpdateSectionDto) {
    await this.assertSectionBelongsToRestaurant(restaurantId, id);

    return this.prisma.menuSection.update({
      where: { id },
      data: {
        ...(dto.settings ? { settings: dto.settings as Prisma.InputJsonValue } : {}),
        ...(typeof dto.isActive === "boolean" ? { isActive: dto.isActive } : {}),
        ...(typeof dto.sortOrder === "number" ? { sortOrder: dto.sortOrder } : {})
      }
    });
  }

  async reorderSections(restaurantId: string, dto: ReorderSectionsDto) {
    for (const section of dto.sections) {
      await this.assertSectionBelongsToRestaurant(restaurantId, section.id);
    }

    await this.prisma.$transaction(
      dto.sections.map((section) =>
        this.prisma.menuSection.update({
          where: { id: section.id },
          data: { sortOrder: section.sortOrder }
        })
      )
    );

    return { updated: dto.sections.length };
  }

  async deleteSection(restaurantId: string, id: string) {
    await this.assertSectionBelongsToRestaurant(restaurantId, id);
    await this.prisma.menuSection.delete({ where: { id } });
    return { deleted: true };
  }

  async publish(restaurantId: string, userId?: string) {
    const canDraftPublish = await this.featureFlags.canUseFeature(restaurantId, "DRAFT_PUBLISH");
    if (!canDraftPublish) {
      throw new ForbiddenException({
        statusCode: 403,
        error: "FEATURE_LOCKED",
        message: "Draft publish requires an enabled feature",
        featureKey: "DRAFT_PUBLISH"
      });
    }

    const menu = await this.ensureMenu(restaurantId);
    const homePage = menu.pages.find((page) => page.isHome);
    if (!homePage) {
      throw new ForbiddenException("Home page is required before publishing");
    }

    const nextVersion = await this.prisma.menuVersion.count({ where: { menuId: menu.id } });

    await this.prisma.$transaction([
      this.prisma.menu.update({ where: { id: menu.id }, data: { status: "PUBLISHED" } }),
      ...menu.pages.map((page) =>
        this.prisma.menuPage.update({ where: { id: page.id }, data: { status: "PUBLISHED" } })
      ),
      this.prisma.menuVersion.create({
        data: {
          menuId: menu.id,
          version: nextVersion + 1,
          snapshot: this.serializeMenu(menu) as Prisma.InputJsonValue,
          publishedBy: userId,
          note: "Published from dashboard builder"
        }
      })
    ]);

    return { published: true, version: nextVersion + 1 };
  }

  private async ensureMenu(restaurantId: string) {
    const existing = await this.prisma.menu.findFirst({
      where: { restaurantId },
      include: {
        pages: {
          orderBy: { sortOrder: "asc" },
          include: {
            sections: { orderBy: { sortOrder: "asc" } }
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    if (existing) {
      return existing;
    }

    const menu = await this.prisma.menu.create({
      data: {
        restaurantId,
        name: "القائمة الرئيسية",
        slug: "main-menu",
        status: "DRAFT",
        pages: {
          create: {
            title: "الرئيسية",
            slug: "home",
            isHome: true,
            sortOrder: 0,
            status: "DRAFT",
            sections: {
              create: [
                {
                  type: "HERO",
                  sortOrder: 0,
                  settings: defaultSectionSettings("HERO") as Prisma.InputJsonValue
                },
                {
                  type: "CATEGORY_GRID",
                  sortOrder: 1,
                  settings: defaultSectionSettings("CATEGORY_GRID") as Prisma.InputJsonValue
                },
                {
                  type: "FEATURED_PRODUCTS",
                  sortOrder: 2,
                  settings: defaultSectionSettings("FEATURED_PRODUCTS") as Prisma.InputJsonValue
                }
              ]
            }
          }
        }
      },
      include: {
        pages: {
          orderBy: { sortOrder: "asc" },
          include: {
            sections: { orderBy: { sortOrder: "asc" } }
          }
        }
      }
    });

    return menu;
  }

  private serializeMenu(menu: any) {
    return {
      id: menu.id,
      name: menu.name,
      slug: menu.slug,
      status: menu.status,
      pages: menu.pages.map((page: any) => ({
        id: page.id,
        title: page.title,
        slug: page.slug,
        isHome: page.isHome,
        status: page.status,
        sortOrder: page.sortOrder,
        sections: page.sections.map((section: any) => ({
          id: section.id,
          type: section.type,
          sortOrder: section.sortOrder,
          isActive: section.isActive,
          settings: section.settings
        }))
      }))
    };
  }

  private async assertPageBelongsToRestaurant(restaurantId: string, pageId: string) {
    const page = await this.prisma.menuPage.findFirst({
      where: { id: pageId, menu: { restaurantId } }
    });
    if (!page) {
      throw new NotFoundException("Page not found");
    }
  }

  private async assertSectionBelongsToRestaurant(restaurantId: string, sectionId: string) {
    const section = await this.prisma.menuSection.findFirst({
      where: { id: sectionId, page: { menu: { restaurantId } } }
    });
    if (!section) {
      throw new NotFoundException("Section not found");
    }
  }
}
