// Resource route: the next page of the review queue, loaded by the list's endless scroll.
import { loadQueuePage } from "~/lib/queue.server";
import type { Route } from "./+types/queue-page";

export async function loader(args: Route.LoaderArgs) {
  return loadQueuePage(args, new URL(args.request.url));
}
