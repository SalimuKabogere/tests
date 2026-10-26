import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

// config and admin
const api = anyApi;
const URL = process.env.CONVEX_URL;
if (!URL) {
  throw new Error("CONVEX_URL environment variable is not set");
}
const admin = new ConvexHttpClient(URL);

// race, parallel part
async function race(fnName, n, amount, lpoId) {
  // one client per "thread"
  const clients = Array.from({ length: n }, () => new ConvexHttpClient(URL));

  // send everyone off at the same time
  const results = await Promise.allSettled(
    clients.map((client, i) => 
        client.mutation(
            api.LpoConcurrency[fnName],
            { lpoId, investor: `investor-${i + 1}`, amount },
            { skipQueue: true }
        )
    )
  );
}
