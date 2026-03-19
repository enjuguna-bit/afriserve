import type { NextFunction, Request, Response } from "express";
import { isAdminProtectedPath, isIpAllowed, parseAdminIpWhitelist } from "../config/whitelist.js";

const whitelistEntries = parseAdminIpWhitelist(String(process.env.ADMIN_IP_WHITELIST || ""));

function enforceAdminIpWhitelist(req: Request, res: Response, next: NextFunction) {
  if (!whitelistEntries.length) {
    next();
    return;
  }

  if (!isAdminProtectedPath(req.path)) {
    next();
    return;
  }

  const requesterIp = String(req.ip || "").trim().replace("::ffff:", "");
  if (!isIpAllowed(requesterIp, whitelistEntries)) {
    res.status(403).json({ message: "Access denied from this IP address" });
    return;
  }

  next();
}

export {
  enforceAdminIpWhitelist,
};
