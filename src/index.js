require("dotenv").config();

const {
  config,
  normalizeMode,
  validateConfig,
  MODE_MORNING,
  MODE_EVENING,
  MODE_BOTH,
} = require("./config");
const { runDigest, shouldRunThisHour, getLocalHour } = require("./digestService");
const { log } = require("./logger");

async function main() {
  const mode = normalizeMode(process.env.MODE || MODE_BOTH);
  validateConfig();

  if (!config.enforceLocalHour) {
    if (mode === MODE_MORNING || mode === MODE_BOTH) {
      await runDigest(MODE_MORNING);
    }

    if (mode === MODE_EVENING || mode === MODE_BOTH) {
      await runDigest(MODE_EVENING);
    }
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

  const localHour = getLocalHour(config.timezone);
  if (mode === MODE_BOTH) {
    if (localHour === config.morningHour) {
      await runDigest(MODE_MORNING);
      return;
    }
    if (localHour === config.eveningHour) {
      await runDigest(MODE_EVENING);
      return;
    }
    return;
  }

  if (mode === MODE_MORNING) {
    await runDigest(MODE_MORNING);
  }

  if (mode === MODE_EVENING) {
    await runDigest(MODE_EVENING);
  }
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
