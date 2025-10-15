import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

db.$connect()
  .then(() => {
    console.log("Database connected successfully");
  })
  .catch((error) => {
    console.error("Database connection error:", error);
  });

export default db;
