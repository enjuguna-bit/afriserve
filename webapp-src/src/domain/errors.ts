class DomainError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

class LoanNotFoundError extends DomainError {
  constructor() {
    super("LOAN_NOT_FOUND", "Loan not found");
  }
}

class ClientNotFoundError extends DomainError {
  constructor() {
    super("CLIENT_NOT_FOUND", "Client not found");
  }
}

class ForbiddenScopeError extends DomainError {
  constructor(message: string = "Forbidden: loan is outside your scope") {
    super("FORBIDDEN_SCOPE", message);
  }
}

class ForbiddenActionError extends DomainError {
  constructor(message: string) {
    super("FORBIDDEN_ACTION", message);
  }
}

class InvalidLoanStatusError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("INVALID_LOAN_STATUS", message, details);
  }
}

class LoanStateConflictError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("LOAN_STATE_CONFLICT", message, details);
  }
}

class DomainConflictError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("DOMAIN_CONFLICT", message, details);
  }
}

class DomainValidationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("DOMAIN_VALIDATION_FAILED", message, details);
  }
}

class UnauthorizedDomainError extends DomainError {
  constructor(message: string = "Unauthorized") {
    super("UNAUTHORIZED", message);
  }
}

class ServiceUnavailableDomainError extends DomainError {
  constructor(message: string) {
    super("SERVICE_UNAVAILABLE", message);
  }
}

class UpstreamServiceError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("UPSTREAM_SERVICE_ERROR", message, details);
  }
}

function getDomainErrorHttpStatus(error: unknown): number | null {
  if (!(error instanceof DomainError)) {
    return null;
  }

  switch (error.code) {
    case "LOAN_NOT_FOUND":
    case "CLIENT_NOT_FOUND":
      return 404;
    case "FORBIDDEN_SCOPE":
    case "FORBIDDEN_ACTION":
      return 403;
    case "INVALID_LOAN_STATUS":
    case "DOMAIN_VALIDATION_FAILED":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "LOAN_STATE_CONFLICT":
    case "DOMAIN_CONFLICT":
      return 409;
    case "SERVICE_UNAVAILABLE":
      return 503;
    case "UPSTREAM_SERVICE_ERROR":
      return 502;
    default:
      return null;
  }
}

export {
  DomainError,
  LoanNotFoundError,
  ClientNotFoundError,
  ForbiddenScopeError,
  ForbiddenActionError,
  InvalidLoanStatusError,
  LoanStateConflictError,
  DomainConflictError,
  DomainValidationError,
  UnauthorizedDomainError,
  ServiceUnavailableDomainError,
  UpstreamServiceError,
  getDomainErrorHttpStatus,
};
