import { config as loadEnv } from "dotenv";
import { seedFoundationData, seedWorkflowTemplates } from "@/lib/domain/seed";

loadEnv({ path: ".env.local" });

seedFoundationData()
  .then(async ({ companyId }) => {
    await seedWorkflowTemplates(companyId);
    console.log(`Seeded AlpenTech Industries (${companyId}) and its workflow templates.`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
