import { BadRequestException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";

/** Append within one tenant/category, in the caller's serializable write transaction. */
export async function nextProductSortOrder(tx:Prisma.TransactionClient,restaurantId:string,categoryId:string|null):Promise<number>{
 const result=await tx.product.aggregate({where:{restaurantId,categoryId,deletedAt:null},_max:{sortOrder:true}});
 const next=result._max.sortOrder===null?0:result._max.sortOrder+1;
 if(!Number.isSafeInteger(next)||next>2147483647)throw new BadRequestException("Category ordering limit reached");
 return next;
}
/** Retry only serializable write conflicts; no partial category/product insertion is committed. */
export async function productOrderTransaction<T>(client:PrismaClient,work:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
 for(let attempt=0;;attempt++){
  try{return await client.$transaction(work,{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}
  catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2034"&&attempt<2)continue;throw error}
 }
}
