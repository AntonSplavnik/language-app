import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { HttpError } from "../http/errors";
import type { Auth } from "./auth";
import type { Learner } from "./learner";

/**
 * Better Auth's endpoints under `/api/auth/*` (docs/design.md §9.4): each request is handed to
 * its Fetch handler, and its answer, both Set-Cookie headers included, goes back as it is.
 */
export function authRoutes(app: FastifyInstance, auth: Auth) {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
      const headers = fromNodeHeaders(request.headers);
      // Fastify has parsed the body already; it is sent on as JSON of its own length.
      headers.delete("content-length");
      headers.delete("transfer-encoding");
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers,
          ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        }),
      );

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key !== "set-cookie") reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header("set-cookie", cookies);
      return reply.send(response.body ? await response.text() : null);
    },
  });
}

/**
 * The hook in front of every route but `/api/health` and `/api/auth/*`: the session cookie's
 * learner, or 401 `unauthorized`. The session isn't extended here (its refreshed cookie would be
 * lost); the web app's `GET /api/auth/get-session` on start does that.
 */
export function requireLearner(auth: Auth) {
  return async (request: FastifyRequest) => {
    const found = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
      query: { disableRefresh: true },
    });
    if (!found) throw new HttpError(401, "unauthorized", "Sign in to continue");
    const { user } = found;
    request.learner = {
      // Better Auth hands out ids as strings ("2"); ours are integers.
      id: Number(user.id),
      // NOT NULL columns, typed optional only because no client may send them.
      learnerLanguage: user.learnerLanguage ?? "en",
      aiEnabled: user.aiEnabled === true,
    } satisfies Learner;
  };
}
