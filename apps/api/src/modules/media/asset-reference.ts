import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export async function approvedModelFormat(db: Pick<PrismaService, "mediaAsset">, restaurantId: string, url: string) {
  const verified = await db.mediaAsset.findFirst({
    where: { restaurantId, url, type:"MODEL_3D", provider:"CLOUDINARY", validatedFormat:{in:["GLB","GLTF"]} },
    select: { validatedFormat:true }
  });
  if (verified?.validatedFormat !== "GLB" && verified?.validatedFormat !== "GLTF") {
    throw new BadRequestException("Choose a validated model uploaded by this restaurant");
  }
  return verified.validatedFormat;
}

export async function allowedImageReference(db: Pick<PrismaService, "mediaAsset">, restaurantId: string, raw: string) {
  if (/^\/assets\/(?:public|brand)\/(?:[\w-]+\/)*[\w-]+\.(png|jpe?g|webp|gif)$/i.test(raw)) return;
  let url: URL;
  try { url = raw.startsWith("/uploads/") ? new URL(raw,"https://local.invalid") : new URL(raw); }
  catch { throw new BadRequestException("Invalid media URL"); }
  const managed = url.pathname.startsWith("/uploads/") || url.hostname === "res.cloudinary.com";
  if (!["http:","https:"].includes(url.protocol) || url.username || url.password ||
      !managed && url.protocol !== "https:") throw new BadRequestException("Invalid media URL");
  if (!managed && !/\.svg$/i.test(url.pathname)) return;
  const asset = await db.mediaAsset.findFirst({ where:{restaurantId,url:raw,type:{in:["IMAGE","VR_PANORAMA","PNG_ICON","SVG_ICON"]}},
    select:{type:true,validatedFormat:true} });
  if (!asset || ((asset.type === "SVG_ICON" || /\.svg$/i.test(url.pathname)) && asset.validatedFormat !== "SVG"))
    throw new BadRequestException("Media asset unavailable");
}
