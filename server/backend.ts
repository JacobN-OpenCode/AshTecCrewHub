/**
 * Server-side endpoint contract, replacing `zitejs/backend`.
 *
 * `createEndpoint` is deliberately still just an identity function that returns
 * its config, exactly as the Zite-generated version was. That is what lets
 * `src/api/*.ts` keep `export default createEndpoint({...})` unchanged and still
 * lets the router in server/index.ts discover `authenticated` and `schedule` by
 * reading the returned object.
 *
 * The type parameters matter as much as the runtime: they are what makes
 * `context.user` non-nullable for a plain endpoint but nullable for a scheduled
 * one, which is why supportEscalate.ts can do `if (context.user) ...`.
 */

export type ZiteErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export interface ZiteSchedule {
  scheduleType: 'recurring';
  schedule: {
    frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
    interval: number;
    /** Local hour (0-23) a daily/weekly job should fire at. Without it a job
     *  anchored on `interval` hours lands on midnight, which is never what a
     *  reminder wants. */
    atHour?: number;
  };
  timezone?: string;
}

/**
 * The user an endpoint sees. Zite's generated version deliberately exposes only
 * `id` and `email` plus app-mapped name fields -- notably NOT createdAt/image,
 * whose presence in the type let code compile and then throw at runtime.
 * getMe.ts reads firstName/lastName, so those are included.
 */
export interface ZiteEndpointUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export interface ZiteRequestContext {
  user: ZiteEndpointUser;
  /** Present so `context` can carry per-request extras later without a rewrite. */
  requestId?: string;
}

/** A scheduled fire has no session at all. */
export interface ZiteScheduledContext {
  user: null;
  scheduledAt?: string;
}

export class ZiteError extends Error {
  code: ZiteErrorCode;
  /** Short, non-technical message suitable for showing to an end user. */
  userFacingMessage?: string;

  constructor(options: { code: ZiteErrorCode; message: string; userFacingMessage?: string });
  constructor(message: string, code?: ZiteErrorCode);
  constructor(
    optionsOrMessage: { code: ZiteErrorCode; message: string; userFacingMessage?: string } | string,
    legacyCode?: ZiteErrorCode,
  ) {
    if (typeof optionsOrMessage === 'string') {
      super(optionsOrMessage);
      this.code = legacyCode ?? 'INTERNAL_ERROR';
    } else {
      super(optionsOrMessage.message);
      this.code = optionsOrMessage.code;
      this.userFacingMessage = optionsOrMessage.userFacingMessage;
    }
    this.name = 'ZiteError';
  }
}

type SchemaLike<TOut, TIn = TOut> = { _output: TOut; _input: TIn; parse: (data: unknown) => TOut };

export interface EndpointConfig<
  TInput = unknown,
  TOutput = unknown,
  TStream extends boolean = false,
  TSchedule extends ZiteSchedule | undefined = undefined,
> {
  description?: string;
  inputSchema?: SchemaLike<TInput, any>;
  /** Documentation only; never validated at runtime. */
  outputSchema?: SchemaLike<unknown>;
  stream?: TStream;
  authenticated?: boolean;
  /** When set, the endpoint also fires on this cron schedule. It stays
   *  request-callable -- declaring one widens `context`, so `context.user` must
   *  be null-checked. */
  schedule?: TSchedule;
  execute: (params: {
    input: TInput;
    context: TSchedule extends ZiteSchedule
      ? ZiteRequestContext | ZiteScheduledContext
      : ZiteRequestContext;
  } & (TStream extends true ? { stream: unknown } : {})) => Promise<TOutput> | TOutput;
}

export function createEndpoint<
  TInput = unknown,
  TOutput = unknown,
  TStream extends boolean = false,
  TSchedule extends ZiteSchedule | undefined = undefined,
>(
  config: EndpointConfig<TInput, TOutput, TStream, TSchedule>,
): EndpointConfig<TInput, TOutput, TStream, TSchedule> {
  return config;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      /** Public base URL, e.g. https://crew.mini-jacob.hackclub.app */
      APP_URL: string;
      DATABASE_URL: string;
    }
  }
}