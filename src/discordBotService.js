const { BotStateStore } = require("./botStateStore");
const {
  isIsoDate,
  createPendingAction,
  buildNotionUpdateForAction,
} = require("./botActions");
const { config, MODE_EVENING } = require("./config");
const { notion, mapPageToTask, computeDigest, shorten, truncate } = require("./digestService");
const { log } = require("./logger");

async function runDiscordBot() {
  let discord;
  try {
    discord = require("discord.js");
  } catch {
    throw new Error("Discord bot mode requires dependency 'discord.js'. Run npm install.");
  }

  const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Client: DiscordClient,
    Events,
    GatewayIntentBits,
    ModalBuilder,
    REST,
    Routes,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
  } = discord;

  const stateStore = new BotStateStore(config.discordBotStatePath);
  const commands = [
    { name: "evening", description: "Show evening digest with quick actions." },
    { name: "reschedule", description: "Reschedule a selected task." },
    { name: "defer", description: "Defer a selected task by days." },
    { name: "done", description: "Mark a selected task done." },
  ];

  const rest = new REST({ version: "10" }).setToken(config.discordBotToken);
  await rest.put(Routes.applicationGuildCommands(config.discordAppId, config.discordGuildId), {
    body: commands,
  });
  log(`Registered guild slash commands in guild ${config.discordGuildId}.`);

  const bot = new DiscordClient({ intents: [GatewayIntentBits.Guilds] });

  bot.once(Events.ClientReady, () => {
    log(`Discord bot ready as ${bot.user?.tag || "unknown-user"}.`);
  });

  bot.on(Events.InteractionCreate, async (interaction) => {
    try {
      await stateStore.pruneExpired(Date.now());

      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "evening") {
          const digest = await computeDigest(MODE_EVENING);
          const summary = truncate(
            `${digest.text}\n\nChoose an action below to update Notion safely.`,
            1900,
          );
          await interaction.reply({
            content: summary,
            components: [buildActionButtonsRow(ActionRowBuilder, ButtonBuilder, ButtonStyle)],
          });
          return;
        }

        if (["reschedule", "defer", "done"].includes(interaction.commandName)) {
          const digest = await computeDigest(MODE_EVENING);
          const tasks = pickActionableTasks(digest.ranked);
          if (tasks.length === 0) {
            await interaction.reply({
              content: "No actionable evening tasks found.",
              ephemeral: true,
            });
            return;
          }
          await interaction.reply({
            content: `Select a task to ${interaction.commandName}.`,
            ephemeral: true,
            components: [buildTaskSelectRow(ActionRowBuilder, StringSelectMenuBuilder, tasks, interaction.commandName)],
          });
          return;
        }
      }

      if (interaction.isButton()) {
        const customId = String(interaction.customId || "");
        if (customId === "evening:sweep") {
          await interaction.reply({
            content: "Sweep confirmed. No Notion changes were made.",
            ephemeral: true,
          });
          return;
        }

        if (["evening:reschedule", "evening:defer", "evening:done"].includes(customId)) {
          const action = customId.split(":")[1];
          const digest = await computeDigest(MODE_EVENING);
          const tasks = pickActionableTasks(digest.ranked);
          if (tasks.length === 0) {
            await interaction.reply({
              content: "No actionable evening tasks found.",
              ephemeral: true,
            });
            return;
          }
          await interaction.reply({
            content: `Select a task to ${action}.`,
            ephemeral: true,
            components: [buildTaskSelectRow(ActionRowBuilder, StringSelectMenuBuilder, tasks, action)],
          });
          return;
        }

        if (customId.startsWith("confirm:") || customId.startsWith("cancel:")) {
          const [kind, pendingId] = customId.split(":");
          const pending = await stateStore.getPending(pendingId);
          if (!pending) {
            await interaction.reply({
              content: "This action is no longer pending. Please run /evening again.",
              ephemeral: true,
            });
            return;
          }
          if (pending.userId !== interaction.user.id) {
            await interaction.reply({
              content: "Only the user who initiated this action can confirm it.",
              ephemeral: true,
            });
            return;
          }
          if (Number(pending.expiresAt) <= Date.now()) {
            await stateStore.deletePending(pending.id);
            await interaction.reply({
              content: "This confirmation has expired. Please start over.",
              ephemeral: true,
            });
            return;
          }

          if (kind === "cancel") {
            await stateStore.deletePending(pending.id);
            await interaction.reply({
              content: "Canceled. No Notion changes were made.",
              ephemeral: true,
            });
            return;
          }

          const page = await notion.pages.retrieve({ page_id: pending.taskId });
          const task = mapPageToTask(page);
          const update = buildNotionUpdateForAction({
            action: pending.action,
            task,
            details: pending.details,
            config,
          });

          if (config.dryRun) {
            log(`DRY_RUN bot update skipped for task ${task.id}: ${update.summary}`);
          } else {
            await notion.pages.update({
              page_id: pending.taskId,
              properties: update.properties,
            });
          }

          await stateStore.deletePending(pending.id);
          await interaction.reply({
            content: `${update.summary}${config.dryRun ? " (DRY_RUN)" : ""}`,
            ephemeral: true,
          });
          return;
        }
      }

      if (interaction.isStringSelectMenu()) {
        const customId = String(interaction.customId || "");

        if (customId.startsWith("taskselect:")) {
          const action = customId.split(":")[1];
          const taskId = interaction.values[0];

          if (action === "defer") {
            const row = new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(`deferdays:${taskId}`)
                .setPlaceholder("Select defer days")
                .addOptions(
                  { label: "+1 day", value: "1" },
                  { label: "+2 days", value: "2" },
                  { label: "+3 days", value: "3" },
                  { label: "+7 days", value: "7" },
                ),
            );
            await interaction.update({
              content: "Pick how many days to defer.",
              components: [row],
            });
            return;
          }

          if (action === "reschedule") {
            const modal = new ModalBuilder().setCustomId(`reschedulemodal:${taskId}`).setTitle("Reschedule Task");
            const input = new TextInputBuilder()
              .setCustomId("target_date")
              .setLabel("New due date (YYYY-MM-DD)")
              .setRequired(true)
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("2026-02-27");
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
            return;
          }

          if (action === "done") {
            const pending = createPendingAction({
              action: "done",
              taskId,
              userId: interaction.user.id,
              details: {},
              ttlMinutes: config.discordInteractionTtlMinutes,
            });
            await stateStore.putPending(pending);
            await interaction.update({
              content: "Confirm marking this task done?",
              components: [
                buildConfirmButtonsRow(ActionRowBuilder, ButtonBuilder, ButtonStyle, pending.id),
              ],
            });
            return;
          }
        }

        if (customId.startsWith("deferdays:")) {
          const taskId = customId.split(":")[1];
          const days = Number(interaction.values[0]);
          const pending = createPendingAction({
            action: "defer",
            taskId,
            userId: interaction.user.id,
            details: { days },
            ttlMinutes: config.discordInteractionTtlMinutes,
          });
          await stateStore.putPending(pending);
          await interaction.update({
            content: `Confirm deferring by +${days} day(s)?`,
            components: [
              buildConfirmButtonsRow(ActionRowBuilder, ButtonBuilder, ButtonStyle, pending.id),
            ],
          });
          return;
        }
      }

      if (interaction.isModalSubmit()) {
        const customId = String(interaction.customId || "");
        if (customId.startsWith("reschedulemodal:")) {
          const taskId = customId.split(":")[1];
          const targetDate = interaction.fields.getTextInputValue("target_date");
          if (!isIsoDate(targetDate)) {
            await interaction.reply({
              content: "Invalid date format. Use YYYY-MM-DD.",
              ephemeral: true,
            });
            return;
          }

          const pending = createPendingAction({
            action: "reschedule",
            taskId,
            userId: interaction.user.id,
            details: { targetDate },
            ttlMinutes: config.discordInteractionTtlMinutes,
          });
          await stateStore.putPending(pending);
          await interaction.reply({
            content: `Confirm rescheduling to ${targetDate}?`,
            ephemeral: true,
            components: [
              buildConfirmButtonsRow(ActionRowBuilder, ButtonBuilder, ButtonStyle, pending.id),
            ],
          });
          return;
        }
      }
    } catch (error) {
      log(`Discord interaction error: ${error.stack || error.message}`);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "Action failed. Check logs and try again.",
          ephemeral: true,
        });
      }
    }
  });

  await bot.login(config.discordBotToken);
}

function pickActionableTasks(ranked) {
  return ranked.slice(0, Math.max(1, config.discordMaxActionTasks));
}

function buildActionButtonsRow(ActionRowBuilder, ButtonBuilder, ButtonStyle) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("evening:sweep").setLabel("Sweep").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("evening:reschedule").setLabel("Reschedule").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("evening:defer").setLabel("Defer").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("evening:done").setLabel("Mark Done").setStyle(ButtonStyle.Success),
  );
}

function buildConfirmButtonsRow(ActionRowBuilder, ButtonBuilder, ButtonStyle, pendingId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`confirm:${pendingId}`).setLabel("Confirm").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`cancel:${pendingId}`).setLabel("Cancel").setStyle(ButtonStyle.Secondary),
  );
}

function buildTaskSelectRow(ActionRowBuilder, StringSelectMenuBuilder, tasks, action) {
  const options = tasks.slice(0, 25).map((task) => ({
    label: shorten(task.title, 90) || "Untitled",
    value: task.id,
    description: `${shorten(task.project, 30)} | ${task.dueIso || "no due date"}`,
  }));
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`taskselect:${action}`)
      .setPlaceholder("Choose task")
      .addOptions(options),
  );
}

module.exports = { runDiscordBot };
