// Commands
export type {
  CreateClientCommand,
  UpdateClientKycCommand,
  UpdateClientProfileCommand,
  RecordClientFeePaymentCommand,
  DeactivateClientCommand,
  ReactivateClientCommand,
} from "./commands/ClientCommands.js";

// Queries
export type {
  GetClientQuery,
  GetClientHistoryQuery,
  GetClientOnboardingStatusQuery,
  ListClientsQuery,
  ClientDto,
  ListClientsDto,
  ClientOnboardingStatusDto,
} from "./queries/ClientQueries.js";

// Handlers
export { CreateClientHandler }           from "./handlers/CreateClientHandler.js";
export type { CreateClientResult }       from "./handlers/CreateClientHandler.js";
export { UpdateClientKycHandler }        from "./handlers/UpdateClientKycHandler.js";
export type { UpdateClientKycResult }    from "./handlers/UpdateClientKycHandler.js";
export { UpdateClientProfileHandler }    from "./handlers/UpdateClientProfileHandler.js";
export type { UpdateClientProfileResult} from "./handlers/UpdateClientProfileHandler.js";
export { RecordClientFeePaymentHandler } from "./handlers/RecordClientFeePaymentHandler.js";
export type { RecordClientFeePaymentResult } from "./handlers/RecordClientFeePaymentHandler.js";
export { DeactivateClientHandler, ReactivateClientHandler } from "./handlers/ClientStatusHandlers.js";
export type { ClientStatusResult }       from "./handlers/ClientStatusHandlers.js";
export { GetClientDetailsHandler }       from "./handlers/GetClientDetailsHandler.js";
