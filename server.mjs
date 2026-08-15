import { pathToFileURL } from "node:url";
import process from "node:process";
import { createSivitaHubServer } from "./src/app-server.mjs";

export { createSivitaHubServer } from "./src/app-server.mjs";

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectRun) {
  const host = process.env.HOST || "127.0.0.1";
  const port = Number.parseInt(process.env.PORT || "3000", 10);
  const server = createSivitaHubServer();

  server.listen(port, host, () => {
    console.log(`SivitaHub listening on http://${host}:${port}`);
  });

  const shutdown = (signal) => {
    console.log(`Received ${signal}; closing SivitaHub.`);
    server.close((error) => {
      if (error) {
        console.error(error);
        process.exitCode = 1;
      }
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
