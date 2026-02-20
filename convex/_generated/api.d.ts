/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authFunctions from "../authFunctions.js";
import type * as cleanup from "../cleanup.js";
import type * as friends from "../friends.js";
import type * as gameInvites from "../gameInvites.js";
import type * as games from "../games.js";
import type * as http from "../http.js";
import type * as layouts from "../layouts.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_usernameValidation from "../lib/usernameValidation.js";
import type * as onlineGames from "../onlineGames.js";
import type * as presence from "../presence.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authFunctions: typeof authFunctions;
  cleanup: typeof cleanup;
  friends: typeof friends;
  gameInvites: typeof gameInvites;
  games: typeof games;
  http: typeof http;
  layouts: typeof layouts;
  "lib/email": typeof lib_email;
  "lib/usernameValidation": typeof lib_usernameValidation;
  onlineGames: typeof onlineGames;
  presence: typeof presence;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
