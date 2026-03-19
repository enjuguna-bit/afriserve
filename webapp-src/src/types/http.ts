export interface PaginationQuery {
  limit?: string | number;
  offset?: string | number;
  page?: string | number;
  perPage?: string | number;
  pageSize?: string | number;
}

export interface PaginationOptions {
  defaultLimit?: number;
  maxLimit?: number;
  defaultOffset?: number;
  limitErrorMessage?: string;
  offsetErrorMessage?: string;
  pageErrorMessage?: string;
  requirePagination?: boolean;
  strict?: boolean;
}

export interface ParsedPagination {
  limit: number;
  offset: number;
  page: number;
  perPage: number;
}

export interface SortQuery {
  sortBy?: string;
  sortOrder?: string;
}

export interface SortOptions {
  sortFieldMap?: Record<string, string>;
  defaultSortBy?: string;
  defaultSortOrder?: "asc" | "desc";
  sortByErrorMessage?: string;
}

export interface ParsedSort {
  requestedSortBy: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

export interface PagedResponse<T = unknown> {
  data: T[];
  meta: {
    page: number;
    perPage: number;
    total: number;
  };
  paging: {
    total: number;
    limit: number;
    offset: number;
  };
  sort: {
    sortBy: string;
    sortOrder: string;
  };
}
