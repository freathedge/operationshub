import { config as loadEnv } from "dotenv";
import { seedDemoActivity } from "@/lib/domain/seed";

loadEnv({ path: ".env.local" });

seedDemoActivity()
  .then((result) => {
    console.log(
      `Demo activity seeded: ${result.employeesCreated} employees, ${result.tasksCreated} tasks, ${result.requestsCreated} requests created (0 for any of these means it had already run).`
    );
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
