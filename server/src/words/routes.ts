import {
  AddWordsRequest,
  type AddWordsResponse,
  DescribeRequest,
  type DescribeResponse,
  type EnrichPendingResponse,
  UpdateWordRequest,
  WordListQuery,
} from "@language-app/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAi } from "../auth/learner";
import { enrichPendingForUser } from "./enrich";
import { deleteWord, getWordDetail, listThemes, listWords, updateWord } from "./service";
import { type DescribeDeps, describeWord, saveTypedWords } from "./typed";

const Params = z.object({ id: z.coerce.number().int().positive() });

export function wordRoutes(app: FastifyInstance, deps: DescribeDeps) {
  const { db, ai } = deps;

  /** Add details: enrichment again, for the words without details (§6.6). An AI route. */
  app.post("/api/words/enrich-pending", async (request): Promise<EnrichPendingResponse> => {
    requireAi(request.learner);
    return enrichPendingForUser({ db, ai, log: request.log }, request.learner);
  });

  /** One typed word: the entries chosen for one typed text, without an import (§9.3). */
  app.post("/api/words", async (request): Promise<AddWordsResponse> => {
    const { words } = AddWordsRequest.parse(request.body);
    const { importId: _, ...saved } = await saveTypedWords(
      { db, ai, log: request.log },
      request.learner,
      words,
      { asImport: false },
    );
    return saved;
  });

  /** Ask AI (Call 3, §11.6). An AI route. */
  app.post("/api/words/describe", async (request): Promise<DescribeResponse> => {
    requireAi(request.learner);
    return describeWord(deps, request.learner, DescribeRequest.parse(request.body));
  });

  app.get("/api/words", async (request) =>
    listWords(db, request.learner.id, WordListQuery.parse(request.query)),
  );

  app.get("/api/themes", async (request) => listThemes(db, request.learner.id));

  app.get("/api/words/:id", async (request) => {
    const { id } = Params.parse(request.params);
    return getWordDetail(db, request.learner.id, id);
  });

  app.patch("/api/words/:id", async (request) => {
    const { id } = Params.parse(request.params);
    return updateWord(db, request.learner.id, id, UpdateWordRequest.parse(request.body));
  });

  app.delete("/api/words/:id", async (request) => {
    const { id } = Params.parse(request.params);
    return deleteWord(db, request.learner.id, id);
  });
}
