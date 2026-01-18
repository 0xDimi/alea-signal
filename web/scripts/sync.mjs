import "dotenv/config";

import { runSync } from "../app/lib/sync-core.mjs";

runSync()
  .then((result) => {
    console.log(
      `Sync complete: ${result.events} events, ${result.markets} markets. Refs: ${JSON.stringify(
        result.refs
      )}`
    );
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
