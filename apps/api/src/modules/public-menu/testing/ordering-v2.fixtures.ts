/** Explicit synthetic fixtures for isolated V2 ordering acceptance. Never seeded automatically. */
import type { ProductConfigurationV2 as Config, ProductConfigurationContextV2 as Context } from "@menu/shared";
export function orderingFixturesV2() {
  const pizza: Config = { schemaVersion: 2, productId: "ordering-pizza", revision: 1, basePrice: "9000", groups: [
    { type: "SIZE", id: "pizza-size", label: "حجم البيتزا", highlightInPriceSummary: true,
      sizes: [{id:"pizza-small",label:"صغير",price:"11000"},{id:"pizza-medium",label:"وسط",price:"15000"},{id:"pizza-large",label:"كبير",price:"21000"}],
      children: [{type:"OPTIONS",id:"bake",label:"تحمير مشترك",min:0,max:1,includedQuantity:0,
        options:[{id:"extra-bake",label:"تحمير إضافي",price:"250",maxQuantity:1}]}] },
    {type:"OPTIONS",id:"extras",label:"إضافات البيتزا",min:1,max:3,includedQuantity:1,highlightInPriceSummary:true,options:[
      {id:"cheese",label:"جبنة Mozzarella",price:"1000",maxQuantity:null,priceBySize:{sizeGroupId:"pizza-size",overrides:{"pizza-small":"1000","pizza-medium":"1500","pizza-large":"0"}},
        children:[{type:"OPTIONS",id:"cheese-finish",label:"نكهة الجبنة",min:1,max:1,includedQuantity:0,options:[
          {id:"herbs",label:"أعشاب",price:"0",maxQuantity:1},{id:"garlic",label:"ثوم",price:"500",maxQuantity:1}]}]},
      {id:"mushroom",label:"فطر",price:"2500",maxQuantity:null},{id:"olive",label:"زيتون",price:"750",maxQuantity:1},
      {id:"unavailable-extra",label:"إضافة غير متاحة",price:"500",maxQuantity:1,available:false} ] }
  ] };
  const drink: Config = {schemaVersion:2,productId:"ordering-drink",revision:1,basePrice:"50000",groups:[
    {type:"SIZE",id:"drink-size",label:"حجم المشروب",sizes:[{id:"drink-small",label:"صغير",price:"9000"},{id:"drink-large",label:"كبير",price:"14000"}],
      children:[{type:"OPTIONS",id:"ice",label:"الثلج",min:0,max:1,includedQuantity:0,options:[{id:"less-ice",label:"ثلج قليل",price:"1000",maxQuantity:1}]}]}]};
  const custom: Config = {schemaVersion:2,productId:"ordering-ordinary",revision:1,basePrice:"0",groups:[
    {type:"SIZE",id:"custom-size",label:"الحجم المخصص",sizes:[{id:"custom-small",label:"صغير مخصص",price:"600"},{id:"custom-large",label:"كبير مخصص",price:"900"}]}]};
  const combo: Config = {schemaVersion:2,productId:"ordering-combo",revision:1,basePrice:"1000",groups:[
    {type:"OPTIONS",id:"components",label:"مكونات العرض",min:1,max:null,includedQuantity:0,highlightInPriceSummary:true,options:[
      {id:"original-drink",label:"مشروب ORIGINAL",price:"3000",maxQuantity:1,linkedProduct:{sourceProductId:drink.productId,mode:"ORIGINAL",originalPriceOverrides:{
        "drink-small":{price:"1500"},"drink-large":{price:"2000"},"less-ice":{price:"0"}}}},
      {id:"custom-component",label:"مكوّن CUSTOM",price:"500",maxQuantity:null,linkedProduct:{sourceProductId:custom.productId,mode:"CUSTOM",customConfiguration:custom},
        children:[{type:"OPTIONS",id:"unit-sauce",label:"صوص هذه الوحدة",min:0,max:1,includedQuantity:0,options:[
          {id:"bbq",label:"صوص BBQ",price:"250",maxQuantity:1,children:[{type:"OPTIONS",id:"spice",label:"حدة الصوص",min:1,max:1,includedQuantity:0,
            options:[{id:"mild",label:"خفيف",price:"0",maxQuantity:1}]}]}]}]}],
      children:[{type:"OPTIONS",id:"shared-gift",label:"إضافة مشتركة",min:0,max:null,includedQuantity:1,
        options:[{id:"gift",label:"هدية العرض",price:"100",maxQuantity:null}]}]},
    {type:"OPTIONS",id:"anonymous",label:"مجموعة تقنية لا تظهر",hidePublicLabel:true,min:1,max:1,includedQuantity:0,
      options:[{id:"wrap",label:"تغليف",price:"0",maxQuantity:1,highlightInPriceSummary:true}]}]};
  return {pizza,drink,combo,custom,ordinary:{id:custom.productId,name:"منتج عادي",price:"200"}};
}
export function orderingContextV2(currency="SYP",catalogId="ordering-restaurant"): Context {
  const {drink,custom}=orderingFixturesV2();
  return {catalogId,currency,linkedProducts:new Map([drink,custom].map(configuration=>[configuration.productId,{
    productId:configuration.productId,catalogId,configuration,available:true,orderable:true}]))};
}
