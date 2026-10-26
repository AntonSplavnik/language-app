import {
  CreateImportRequest,
  type ImportListResponse,
  RenameImportRequest,
  SaveRequest,
  TypedImportRequest,
  type TypedImportResponse,
} from "@language-app/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAi } from "../auth/learner";
import { HttpError } from "../http/errors";
import { saveTypedWords } from "../words/typed";
import { listPastImports, renameImport } from "./past";
import {
  addPhoto,
  createImport,
  getImport,
  type ImportDeps,
  saveAndEnrich,
  startReview,
} from "./service";

const Params = z.object({ id: z.coerce.number().int().positive() });

/** JPEG files start with FF D8 FF; the web app always sends JPEG (§6.2). */
const isJpeg = (data: Uint8Array) => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;

export function importRoutes(app: FastifyInstance, deps: ImportDeps) {
  const { db } = deps;

  app.get(
    "/api/imports",
    async (request): Promise<ImportListResponse> => ({
      imports: await listPastImports(db, request.learner.id),
    }),
  );

  // Photos and PDF pages are read by the AI (Call 1), so making such an import needs it.
  app.post("/api/imports", async (request, reply) => {
    const body = CreateImportRequest.parse(request.body ?? {});
    requireAi(request.learner);
    reply.code(201);
    return createImport(db, request.learner.id, body);
  });

  app.get("/api/imports/:id", async (request) => {
    const { id } = Params.parse(request.params);
    return getImport(db, request.learner.id, id);
  });

  app.patch("/api/imports/:id", async (request) => {
    const { id } = Params.parse(request.params);
    const { name } = RenameImportRequest.parse(request.body);
    return renameImport(db, request.learner.id, id, name);
  });

  /** A typed list, saved as one import (§6.7, §9.3). */
  app.post("/api/imports/typed", async (request): Promise<TypedImportResponse> => {
    const { words } = TypedImportRequest.parse(request.body);
    return saveTypedWords({ db, ai: deps.ai, log: request.log }, request.learner, words, {
      asImport: true,
    });
  });

  app.post("/api/imports/:id/photos", async (request) => {
    requireAi(request.learner);
    const { id } = Params.parse(request.params);
    if (!request.isMultipart()) {
      throw new HttpError(400, "invalid_request", "Send one photo as multipart field 'photo'");
    }
    const file = await request.file();
    if (!file)
      throw new HttpError(400, "invalid_request", "Send one photo as multipart field 'photo'");
    const jpeg = await file.toBuffer();
    if (!isJpeg(jpeg)) throw new HttpError(400, "invalid_image", "Couldn't open this image");
    return addPhoto(deps, request.learner, id, jpeg);
  });

  app.post("/api/imports/:id/review", async (request) => {
    const { id } = Params.parse(request.params);
    return startReview(db, request.learner.id, id);
  });

  app.post("/api/imports/:id/save", async (request) => {
    const { id } = Params.parse(request.params);
    const { decisions } = SaveRequest.parse(request.body);
    return saveAndEnrich({ ...deps, log: request.log }, request.learner, id, decisions);
  });
}
