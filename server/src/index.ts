import http from "http";
import { app } from "./app.js";
import { env } from "./config.js";
import { prisma } from "./db.js";
import { initWebsocket } from "./websocket.js";

const server = http.createServer(app);
initWebsocket(server);

server.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});

const shutdown = async () => {
  await prisma.$disconnect();
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
