/**
 * The prototype has one learner and no login (§4). The first migration creates this user;
 * every request acts as them. Learner-owned tables already carry `user_id`, so accounts can
 * replace this constant later without a schema change.
 */
export const SINGLE_USER_ID = 1;
