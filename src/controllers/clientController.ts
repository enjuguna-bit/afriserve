import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../types/auth.js";
import type { ClientRouteDeps } from "../types/routeDeps.js";
import { createClientRouteService } from "../routes/services/clientRouteService.js";

function createClientController(deps: ClientRouteDeps) {
  const {
    parseId,
    createClientSchema,
    updateClientSchema,
    updateClientKycSchema,
    createClientProfileRefreshSchema,
    updateClientProfileRefreshDraftSchema,
    listClientProfileRefreshesQuerySchema,
    reviewClientProfileRefreshSchema,
    createClientGuarantorSchema,
    updateClientGuarantorSchema,
    createClientCollateralSchema,
    updateClientCollateralSchema,
    recordClientFeePaymentSchema,
    potentialClientDuplicateQuerySchema,
    portfolioReallocationSchema,
  } = deps;

  const service = createClientRouteService(deps);

  function getRequestIp(req: AuthenticatedRequest): string {
    return req.ip ?? req.clientIp ?? "";
  }

  async function createClient(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const payload = createClientSchema.parse(req.body || {});
      const result = await service.createClient(payload, req.user, getRequestIp(req));
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function updateClientKyc(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const clientId = parseId(req.params.id ?? "");
      if (!clientId) {
        res.status(400).json({ message: "Invalid client id" });
        return;
      }

      const payload = updateClientKycSchema.parse(req.body || {});
      const result = await service.updateClientKyc(clientId, payload, req.user, getRequestIp(req));
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function updateClient(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const clientId = parseId(req.params.id ?? "");
      if (!clientId) {
        res.status(400).json({ message: "Invalid client id" });
        return;
      }

      const payload = updateClientSchema.parse(req.body || {});
      const result = await service.updateClient(clientId, payload, req.user, getRequestIp(req));
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function createProfileRefresh(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const clientId = parseId(req.params.id ?? "");
      if (!clientId) {
        res.status(400).json({ message: "Invalid client id" });
        return;
      }

      const payload = createClientProfileRefreshSchema.parse(req.body || {});
      const result = await service.createProfileRefresh(clientId, payload, req.user, getRequestIp(req));
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function listProfileRefreshes(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const payload = listClientProfileRefreshesQuerySchema.parse(req.query || {});
      const result = await service.listProfileRefreshes(payload, req.user);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function getProfileRefresh(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const refreshId = parseId(req.params.refreshId ?? "");
      if (!refreshId) {
        res.status(400).json({ message: "Invalid profile refresh id" });
        return;
      }

      const result = await service.getProfileRefresh(refreshId, req.user);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function updateProfileRefreshDraft(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const refreshId = parseId(req.params.refreshId ?? "");
      if (!refreshId) {
        res.status(400).json({ message: "Invalid profile refresh id" });
        return;
      }

      const payload = updateClientProfileRefreshDraftSchema.parse(req.body || {});
      const result = await service.updateProfileRefreshDraft(refreshId, payload, req.user, getRequestIp(req));
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function submitProfileRefresh(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const refreshId = parseId(req.params.refreshId ?? "");
      if (!refreshId) {
        res.status(400).json({ message: "Invalid profile refresh id" });
        return;
      }

      const payload = createClientProfileRefreshSchema.parse(req.body || {});
      const result = await service.submitProfileRefresh(refreshId, payload, req.user, getRequestIp(req));
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function reviewProfileRefresh(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const refreshId = parseId(req.params.refreshId ?? "");
      if (!refreshId) {
        res.status(400).json({ message: "Invalid profile refresh id" });
        return;
      }

      const payload = reviewClientProfileRefreshSchema.parse(req.body || {});
      const result = await service.reviewProfileRefresh(refreshId, payload, req.user, getRequestIp(req));
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function listProfileVersions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const clientId = parseId(req.params.id ?? "");
      if (!clientId) {
        res.status(400).json({ message: "Invalid client id" });
        return;
      }

      const result = await service.listProfileVersions(clientId, req.user);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function getProfileVersion(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const clientId = parseId(req.params.id ?? "");
      const versionId = parseId(req.params.versionId ?? "");
      if (!clientId || !versionId) {
        res.status(400).json({ message: "Invalid client or version id" });
        return;
      }

      const result = await service.getProfileVersion(clientId, versionId, req.user);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function listClients(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await service.listClients(req.query || {}, req.user);
      if (result.headers) {
        Object.entries(result.headers).forEach(([key, value]) => {
          res.setHeader(key, value as string);
        });
        res.status(result.status).send(result.body);
        return;
      }
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function listPotentialDuplicates(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const payload = potentialClientDuplicateQuerySchema.parse(req.query || {});
      const result = await service.findPotentialDuplicates(payload, req.user);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function listAssignableOfficers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await service.listAssignableOfficers(req.user);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function reallocatePortfolio(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const payload = portfolioReallocationSchema.parse(req.body || {});
      const result = await service.reallocatePortfolio(payload, req.user, getRequestIp(req));
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function getClient(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const clientId = parseId(req.params.id ?? "");
      if (!clientId) {
        res.status(400).json({ message: "Invalid client id" });
        return;
      }

      const result = await service.getClientWithLoans(clientId, req.user);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function getCurrentClient(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await service.getCurrentClient(req.user);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function getClientLoans(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const clientId = parseId(req.params.id ?? "");
      if (!clientId) {
        res.status(400).json({ message: "Invalid client id" });
        return;
      }

      const result = await service.getClientWithLoans(clientId, req.user);
      if (result.status !== 200) {
        res.status(result.status).json(result.body);
        return;
      }

      const loans = Array.isArray(result.body?.loans) ? result.body.loans : [];
      res.status(200).json({
        clientId,
        total: loans.length,
        loans,
      });
    } catch (error) {
      next(error);
    }
  }

  async function getClientHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const clientId = parseId(req.params.id ?? "");
      if (!clientId) {
        res.status(400).json({ message: "Invalid client id" });
        return;
      }

      const result = await service.getClientHistory(clientId, req.user);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function addClientGuarantor(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const clientId = parseId(req.params.id ?? "");
      if (!clientId) {
        res.status(400).json({ message: "Invalid client id" });
        return;
      }

      const payload = createClientGuarantorSchema.parse(req.body || {});
      const result = await service.addClientGuarantor(clientId, payload, req.user, getRequestIp(req));
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function getClientGuarantors(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const clientId = parseId(req.params.id ?? "");
      if (!clientId) {
        res.status(400).json({ message: "Invalid client id" });
        return;
      }

      const result = await service.getClientGuarantors(clientId, req.user);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function updateClientGuarantor(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const clientId = parseId(req.params.clientId ?? "");
      const guarantorId = parseId(req.params.guarantorId ?? "");
      if (!clientId || !guarantorId) {
        res.status(400).json({ message: "Invalid client or guarantor id" });
        return;
      }

      const payload = updateClientGuarantorSchema.parse(req.body || {});
      const result = await service.updateClientGuarantor(clientId, guarantorId, payload, req.user, getRequestIp(req));
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function addClientCollateral(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const clientId = parseId(req.params.id ?? "");
      if (!clientId) {
        res.status(400).json({ message: "Invalid client id" });
        return;
      }

      const payload = createClientCollateralSchema.parse(req.body || {});
      const result = await service.addClientCollateral(clientId, payload, req.user, getRequestIp(req));
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function updateClientCollateral(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const clientId = parseId(req.params.clientId ?? "");
      const collateralId = parseId(req.params.collateralId ?? "");
      if (!clientId || !collateralId) {
        res.status(400).json({ message: "Invalid client or collateral id" });
        return;
      }

      const payload = updateClientCollateralSchema.parse(req.body || {});
      const result = await service.updateClientCollateral(clientId, collateralId, payload, req.user, getRequestIp(req));
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function getClientCollaterals(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const clientId = parseId(req.params.id ?? "");
      if (!clientId) {
        res.status(400).json({ message: "Invalid client id" });
        return;
      }

      const result = await service.getClientCollaterals(clientId, req.user);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function recordClientFeePayment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const clientId = parseId(req.params.id ?? "");
      if (!clientId) {
        res.status(400).json({ message: "Invalid client id" });
        return;
      }

      const payload = recordClientFeePaymentSchema.parse(req.body || {});
      const result = await service.recordClientFeePayment(clientId, payload, req.user, getRequestIp(req));
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function getClientOnboardingStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const clientId = parseId(req.params.id ?? "");
      if (!clientId) {
        res.status(400).json({ message: "Invalid client id" });
        return;
      }

      const result = await service.getClientOnboardingStatus(clientId, req.user);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  return {
    createClient,
    updateClientKyc,
    updateClient,
    listClients,
    createProfileRefresh,
    listProfileRefreshes,
    getProfileRefresh,
    updateProfileRefreshDraft,
    submitProfileRefresh,
    reviewProfileRefresh,
    listProfileVersions,
    getProfileVersion,
    listAssignableOfficers,
    reallocatePortfolio,
    listPotentialDuplicates,
    getCurrentClient,
    getClient,
    getClientLoans,
    getClientHistory,
    addClientGuarantor,
    getClientGuarantors,
    updateClientGuarantor,
    addClientCollateral,
    getClientCollaterals,
    updateClientCollateral,
    recordClientFeePayment,
    getClientOnboardingStatus,
  };
}

export {
  createClientController,
};
