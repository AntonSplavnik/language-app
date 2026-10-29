import { CreateGroupRequest, GroupWordsRequest, RenameGroupRequest } from "@language-app/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/client";
import {
  addToGroup,
  createGroup,
  deleteGroup,
  listGroups,
  removeFromGroup,
  renameGroup,
} from "./service";

const Params = z.object({ id: z.coerce.number().int().positive() });

/** The learner's groups (docs/design.md §9.5). */
export function groupRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get("/api/groups", async (request) => listGroups(db, request.learner.id));

  app.post("/api/groups", async (request, reply) => {
    const created = await createGroup(
      db,
      request.learner.id,
      CreateGroupRequest.parse(request.body),
    );
    return reply.code(201).send(created);
  });

  app.patch("/api/groups/:id", async (request) => {
    const { id } = Params.parse(request.params);
    const { name } = RenameGroupRequest.parse(request.body);
    return renameGroup(db, request.learner.id, id, name);
  });

  app.delete("/api/groups/:id", async (request, reply) => {
    const { id } = Params.parse(request.params);
    await deleteGroup(db, request.learner.id, id);
    return reply.code(204).send();
  });

  app.post("/api/groups/:id/words", async (request) => {
    const { id } = Params.parse(request.params);
    const { userWordIds } = GroupWordsRequest.parse(request.body);
    return addToGroup(db, request.learner.id, id, userWordIds);
  });

  // A DELETE with a JSON body: the words to take out (§9.5).
  app.delete("/api/groups/:id/words", async (request) => {
    const { id } = Params.parse(request.params);
    const { userWordIds } = GroupWordsRequest.parse(request.body);
    return removeFromGroup(db, request.learner.id, id, userWordIds);
  });
}
