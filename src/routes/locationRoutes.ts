import type { NextFunction, Request, Response } from "express";

type ReverseGeocodeRouteDeps = {
  authenticate: (...args: any[]) => any;
};

function parseCoordinate(value: unknown, minimum: number, maximum: number): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    return null;
  }
  return parsed;
}

function pickAddressPart(address: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const candidate = String(address[key] || "").trim();
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function registerLocationRoutes(app: any, deps: ReverseGeocodeRouteDeps) {
  const { authenticate } = deps;

  app.get("/api/location/reverse-geocode", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const latitude = parseCoordinate(req.query.latitude, -90, 90);
      const longitude = parseCoordinate(req.query.longitude, -180, 180);

      if (latitude == null || longitude == null) {
        res.status(400).json({ message: "latitude and longitude query params are required" });
        return;
      }

      const providerUrl = new URL(
        String(process.env.REVERSE_GEOCODE_BASE_URL || "https://nominatim.openstreetmap.org/reverse").trim(),
      );
      providerUrl.searchParams.set("format", "jsonv2");
      providerUrl.searchParams.set("lat", String(latitude));
      providerUrl.searchParams.set("lon", String(longitude));
      providerUrl.searchParams.set("zoom", "18");
      providerUrl.searchParams.set("addressdetails", "1");

      const response = await fetch(providerUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": String(
            process.env.REVERSE_GEOCODE_USER_AGENT || "AfriserveBackend/1.0 (customer-onboarding-location)",
          ),
        },
      });

      if (!response.ok) {
        const body = await response.text();
        res.status(502).json({
          message: "Reverse geocoding provider failed",
          providerStatus: response.status,
          providerBody: body.slice(0, 240),
        });
        return;
      }

      const payload = await response.json() as {
        display_name?: string;
        address?: Record<string, unknown>;
      };
      const address = payload.address || {};
      const street = [
        pickAddressPart(address, ["road", "pedestrian", "footway", "street"]),
        pickAddressPart(address, ["house_number"]),
      ]
        .filter(Boolean)
        .join(" ")
        .trim() || null;
      const suburb = pickAddressPart(address, ["suburb", "neighbourhood", "quarter", "hamlet"]);
      const city = pickAddressPart(address, ["city", "town", "municipality", "village"]);
      const county = pickAddressPart(address, ["county", "state_district"]);
      const state = pickAddressPart(address, ["state", "region"]);
      const postalCode = pickAddressPart(address, ["postcode"]);
      const country = pickAddressPart(address, ["country"]);

      res.json({
        latitude,
        longitude,
        displayName: String(payload.display_name || "").trim() || null,
        address: {
          street,
          suburb,
          city,
          county,
          state,
          postalCode,
          country,
        },
        provider: "nominatim",
      });
    } catch (error) {
      next(error);
    }
  });
}

export {
  registerLocationRoutes,
};
