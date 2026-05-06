/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as appVersionPolicy from "../appVersionPolicy.js";
import type * as constants from "../constants.js";
import type * as coupons from "../coupons.js";
import type * as courtesyHelpers from "../courtesyHelpers.js";
import type * as crons from "../crons.js";
import type * as customers from "../customers.js";
import type * as disputes from "../disputes.js";
import type * as eventDashboard from "../eventDashboard.js";
import type * as eventFeeSettings from "../eventFeeSettings.js";
import type * as eventLists from "../eventLists.js";
import type * as eventSalesPageVisits from "../eventSalesPageVisits.js";
import type * as events from "../events.js";
import type * as homepageBanners from "../homepageBanners.js";
import type * as http from "../http.js";
import type * as migrations_addSlugsToEvents from "../migrations/addSlugsToEvents.js";
import type * as notifications from "../notifications.js";
import type * as organizations from "../organizations.js";
import type * as paymentCards from "../paymentCards.js";
import type * as pendingEmails from "../pendingEmails.js";
import type * as promoters from "../promoters.js";
import type * as pushNotifications from "../pushNotifications.js";
import type * as representatives from "../representatives.js";
import type * as storage from "../storage.js";
import type * as ticketActivation from "../ticketActivation.js";
import type * as ticketResale from "../ticketResale.js";
import type * as ticketTypes from "../ticketTypes.js";
import type * as tickets from "../tickets.js";
import type * as transactions from "../transactions.js";
import type * as transfers from "../transfers.js";
import type * as users from "../users.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  appVersionPolicy: typeof appVersionPolicy;
  constants: typeof constants;
  coupons: typeof coupons;
  courtesyHelpers: typeof courtesyHelpers;
  crons: typeof crons;
  customers: typeof customers;
  disputes: typeof disputes;
  eventDashboard: typeof eventDashboard;
  eventFeeSettings: typeof eventFeeSettings;
  eventLists: typeof eventLists;
  eventSalesPageVisits: typeof eventSalesPageVisits;
  events: typeof events;
  homepageBanners: typeof homepageBanners;
  http: typeof http;
  "migrations/addSlugsToEvents": typeof migrations_addSlugsToEvents;
  notifications: typeof notifications;
  organizations: typeof organizations;
  paymentCards: typeof paymentCards;
  pendingEmails: typeof pendingEmails;
  promoters: typeof promoters;
  pushNotifications: typeof pushNotifications;
  representatives: typeof representatives;
  storage: typeof storage;
  ticketActivation: typeof ticketActivation;
  ticketResale: typeof ticketResale;
  ticketTypes: typeof ticketTypes;
  tickets: typeof tickets;
  transactions: typeof transactions;
  transfers: typeof transfers;
  users: typeof users;
  validators: typeof validators;
}>;
declare const fullApiWithMounts: typeof fullApi;

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: {
    lib: {
      checkRateLimit: FunctionReference<
        "query",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          count?: number;
          key?: string;
          name: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      clearAll: FunctionReference<
        "mutation",
        "internal",
        { before?: number },
        null
      >;
      rateLimit: FunctionReference<
        "mutation",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          count?: number;
          key?: string;
          name: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      resetRateLimit: FunctionReference<
        "mutation",
        "internal",
        { key?: string; name: string },
        null
      >;
    };
  };
};
