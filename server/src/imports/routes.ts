import { CreateImportRequest, SaveRequest } from "@language-app/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../http/errors";
import { SINGLE_USER_ID } from "../user";
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
  const userId = SINGLE_USER_ID;

  app.post("/api/imports", async (request, reply) => {
    const { name } = CreateImportRequest.parse(request.body ?? {});
    reply.code(201);
    return createImport(db, userId, name);
  });

  app.get("/api/imports/:id", async (request) => {
    const { id } = Params.parse(request.params);
    return getImport(db, userId, id);
  });

  app.post("/api/imports/:id/photos", async (request) => {
    const { id } = Params.parse(request.params);
    if (!request.isMultipart()) {
      throw new HttpError(400, "invalid_request", "Send one photo as multipart field 'photo'");
    }
    const file = await request.file();
    if (!file)
      throw new HttpError(400, "invalid_request", "Send one photo as multipart field 'photo'");
    const jpeg = await file.toBuffer();
    if (!isJpeg(jpeg)) throw new HttpError(400, "invalid_image", "Couldn't open this image");
    return addPhoto(deps, userId, id, jpeg);
  });

  app.post("/api/imports/:id/review", async (request) => {
    const { id } = Params.parse(request.params);
    return startReview(db, userId, id);
  });

  app.post("/api/imports/:id/save", async (request) => {
    const { id } = Params.parse(request.params);
    const { decisions } = SaveRequest.parse(request.body);
    return saveAndEnrich({ ...deps, log: request.log }, userId, id, decisions);
  });
}
