import Image from "next/image";
import { Home, Percent, Utensils } from "lucide-react";

export function MobilePreview() {
  return (
    <div className="mobile-preview">
      <div className="phone-status">
        <span>9:41</span>
        <span>●●●</span>
      </div>
      <div className="preview-header">
        <Image src="/assets/brand/abo-malek-logo.png" alt="Restaurant logo preview" width={34} height={34} />
        <span>اختار أحد الأصناف وتصفح..</span>
        <button>☰</button>
      </div>
      <div className="preview-chips">
        <span>عشاق الجبنة</span>
        <span>جوعان كتير</span>
        <span>سريع وخفيف</span>
      </div>
      <Image
        className="preview-hero"
        src="/assets/public/menu-home.png"
        alt="Preview hero"
        width={330}
        height={190}
      />
      <h3>الأكثر طلباً</h3>
      <div className="preview-products">
        {["زلزال تشكن", "كرانشي برغر", "وجبة بانيه"].map((item) => (
          <article key={item}>
            <Image src="/assets/public/menu-products.png" alt={item} width={92} height={64} />
            <b>{item}</b>
            <span>340 ل.س</span>
          </article>
        ))}
      </div>
      <div className="preview-bottom-nav">
        <span>
          <Percent size={16} />
          العروض
        </span>
        <span>
          <Utensils size={16} />
          القائمة
        </span>
        <span className="active">
          <Home size={16} />
          الرئيسية
        </span>
      </div>
    </div>
  );
}
