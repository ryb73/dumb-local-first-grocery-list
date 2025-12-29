import { defined } from "@ryb73/super-duper-parakeet/lib/src/type-checks.js";
import { config } from "dotenv-flow";

console.log(`Loading config. NODE_ENV=${String(process.env[`NODE_ENV`])}`);

config();

export const dataDir = defined(process.env[`DATA_DIR`], `missing DATA_DIR`);

export const port =
  process.env[`PORT`] != null ? Number.parseInt(process.env[`PORT`], 10) : 3001;

export const allowedOrigins = process.env[`ALLOWED_ORIGINS`]?.split(`,`) ?? [
  `http://localhost:3000`,
];
