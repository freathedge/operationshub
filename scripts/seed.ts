import { config as loadEnv } from "dotenv";
import { seedFoundationData } from "@/lib/domain/seed";

loadEnv({ path: ".env.local" });

seedFoundationData().then(
  ({ companyId }) => {
    console.log(`Seeded AlpenTech Industries (${companyId}).`);
    process.exit(0);
  },
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
