import type { ClientRouteDeps } from "../types/routeDeps.js";
import { createClientRouteService } from "../services/clientRouteService.js";

function createClientController(deps: ClientRouteDeps) {
  const {
    parseId,
    createClientSchema,
    updateClientSchema,
    updateClientKycSchema,
    createClientGuarantorSchema,
    updateClientGuarantorSchema,
    createClientCollateralSchema,
    updateClientCollateralSchema,
    recordClientFeePaymentSchema,
    potentialClientDuplicateQuerySchema,
    portfolioReallocationSchema,
  } = deps;

  const service = createClientRouteService(deps);

  async function createClient(req: any, res: any, next: any) {
    try {
      const payload = createClientSchema.parse(req.body);
      const result = await service.createClient(payload, req.user, req.ip);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function updateClientKyc(req: any, res: any, next: any) {
    try {
      const clientId = parseId(req.params.id);
      if (!clientId) {
        res.status(400).json({ message: "Invalid client id" });
        return;
      }

      const payload = updateClientKycSchema.parse(req.body || {});
      const result = await service.updateClientKyc(clientId, payload, req.user, req.ip);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function updateClient(req: any, res: any, next: any) {
    try {
      const clientId = parseId(req.params.id);
      if (!clientId) {
        res.status(400).json({ message: "Invalid client id" });
        return;
      }

      const payload = updateClientSchema.parse(req.body);
      const result = await service.updateClient(clientId, payload, req.user, req.ip);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function listClients(req: any, res: any, next: any) {
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

  async function listPotentialDuplicates(req: any, res: any, next: any) {
    try {
      const payload = potentialClientDuplicateQuerySchema.parse(req.query || {});
      const result = await service.findPotentialDuplicates(payload, req.user);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function listAssignableOfficers(req: any, res: any, next: any) {
    try {
      const result = await service.listAssignableOfficers(req.user);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function reallocatePortfolio(req: any, res: any, next: any) {
    try {
      const payload = portfolioReallocationSchema.parse(req.body || {});
      const result = await service.reallocatePortfolio(payload, req.user, req.ip);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function getClient(req: any, res: any, next: any) {
    try {
      const clientId = parseId(req.params.id);
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

  async function getClientLoans(req: any, res: any, next: any) {
    try {
      const clientId = parseId(req.params.id);
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

  async function getClientHistory(req: any, res: any, next: any) {
    try {
      const clientId = parseId(req.params.id);
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

  async function addClientGuarantor(req: any, res: any, next: any) {
    try {
      const clientId = parseId(req.params.id);
      if (!clientId) {
        res.status(400).json({ message: "Invalid client id" });
        return;
      }

      const payload = createClientGuarantorSchema.parse(req.body || {});
      const result = await service.addClientGuarantor(clientId, payload, req.user, req.ip);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function getClientGuarantors(req: any, res: any, next: any) {
    try {
      const clientId = parseId(req.params.id);
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

  async function updateClientGuarantor(req: any, res: any, next: any) {
    try {
      const clientId = parseId(req.params.clientId);
      const guarantorId = parseId(req.params.guarantorId);
      if (!clientId || !guarantorId) {
        res.status(400).json({ message: "Invalid client or guarantor id" });
        return;
      }

      const payload = updateClientGuarantorSchema.parse(req.body || {});
      const result = await service.updateClientGuarantor(clientId, guarantorId, payload, req.user, req.ip);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function addClientCollateral(req: any, res: any, next: any) {
    try {
      const clientId = parseId(req.params.id);
      if (!clientId) {
        res.status(400).json({ message: "Invalid client id" });
        return;
      }

      const payload = createClientCollateralSchema.parse(req.body || {});
      const result = await service.addClientCollateral(clientId, payload, req.user, req.ip);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function updateClientCollateral(req: any, res: any, next: any) {
    try {
      const clientId = parseId(req.params.clientId);
      const collateralId = parseId(req.params.collateralId);
      if (!clientId || !collateralId) {
        res.status(400).json({ message: "Invalid client or collateral id" });
        return;
      }

      const payload = updateClientCollateralSchema.parse(req.body || {});
      const result = await service.updateClientCollateral(clientId, collateralId, payload, req.user, req.ip);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function getClientCollaterals(req: any, res: any, next: any) {
    try {
      const clientId = parseId(req.params.id);
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

  async function recordClientFeePayment(req: any, res: any, next: any) {
    try {
      const clientId = parseId(req.params.id);
      if (!clientId) {
        res.status(400).json({ message: "Invalid client id" });
        return;
      }

      const payload = recordClientFeePaymentSchema.parse(req.body || {});
      const result = await service.recordClientFeePayment(clientId, payload, req.user, req.ip);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function getClientOnboardingStatus(req: any, res: any, next: any) {
    try {
      const clientId = parseId(req.params.id);
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
    listAssignableOfficers,
    reallocatePortfolio,
    listPotentialDuplicates,
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
