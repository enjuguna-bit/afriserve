type ParsedWhitelistEntry = {
  raw: string;
  kind: "ip" | "cidr";
  value: string;
  prefix?: number;
};

function parseAdminIpWhitelist(value: string): ParsedWhitelistEntry[] {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      if (entry.includes("/")) {
        const [ip, prefix] = entry.split("/");
        return {
          raw: entry,
          kind: "cidr" as const,
          value: ip,
          prefix: Number(prefix),
        };
      }

      return {
        raw: entry,
        kind: "ip" as const,
        value: entry,
      };
    });
}

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }

  return ((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + (parts[3] >>> 0);
}

function matchesCidr(ip: string, cidrIp: string, prefix: number): boolean {
  const ipNum = ipv4ToNumber(ip);
  const cidrNum = ipv4ToNumber(cidrIp);
  if (ipNum === null || cidrNum === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }

  if (prefix === 0) {
    return true;
  }

  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (ipNum & mask) === (cidrNum & mask);
}

function isIpAllowed(ip: string, entries: ParsedWhitelistEntry[]): boolean {
  if (!entries.length) {
    return true;
  }

  const normalized = String(ip || "").trim().replace("::ffff:", "");

  return entries.some((entry) => {
    if (entry.kind === "ip") {
      return normalized === entry.value;
    }

    return matchesCidr(normalized, entry.value, Number(entry.prefix));
  });
}

function isAdminProtectedPath(pathname: string): boolean {
  return pathname.startsWith("/users/roles")
    || pathname.startsWith("/system/config")
    || pathname.startsWith("/audit-logs");
}

export {
  parseAdminIpWhitelist,
  isIpAllowed,
  isAdminProtectedPath,
};
