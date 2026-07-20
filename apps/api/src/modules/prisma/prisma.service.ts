import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    try {
      await this.$connect();
    } catch (error) {
      console.warn("Prisma could not connect during boot. The API will start and retry on requests.", error);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
