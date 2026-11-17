import { describe, expect, it, vi } from "vitest";
import { ProductsImportService } from "./products-import.service";

describe("workbook export media", () => {
  it("omits unregistered references before any storage or network read", async () => {
    const lookup = vi.fn().mockResolvedValue(null);
    const exporter = new ProductsImportService({mediaAsset:{findFirst:lookup}} as never, {} as never, {} as never, {} as never, {} as never);
    const read = vi.spyOn(exporter as any, "readImageBuffer");
    const url = "https://example.invalid/menu.jpg";
    expect(await exporter["loadExportImages"]("tenant", [url], 4096)).toEqual([]);
    expect(lookup.mock.calls[0][0].where).toMatchObject({restaurantId:"tenant",url});
    expect(read).not.toHaveBeenCalled();
  });
  it("does not download arbitrary remote images or follow redirects when embedding", async () => {
    const exporter = new ProductsImportService({} as never, {} as never, {} as never, {} as never, {} as never);
    const net = vi.spyOn(globalThis,"fetch");
    vi.stubEnv("CLOUDINARY_CLOUD_NAME","fixture");
    try {
      const asset = {provider:"CLOUDINARY",filename:"plate.jpg"};
      expect(await exporter["readImageBuffer"]("https://example.invalid/plate.jpg",asset,16)).toBeNull();
      expect(net).not.toHaveBeenCalled();
      net.mockResolvedValue(new Response(new Uint8Array(17),{headers:{"content-type":"image/jpeg"}}));
      expect(await exporter["readImageBuffer"]("https://res.cloudinary.com/fixture/image/upload/plate.jpg",asset,16)).toBeNull();
      expect(net).toHaveBeenCalledWith(expect.any(URL),expect.objectContaining({redirect:"error"}));
    } finally { net.mockRestore(); vi.unstubAllEnvs(); }
  });
});
