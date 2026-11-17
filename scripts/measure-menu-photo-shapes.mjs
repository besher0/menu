// Runs in the browser against the rendered list and its actual stylesheet.
export async function measurePhotoShapes() {
  const card = document.querySelector(".menu-product-row:not(.card-horizontal-contained)");
  if (!card) throw new Error("Expected a standard menu list row");
  const probe = card.cloneNode(true);
  const photo = document.createElement("img");
  probe.querySelector(".menu-product-image-link").replaceChildren(photo);
  card.after(probe);
  try {
    const heights = [];
    for (const [width, height] of [[320, 212], [240, 240], [180, 320]]) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      photo.src = canvas.toDataURL();
      photo.style.aspectRatio = width + " / " + height;
      await photo.decode();
      heights.push(probe.getBoundingClientRect().height);
    }
    return heights;
  } finally {
    probe.remove();
  }
}
