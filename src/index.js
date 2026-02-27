require("dotenv").config();

const {
  config,
  normalizeMode,
  normalizeAppMode,
  validateConfig,
  MODE_MORNING,
  MODE_EVENING,
  MODE_BOTH,
  APP_MODE_DIGEST,
  APP_MODE_BOT,
  APP_MODE_BOTH,
} = require("./config");
const { runDigest, shouldRunThisHour, getLocalHour } = require("./digestService");
const { runDiscordBot } = require("./discordBotService");
const { log } = require("./logger");

async function main() {
  const mode = normalizeMode(process.env.MODE || MODE_BOTH);
  const appMode = normalizeAppMode(config.appMode);
  validateConfig(appMode);

  if (appMode === APP_MODE_DIGEST || appMode === APP_MODE_BOTH) {
    if (config.enforceLocalHour && !shouldRunThisHour(mode)) {
      log(
        `Skipping ${mode}: local hour check failed in ${config.timezone}. Current hour=${getLocalHour(
          config.timezone,
        )}.`,
      );
    } else {
      if (mode === MODE_MORNING || mode === MODE_BOTH) {
        await runDigest(MODE_MORNING);
      }

      if (mode === MODE_EVENING || mode === MODE_BOTH) {
        await runDigest(MODE_EVENING);
      }
    }
  }

  if (appMode === APP_MODE_BOT || appMode === APP_MODE_BOTH) {
    await runDiscordBot();
  }
}

module.exports = {
  config,
  normalizeMode,
  normalizeAppMode,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`[${new Date().toISOString()}] ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}
