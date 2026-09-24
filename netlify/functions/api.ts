import type { Handler } from "@netlify/functions";
import { routeApiRequest } from "../../server/api/router";

export const handler: Handler = async (event) => routeApiRequest(event);
