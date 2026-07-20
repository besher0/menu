import { ABO_MALEK_THEME, ThemeSettings } from "./theme";

export type DemoCategory = {
  slug: string;
  name: string;
  description: string;
  count: number;
  color: string;
  imageUrl: string;
};

export type DemoProduct = {
  slug: string;
  name: string;
  categorySlug: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  featured?: boolean;
  new?: boolean;
  popular?: boolean;
  ingredients: string[];
  nutrition: {
    calories: string;
    protein: string;
    weight: string;
    spice: string;
  };
};

export type DemoRestaurant = {
  slug: string;
  name: string;
  type: string;
  city: string;
  country: string;
  whatsappPhone: string;
  logoUrl: string;
  heroImageUrl: string;
  theme: ThemeSettings;
  categories: DemoCategory[];
  products: DemoProduct[];
};

export const ABO_MALEK_RESTAURANT: DemoRestaurant = {
  slug: "abo-malek",
  name: "أبو مالك",
  type: "وجبات",
  city: "حلب",
  country: "سوريا",
  whatsappPhone: "963933333333",
  logoUrl: "/assets/brand/abo-malek-logo.png",
  heroImageUrl: "/assets/brand/abo-malek-splash.png",
  theme: ABO_MALEK_THEME,
  categories: [
    {
      slug: "all",
      name: "الكل",
      description: "اختيارات اليوم",
      count: 78,
      color: "#f59e0b",
      imageUrl: "/assets/public/categories-burgers.png"
    },
    {
      slug: "shawarma",
      name: "شاورما",
      description: "شاورما على أصولها",
      count: 8,
      color: "#bd1717",
      imageUrl: "/assets/public/categories-shawarma.png"
    },
    {
      slug: "burger",
      name: "برغر",
      description: "برغر بطعم مختلف",
      count: 23,
      color: "#d5902b",
      imageUrl: "/assets/public/menu-products.png"
    },
    {
      slug: "appetizers",
      name: "مقبلات",
      description: "إضافات مميزة",
      count: 12,
      color: "#064e57",
      imageUrl: "/assets/public/menu-categories.png"
    },
    {
      slug: "drinks",
      name: "مشروبات",
      description: "مشروبات منعشة",
      count: 33,
      color: "#115e59",
      imageUrl: "/assets/public/menu-home.png"
    }
  ],
  products: [
    {
      slug: "kranshy-burger",
      name: "كرانشي برغر",
      categorySlug: "burger",
      description: "برغر كريسبي مقلي بانيه كرانشي مع بطاطا وجبنة وفطر",
      price: 340,
      currency: "ل.س",
      imageUrl: "/assets/public/product-detail.png",
      featured: true,
      popular: true,
      ingredients: ["زنجر", "جبنة", "فطر", "مايونيز", "بطاطا"],
      nutrition: {
        calories: "متوسط",
        protein: "صحن",
        weight: "200 mg",
        spice: "حار"
      }
    },
    {
      slug: "banieh-meal",
      name: "وجبة بانيه",
      categorySlug: "shawarma",
      description: "دجاج، بطاطا، ثوم، مخلل",
      price: 340,
      currency: "ل.س",
      imageUrl: "/assets/public/menu-products.png",
      featured: true,
      popular: true,
      ingredients: ["دجاج", "بطاطا", "ثوم", "مخلل"],
      nutrition: {
        calories: "متوسط",
        protein: "دجاج",
        weight: "250 mg",
        spice: "خفيف"
      }
    },
    {
      slug: "zalzal-chicken",
      name: "زلزال تشكن",
      categorySlug: "burger",
      description: "دبل تشكن، بطاطا، مشروب",
      price: 650,
      currency: "ل.س",
      imageUrl: "/assets/public/menu-home.png",
      featured: true,
      new: true,
      popular: true,
      ingredients: ["دبل تشكن", "بطاطا", "مشروب"],
      nutrition: {
        calories: "مرتفع",
        protein: "دجاج",
        weight: "350 mg",
        spice: "حار"
      }
    },
    {
      slug: "bashamel",
      name: "باشاميل",
      categorySlug: "shawarma",
      description: "دجاج، بطاطا، ثوم، مخلل",
      price: 340,
      currency: "ل.س",
      imageUrl: "/assets/public/menu-list.png",
      popular: true,
      ingredients: ["دجاج", "بطاطا", "ثوم", "مخلل"],
      nutrition: {
        calories: "متوسط",
        protein: "دجاج",
        weight: "220 mg",
        spice: "خفيف"
      }
    }
  ]
};
