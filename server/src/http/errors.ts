import type { ApiError } from "@language-app/core";
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AiError, type AiErrorCode } from "../ai/types";

/** An expected failure with an HTTP status and an error code the client can act on. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** How a failed AI call reaches the client (§12). */
const AI_ERRORS: Record<AiErrorCode, { status: number; code: string; message: string }> = {
  busy: { status: 503, code: "ai_busy", message: "AI is busy, try again" },
  refused: { status: 422, code: "ai_refused", message: "Couldn't read this photo" },
  invalid_output: {
    status: 422,
    code: "ai_invalid_output",
    message: "Couldn't read this photo, try again",
  },
  too_long: {
    status: 422,
    code: "page_too_long",
    message: "Page too long — photograph it in two parts",
  },
};

const body = (code: string, message: string): ApiError => ({ error: { code, message } });

/** Every error response has the body `{ error: { code, message } }` (§12). */
export function registerErrorHandling(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send(body(error.code, error.message));
    }
    if (error instanceof AiError) {
      const mapped = AI_ERRORS[error.code];
      request.log.warn({ err: error }, "AI call failed");
      return reply.code(mapped.status).send(body(mapped.code, mapped.message));
    }
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
      return reply
        .code(400)
        .send(body("invalid_request", `${where}${issue?.message ?? "Invalid request"}`));
    }

    const fastifyError = error as { code?: string; statusCode?: number; message: string };
    if (fastifyError.code === "FST_REQ_FILE_TOO_LARGE") {
      return reply.code(413).send(body("file_too_large", "Photo is too large"));
    }
    // Fastify's own client errors (malformed JSON, wrong content type…).
    if (fastifyError.statusCode && fastifyError.statusCode < 500) {
      return reply
        .code(fastifyError.statusCode)
        .send(body("invalid_request", fastifyError.message));
    }

    request.log.error({ err: error }, "Unexpected error");
    return reply.code(500).send(body("internal", `Something went wrong (request ${request.id})`));
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send(body("not_found", "Not found")));
}
