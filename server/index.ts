import { Server } from "./server.js";

const server = new Server({
  port: 4000,
  username: "admin",
  password: "password",
  dbPath: "./data.db",
});
server.start().catch(console.error);

// Handle shutdown gracefully
process.on("SIGINT", () => {
  console.log("Shutting down server...");
  server.shutdown();
  process.exit(0);
});
