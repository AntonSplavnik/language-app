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
import type { AiClient } from "../ai/types";
import type { Db } from "../db/client";
import { SINGLE_USER_ID } from "../user";
import { enrichPendingForUser } from "./enrich";
import { deleteWord, getWordDetail, listWords, updateWord } from "./service";
import { describeWord, saveTypedWords } from "./typed";

const Params = z.object({ id: z.coerce.number().int().positive() });

export function wordRoutes(
  app: FastifyInstance,
  { db, ai, dailyDescribeLimit }: { db: Db; ai: AiClient; dailyDescribeLimit: number },
) {
  const userId = SINGLE_USER_ID;

  app.post(
    "/api/words/enrich-pending",
    async (request): Promise<EnrichPendingResponse> =>
      enrichPendingForUser({ db, ai, log: request.log }, userId),
  );

  /** One typed word: the entries chosen for one typed text, without an import (§9.3). */
  app.post("/api/words", async (request): Promise<AddWordsResponse> => {
    const { words } = AddWordsRequest.parse(request.body);
    const { importId: _, ...saved } = await saveTypedWords(
      { db, ai, log: request.log },
      userId,
      words,
      { asImport: false },
    );
    return saved;
  });

  /** Ask AI (Call 3, §11.6). */
  app.post(
    "/api/words/describe",
    async (request): Promise<DescribeResponse> =>
      describeWord({ db, ai, dailyDescribeLimit }, userId, DescribeRequest.parse(request.body)),
  );

  app.get("/api/words", async (request) =>
    listWords(db, userId, WordListQuery.parse(request.query)),
  );

  app.get("/api/words/:id", async (request) => {
    const { id } = Params.parse(request.params);
    return getWordDetail(db, userId, id);
  });

  app.patch("/api/words/:id", async (request) => {
    const { id } = Params.parse(request.params);
    return updateWord(db, userId, id, UpdateWordRequest.parse(request.body));
  });

  app.delete("/api/words/:id", async (request) => {
    const { id } = Params.parse(request.params);
    return deleteWord(db, userId, id);
  });
}
