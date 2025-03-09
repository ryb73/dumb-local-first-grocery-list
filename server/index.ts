import { Server } from "./server.ts";

const server = new Server({
  port: 4000,
  username: "admin",
  password: "password",
  dbPath: "./data.db",
});

// Start server
await server.start();

// Add cleanup on server shutdown
addEventListener("unload", () => {
  server.shutdown();
});
