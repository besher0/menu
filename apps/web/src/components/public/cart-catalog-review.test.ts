import { describe, expect, it } from "vitest";
import { acceptLegacyCatalogPrice, cartCatalogReview, putLegacyCartItem, restoreCartStorage, serializeCartStorage } from "./cart-model";
import type { PublicProduct } from "@/lib/api";
const product: PublicProduct = {id:"current-id",slug:"pizza",name:"Pizza",currency:"SYP",basePrice:200,basePriceExact:"200"};
const cart=()=>putLegacyCartItem([],product,200,null,1);
describe("persisted ordinary cart catalog identity",()=>{
 it("keeps valid identity across reload",()=>{const restored=restoreCartStorage(serializeCartStorage(cart(),"restaurant"),"restaurant","SYP");expect(restored[0].productId).toBe(product.id);expect(cartCatalogReview(restored,[product]).size).toBe(0)});
 it("marks deleted products without deleting the cart",()=>{const items=cart();expect(cartCatalogReview(items,[]).size).toBe(1);expect(items.length).toBe(1)});
 it("does not substitute a new product sharing the slug and price",()=>{expect(cartCatalogReview(cart(),[{...product,id:"replacement"}]).get("legacy:pizza")).toBe("IDENTITY_CHANGED")});
 it("marks pre-identity saved carts for explicit review",()=>{const items=cart();delete items[0].productId;expect(cartCatalogReview(items,[product]).size).toBe(1)});
 it("detects changed prices",()=>{expect(cartCatalogReview(cart(),[{...product,basePrice:300,basePriceExact:"300"}]).get("legacy:pizza")).toBe("PRICE_CHANGED")});
 it("does not mark the valid part of a mixed cart",()=>{const other={...product,id:"other",slug:"other"};const items=putLegacyCartItem(cart(),other,200,null,1);expect([...cartCatalogReview(items,[product]).keys()]).toEqual(["legacy:other"])});
 it("rejects currency identity changes",()=>{expect(cartCatalogReview(cart(),[{...product,currency:"USD"}]).size).toBe(1)});
});

describe("ordinary price acceptance",()=>{
 it("does not accept a price while editing quantity and keeps notes",()=>{
  const items=cart();items[0].note="Keep note";const changed={...product,basePrice:300,basePriceExact:"300"};
  const edited=putLegacyCartItem(items,changed,300,null,2);
  expect(cartCatalogReview(edited,[changed]).get(edited[0].lineId)).toBe("PRICE_CHANGED");
  const accepted=acceptLegacyCatalogPrice(edited,edited[0].lineId,[changed]);
  expect(accepted[0]).toMatchObject({productId:product.id,quantity:2,note:"Keep note",priceText:"300"});
  expect(cartCatalogReview(accepted,[changed]).size).toBe(0);
 });
 it("never rebinds a replaced ID through price acceptance",()=>{
  const items=cart();expect(acceptLegacyCatalogPrice(items,items[0].lineId,[{...product,id:"replacement",basePrice:300}])).toEqual(items);
 });
});
