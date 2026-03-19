interface FormatResponse {
  status: (code: number) => {
    json: (payload: { message: string }) => unknown;
  };
}

function resolveJsonResponseFormat(rawFormat: unknown, res: FormatResponse): "json" | null {
  const format = String(rawFormat || "json").trim().toLowerCase() || "json";
  if (format === "json") {
    return "json";
  }
  if (format === "pdf") {
    res.status(501).json({ message: "PDF format is not implemented yet. Use format=json." });
    return null;
  }
  res.status(400).json({ message: "Invalid format. Use json." });
  return null;
}

export {
  resolveJsonResponseFormat,
};
