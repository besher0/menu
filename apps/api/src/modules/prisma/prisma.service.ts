import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    try {
      await this.$connect();
    } catch (error) {
      // Do not write connection details (which may contain Demo credentials) to service logs.
      console.warn("Prisma could not connect during boot. The API will start and retry on requests.");
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
