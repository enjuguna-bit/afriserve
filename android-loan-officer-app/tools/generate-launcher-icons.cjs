const fs = require("fs/promises");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..", "..");
const androidAppRoot = path.resolve(__dirname, "..");
const svgPath = path.join(
  androidAppRoot,
  "app",
  "src",
  "main",
  "assets",
  "branding",
  "afriserve-mark.svg",
);
const resRoot = path.join(androidAppRoot, "app", "src", "main", "res");
const { chromium } = require(path.join(
  workspaceRoot,
  "frontend-next",
  "node_modules",
  "playwright",
));

const brandBackground = "linear-gradient(145deg, #062B57 0%, #0A4253 42%, #0E2E25 100%)";
const foregroundSizes = [
  { density: "mdpi", size: 108 },
  { density: "hdpi", size: 162 },
  { density: "xhdpi", size: 216 },
  { density: "xxhdpi", size: 324 },
  { density: "xxxhdpi", size: 432 },
];
const legacySizes = [
  { density: "mdpi", size: 48 },
  { density: "hdpi", size: 72 },
  { density: "xhdpi", size: 96 },
  { density: "xxhdpi", size: 144 },
  { density: "xxxhdpi", size: 192 },
];

function renderMarkup({ size, transparentBackground, iconScale }) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      :root {
        color-scheme: light;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        width: ${size}px;
        height: ${size}px;
        margin: 0;
      }

      body {
        overflow: hidden;
        display: grid;
        place-items: center;
        background: ${transparentBackground ? "transparent" : brandBackground};
      }

      .icon-shell {
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
      }

      .mark {
        height: ${iconScale}%;
        aspect-ratio: 320 / 380;
        display: grid;
        place-items: center;
        transform: translateY(1%);
      }

      .mark svg {
        width: 100%;
        height: 100%;
        display: block;
        overflow: visible;
      }
    </style>
  </head>
  <body>
    <div class="icon-shell">
      <div class="mark">
        __SVG__
      </div>
    </div>
  </body>
</html>`;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function resolveChromiumExecutable() {
  const localAppData =
    process.env.LOCALAPPDATA ||
    path.join(process.env.USERPROFILE || "", "AppData", "Local");
  const playwrightRoot = path.join(localAppData, "ms-playwright");

  let entries = [];
  try {
    entries = await fs.readdir(playwrightRoot, { withFileTypes: true });
  } catch {
    return undefined;
  }

  const chromiumFolder = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium-"))
    .map((entry) => entry.name)
    .sort()
    .pop();

  if (!chromiumFolder) {
    return undefined;
  }

  const executablePath = path.join(
    playwrightRoot,
    chromiumFolder,
    "chrome-win64",
    "chrome.exe",
  );

  try {
    await fs.access(executablePath);
    return executablePath;
  } catch {
    return undefined;
  }
}

async function screenshotTo(page, targetPath, size, markup, omitBackground) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(markup, { waitUntil: "load" });
  await page.screenshot({
    path: targetPath,
    omitBackground,
  });
}

async function main() {
  const svgMarkup = await fs.readFile(svgPath, "utf8");
  const executablePath = await resolveChromiumExecutable();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  try {
    for (const { density, size } of foregroundSizes) {
      const outputDir = path.join(resRoot, `drawable-${density}`);
      const outputPath = path.join(outputDir, "ic_launcher_foreground.png");
      await ensureDir(outputDir);
      const markup = renderMarkup({
        size,
        transparentBackground: true,
        iconScale: 82,
      }).replace("__SVG__", svgMarkup);
      await screenshotTo(page, outputPath, size, markup, true);
    }

    for (const { density, size } of legacySizes) {
      const outputDir = path.join(resRoot, `mipmap-${density}`);
      await ensureDir(outputDir);
      const markup = renderMarkup({
        size,
        transparentBackground: false,
        iconScale: 74,
      }).replace("__SVG__", svgMarkup);
      await screenshotTo(page, path.join(outputDir, "ic_launcher.png"), size, markup, false);
      await screenshotTo(page, path.join(outputDir, "ic_launcher_round.png"), size, markup, false);
    }
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
