import { createHttpError } from "./helpers.js";
import type {
  PaginationOptions,
  ParsedPagination,
  ParsedSort,
  PagedResponse,
  SortOptions,
} from "../types/http.js";

/**
 * @param {Record<string, unknown>} query
 * @param {PaginationOptions} [options]
 * @returns {ParsedPagination}
 */
function parsePaginationQuery(query: Record<string, unknown>, options: PaginationOptions = {}): ParsedPagination {
  const {
    defaultLimit = 50,
    maxLimit = 200,
    defaultOffset = 0,
    limitErrorMessage = "Invalid limit filter",
    offsetErrorMessage = "Invalid offset filter",
    pageErrorMessage = "Invalid page filter",
    requirePagination = false,
    strict = false,
  } = options;

  const rawLimit = String(query?.limit ?? "").trim();
  const rawOffset = String(query?.offset ?? "").trim();
  const rawPerPage = String(query?.perPage ?? query?.pageSize ?? "").trim();
  const rawPage = String(query?.page ?? "").trim();

  if (requirePagination && !rawLimit && !rawPerPage) {
    throw createHttpError(400, "Pagination parameters are required. Provide limit/perPage.");
  }

  let limit = defaultLimit;
  if (rawPerPage || rawLimit) {
    const parsedLimit = Number(rawPerPage || rawLimit);
    if (!Number.isFinite(parsedLimit)) {
      if (strict) {
        throw createHttpError(400, limitErrorMessage);
      }
    } else {
      limit = Math.min(Math.max(Math.floor(parsedLimit), 1), maxLimit);
    }
  }

  let offset = defaultOffset;
  if (rawPage) {
    const parsedPage = Number(rawPage);
    if (!Number.isFinite(parsedPage) || parsedPage < 1) {
      if (strict) {
        throw createHttpError(400, pageErrorMessage);
      }
    } else {
      offset = (Math.floor(parsedPage) - 1) * limit;
    }
  } else if (rawOffset) {
    const parsedOffset = Number(rawOffset);
    if (!Number.isFinite(parsedOffset)) {
      if (strict) {
        throw createHttpError(400, offsetErrorMessage);
      }
    } else {
      offset = Math.max(Math.floor(parsedOffset), 0);
    }
  }

  const page = Math.max(1, Math.floor(offset / Math.max(limit, 1)) + 1);

  return {
    limit,
    offset,
    page,
    perPage: limit,
  };
}

/**
 * @param {Record<string, unknown>} query
 * @param {SortOptions} options
 * @returns {ParsedSort}
 */
function parseSortQuery(query: Record<string, unknown>, options: SortOptions): ParsedSort {
  const {
    sortFieldMap,
    defaultSortBy,
    defaultSortOrder = "desc",
    sortByErrorMessage = "Invalid sortBy filter",
  } = options;

  if (!sortFieldMap || typeof sortFieldMap !== "object") {
    throw new TypeError("parseSortQuery requires a sortFieldMap option");
  }

  const requestedSortBy = String(query?.sortBy || defaultSortBy || "").trim();
  const sortBy = sortFieldMap[requestedSortBy];
  if (!sortBy) {
    throw createHttpError(400, sortByErrorMessage);
  }

  const sortOrderCandidate = String(query?.sortOrder || defaultSortOrder).trim().toLowerCase();
  if (sortOrderCandidate !== "asc" && sortOrderCandidate !== "desc") {
    throw createHttpError(400, "Invalid sortOrder. Use asc or desc");
  }
  const sortOrder = sortOrderCandidate;

  return { requestedSortBy, sortBy, sortOrder };
}

/**
 * @template T
 * @param {{
 *   data: T[] | undefined | null,
 *   total: number,
 *   limit: number,
 *   offset: number,
 *   sortBy: string,
 *   sortOrder: string
 * }} payload
 * @returns {import("../types/http").PagedResponse<T>}
 */
function createPagedResponse<T>(payload: {
  data: T[] | undefined | null;
  total: number;
  limit: number;
  offset: number;
  sortBy: string;
  sortOrder: string;
}): PagedResponse<T> {
  const { data, total, limit, offset, sortBy, sortOrder } = payload;
  const normalizedLimit = Number(limit || 0);
  const normalizedOffset = Number(offset || 0);
  const page = normalizedLimit > 0 ? Math.floor(normalizedOffset / normalizedLimit) + 1 : 1;

  return {
    data: Array.isArray(data) ? data : [],
    meta: {
      total: Number(total || 0),
      page: Math.max(1, page),
      perPage: normalizedLimit,
    },
    paging: {
      total: Number(total || 0),
      limit: normalizedLimit,
      offset: normalizedOffset,
    },
    sort: {
      sortBy,
      sortOrder,
    },
  };
}

export {
  parsePaginationQuery,
  parseSortQuery,
  createPagedResponse,
};
