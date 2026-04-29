import type { RouteRegistrar } from "../../types/routeDeps.js";
import { createDistributedRateLimiter } from "../../services/rateLimitRedis.js";
import { isIpAllowed, parseAdminIpWhitelist } from "../../config/whitelist.js";
import { requirePermission } from "../../middleware/permissions.js";

type MobileMoneyRouteOptions = {
  app: RouteRegistrar;
  authenticate: (...args: any[]) => any;
  authorize: (...roles: string[]) => (...args: any[]) => any;
  parseId: (value: unknown) => number | null;
  mobileMoneyService: any;
  mapDomainErrorToHttpError: (error: unknown) => unknown;
};

function registerMobileMoneyRoutes(options: MobileMoneyRouteOptions) {
  const {
    app,
    authenticate,
    authorize,
    parseId,
    mobileMoneyService,
    mapDomainErrorToHttpError,
  } = options;

  const b2cReversalRetryLimiter = createDistributedRateLimiter({
    keyPrefix: "b2c-reversal-retry",
    windowMs: 10 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many reversal retry requests. Please try again shortly." },
  });
  const b2cCoreRetryLimiter = createDistributedRateLimiter({
    keyPrefix: "b2c-core-retry",
    windowMs: 10 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many core retry requests. Please try again shortly." },
  });
  const mobileMoneyManagePermission = requirePermission("mobile_money.manage");
  const mobileMoneyReconcilePermission = requirePermission("mobile_money.reconcile");
  const stkPushLimiter = createDistributedRateLimiter({
    keyPrefix: "stk-push",
    windowMs: 5 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many STK push requests. Please try again shortly." },
  });
  const callbackWhitelistEntries = parseAdminIpWhitelist(String(process.env.MOBILE_MONEY_CALLBACK_IP_WHITELIST || ""));

  function resolveRequesterIp(req: any): string {
    const forwardedFor = String(req.headers?.["x-forwarded-for"] || "")
      .split(",")
      .map((item) => String(item || "").trim())
      .filter(Boolean)[0] || "";
    const fallbackIp = String(req.ip || "").trim();
    return (forwardedFor || fallbackIp).replace("::ffff:", "");
  }

  function enforceCallbackIpWhitelist(req: any, res: any): boolean {
    if (!callbackWhitelistEntries.length) {
      return true;
    }
    const requesterIp = resolveRequesterIp(req);
    if (!isIpAllowed(requesterIp, callbackWhitelistEntries)) {
      res.status(403).json({ message: "Callback IP address is not whitelisted" });
      return false;
    }
    return true;
  }

  function resolveRawBody(req: any): string | null {
    return typeof req.rawBody === "string" && req.rawBody.length > 0
      ? req.rawBody
      : null;
  }

  app.post("/api/mobile-money/c2b/webhook", async (req, res, next) => {
    try {
      if (!mobileMoneyService) {
        res.status(503).json({ message: "Mobile money integration is not configured" });
        return;
      }
      if (!enforceCallbackIpWhitelist(req, res)) {
        return;
      }
      const tokenHeader = String(req.headers["x-mobile-money-webhook-token"] || "").trim() || null;
      const signatureHeader = String(req.headers["x-mobile-money-signature"] || "").trim() || null;
      const timestampHeader = String(req.headers["x-mobile-money-timestamp"] || "").trim() || null;
      const result = await mobileMoneyService.handleC2BWebhook({
        body: req.body || {},
        rawBody: resolveRawBody(req),
        webhookToken: tokenHeader,
        signature: signatureHeader,
        timestamp: timestampHeader,
        ipAddress: req.ip,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/mobile-money/b2c/callback", async (req, res, next) => {
    try {
      if (!mobileMoneyService) {
        res.status(503).json({ message: "Mobile money integration is not configured" });
        return;
      }
      if (!enforceCallbackIpWhitelist(req, res)) {
        return;
      }
      const signatureHeader = String(req.headers["x-mobile-money-signature"] || "").trim() || null;
      const timestampHeader = String(req.headers["x-mobile-money-timestamp"] || "").trim() || null;
      const result = await mobileMoneyService.handleB2CCallback({
        body: req.body || {},
        rawBody: resolveRawBody(req),
        signature: signatureHeader,
        timestamp: timestampHeader,
        ipAddress: req.ip,
      });
      res.status(200).json(result);
    } catch (error) {
      next(mapDomainErrorToHttpError(error));
    }
  });

  app.post(
    "/api/mobile-money/stk/push",
    stkPushLimiter,
    authenticate,
    authorize("admin", "finance", "operations_manager", "loan_officer"),
    mobileMoneyManagePermission,
    async (req, res, next) => {
      try {
        if (!mobileMoneyService) {
          res.status(503).json({ message: "Mobile money integration is not configured" });
          return;
        }

        const amount = Number(req.body?.amount || 0);
        const phoneNumber = String(req.body?.phoneNumber || "").trim();
        const accountReference = String(req.body?.accountReference || "").trim() || undefined;
        const transactionDesc = String(req.body?.transactionDesc || "").trim() || undefined;

        const result = await mobileMoneyService.initiateSTKPush({
          amount,
          phoneNumber,
          accountReference,
          transactionDesc,
          requestedByUserId: Number(req.user?.sub || 0) || null,
          ipAddress: req.ip,
        });
        res.status(200).json(result);
      } catch (error) {
        next(mapDomainErrorToHttpError(error));
      }
    },
  );

  app.post("/api/mobile-money/stk/callback", async (req, res, next) => {
    try {
      if (!mobileMoneyService) {
        res.status(503).json({ message: "Mobile money integration is not configured" });
        return;
      }
      if (!enforceCallbackIpWhitelist(req, res)) {
        return;
      }
      const signatureHeader = String(req.headers["x-mobile-money-signature"] || "").trim() || null;
      const timestampHeader = String(req.headers["x-mobile-money-timestamp"] || "").trim() || null;
      const result = await mobileMoneyService.handleSTKCallback({
        body: req.body || {},
        rawBody: resolveRawBody(req),
        signature: signatureHeader,
        timestamp: timestampHeader,
        ipAddress: req.ip,
      });
      res.status(200).json({
        ResultCode: 0,
        ResultDesc: "Accepted",
        status: result.status,
      });
    } catch (error) {
      next(mapDomainErrorToHttpError(error));
    }
  });

  app.get(
    "/api/mobile-money/c2b/events",
    authenticate,
    authorize("admin", "finance", "operations_manager"),
    mobileMoneyReconcilePermission,
    async (req, res, next) => {
      try {
        if (!mobileMoneyService) {
          res.status(503).json({ message: "Mobile money integration is not configured" });
          return;
        }
        const status = String(req.query.status || "").trim().toLowerCase();
        const limit = Number(req.query.limit || 50);
        const rows = await mobileMoneyService.listC2BEvents({ status, limit });
        res.status(200).json(rows);
      } catch (error) {
        next(mapDomainErrorToHttpError(error));
      }
    },
  );

  app.post(
    "/api/mobile-money/c2b/events/:id/reconcile",
    authenticate,
    authorize("admin", "finance", "operations_manager"),
    mobileMoneyReconcilePermission,
    async (req, res, next) => {
      try {
        if (!mobileMoneyService) {
          res.status(503).json({ message: "Mobile money integration is not configured" });
          return;
        }

        const eventId = parseId(req.params.id);
        if (!eventId) {
          res.status(400).json({ message: "Invalid C2B event id" });
          return;
        }

        const loanId = Number(req.body?.loanId || 0);
        if (!Number.isInteger(loanId) || loanId <= 0) {
          res.status(400).json({ message: "Valid loanId is required" });
          return;
        }

        const note = String(req.body?.note || "").trim() || undefined;
        const result = await mobileMoneyService.reconcileC2BEventManually({
          eventId,
          loanId,
          note,
          requestedByUserId: Number(req.user?.sub || 0) || null,
          ipAddress: req.ip,
        });
        res.status(200).json(result);
      } catch (error) {
        next(mapDomainErrorToHttpError(error));
      }
    },
  );

  app.get(
    "/api/mobile-money/b2c/disbursements",
    authenticate,
    authorize("admin", "finance", "operations_manager"),
    mobileMoneyManagePermission,
    async (req, res, next) => {
      try {
        if (!mobileMoneyService) {
          res.status(503).json({ message: "Mobile money integration is not configured" });
          return;
        }
        const status = String(req.query.status || "").trim().toLowerCase();
        const limit = Number(req.query.limit || 50);
        const loanId = Number(req.query.loanId || 0);
        const providerRequestId = String(req.query.providerRequestId || "").trim();
        const rows = await mobileMoneyService.listB2CDisbursements({
          status,
          limit,
          loanId,
          providerRequestId,
        });
        res.status(200).json(rows);
      } catch (error) {
        next(mapDomainErrorToHttpError(error));
      }
    },
  );

  app.get(
    "/api/mobile-money/b2c/disbursements/summary",
    authenticate,
    authorize("admin", "finance", "operations_manager"),
    mobileMoneyManagePermission,
    async (req, res, next) => {
      try {
        if (!mobileMoneyService) {
          res.status(503).json({ message: "Mobile money integration is not configured" });
          return;
        }
        const status = String(req.query.status || "").trim().toLowerCase();
        const loanId = Number(req.query.loanId || 0);
        const summary = await mobileMoneyService.getB2CDisbursementSummary({
          status,
          loanId,
        });
        res.status(200).json(summary);
      } catch (error) {
        next(mapDomainErrorToHttpError(error));
      }
    },
  );

  app.post(
    "/api/mobile-money/b2c/disbursements/:id/retry-reversal",
    b2cReversalRetryLimiter,
    authenticate,
    authorize("admin", "finance", "operations_manager"),
    mobileMoneyManagePermission,
    async (req, res, next) => {
      try {
        if (!mobileMoneyService) {
          res.status(503).json({ message: "Mobile money integration is not configured" });
          return;
        }

        const disbursementId = parseId(req.params.id);
        if (!disbursementId) {
          res.status(400).json({ message: "Invalid B2C disbursement id" });
          return;
        }

        const result = await mobileMoneyService.retryB2CReversal({
          disbursementId,
          requestedByUserId: Number(req.user?.sub || 0) || null,
          ipAddress: req.ip,
        });
        res.status(200).json(result);
      } catch (error) {
        next(mapDomainErrorToHttpError(error));
      }
    },
  );

  app.post(
    "/api/mobile-money/b2c/disbursements/:id/retry-core",
    b2cCoreRetryLimiter,
    authenticate,
    authorize("admin", "finance", "operations_manager"),
    mobileMoneyManagePermission,
    async (req, res, next) => {
      try {
        if (!mobileMoneyService) {
          res.status(503).json({ message: "Mobile money integration is not configured" });
          return;
        }

        const disbursementId = parseId(req.params.id);
        if (!disbursementId) {
          res.status(400).json({ message: "Invalid B2C disbursement id" });
          return;
        }

        const result = await mobileMoneyService.retryB2CCoreDisbursement({
          disbursementId,
          requestedByUserId: Number(req.user?.sub || 0) || null,
          ipAddress: req.ip,
        });
        res.status(200).json(result);
      } catch (error) {
        next(mapDomainErrorToHttpError(error));
      }
    },
  );
}

export {
  registerMobileMoneyRoutes,
};

