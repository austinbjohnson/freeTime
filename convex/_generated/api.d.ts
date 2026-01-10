/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as pipeline_extraction from "../pipeline/extraction.js";
import type * as pipeline_logging from "../pipeline/logging.js";
import type * as pipeline_orchestrator from "../pipeline/orchestrator.js";
import type * as pipeline_refinement from "../pipeline/refinement.js";
import type * as pipeline_research from "../pipeline/research.js";
import type * as pipeline_types from "../pipeline/types.js";
import type * as scans from "../scans.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "pipeline/extraction": typeof pipeline_extraction;
  "pipeline/logging": typeof pipeline_logging;
  "pipeline/orchestrator": typeof pipeline_orchestrator;
  "pipeline/refinement": typeof pipeline_refinement;
  "pipeline/research": typeof pipeline_research;
  "pipeline/types": typeof pipeline_types;
  scans: typeof scans;
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
