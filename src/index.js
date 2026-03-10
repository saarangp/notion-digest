require("dotenv").config();

const {
  config,
  normalizeMode,
  validateConfig,
  MODE_MORNING,
  MODE_MIDDAY,
  MODE_EVENING,
} = require("./config");
const { runDigest, shouldRunThisHour, getLocalHour } = require("./digestService");
const { log } = require("./logger");

async function main() {
  const mode = normalizeMode(process.env.MODE || MODE_MORNING);
  validateConfig();

  if (!config.enforceLocalHour) {
    await runDigest(mode);
    return;
  }

  if (!shouldRunThisHour(mode)) {
    log(
      `Skipping ${mode}: local hour check failed in ${config.timezone}. Current hour=${getLocalHour(
        config.timezone,
      )}.`,
    );
    return;
  }

  await runDigest(mode);
}

module.exports = {
  config,
  normalizeMode,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`[${new Date().toISOString()}] ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}
