const { BotStateStore } = require("./botStateStore");
const {
  isIsoDate,
  createPendingAction,
  buildNotionUpdateForAction,
} = require("./botActions");
const { config, MODE_MORNING, MODE_EVENING, BUCKETS } = require("./config");
const { notion, mapPageToTask, computeDigest, truncate } = require("./digestService");
const { log } = require("./logger");

let ActionRowBuilder;
let ButtonBuilder;
let ButtonStyle;
let DiscordClient;
let EmbedBuilder;
let Events;
let GatewayIntentBits;
let MessageFlags;
let ModalBuilder;
let REST;
let Routes;
let StringSelectMenuBuilder;
let TextInputBuilder;
let TextInputStyle;

async function runDiscordBot() {
  let discord;
  try {
    discord = require("discord.js");
  } catch {
    throw new Error("Discord bot mode requires dependency 'discord.js'. Run npm install.");
  }

  ({
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Client: DiscordClient,
    EmbedBuilder,
    Events,
    GatewayIntentBits,
    MessageFlags,
    ModalBuilder,
    REST,
    Routes,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
  } = discord);

  const stateStore = new BotStateStore(config.discordBotStatePath);
  const commands = [
    { name: "evening", description: "Show evening digest with quick actions." },
    { name: "digest", description: "Show digest anytime." },
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

  bot.on(Events.InteractionCreate, (interaction) => handleInteraction(interaction, stateStore));

  await bot.login(config.discordBotToken);
}

async function handleInteraction(interaction, stateStore) {
  try {
    await stateStore.pruneExpired(Date.now());

    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction, stateStore);
      return;
    }

    if (interaction.isButton()) {
      await handleButton(interaction, stateStore);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction, stateStore);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction, stateStore);
      return;
    }
  } catch (error) {
    log(`Discord interaction error: ${error.stack || error.message}`);
    if (!interaction.isRepliable()) return;

    try {
      const payload = {
        content: "Action failed. Check logs and try again.",
        flags: MessageFlags.Ephemeral,
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch (replyError) {
      log(`Failed to send interaction error response: ${replyError.stack || replyError.message}`);
    }
  }
}

async function handleCommand(interaction, stateStore) {
  if (interaction.commandName === "digest") {
    await interaction.deferReply();
    const digest = await computeDigest(MODE_MORNING);
    await interaction.editReply({
      embeds: [buildDigestEmbed(digest, "Daily Digest")],
    });
    return;
  }

  if (interaction.commandName === "evening") {
    await interaction.deferReply();
    const digest = await computeDigest(MODE_EVENING);
    await interaction.editReply({
      embeds: [buildDigestEmbed(digest, "Evening Sweep")],
      components: [buildActionButtonsRow()],
    });
    return;
  }

  if (["reschedule", "defer", "done"].includes(interaction.commandName)) {
    await replyWithTaskSelect(interaction, interaction.commandName);
    return;
  }
}

async function handleButton(interaction, stateStore) {
  const customId = String(interaction.customId || "");

  if (customId === "evening:sweep") {
    await interaction.reply({
      content: "Sweep confirmed. No Notion changes were made.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (["evening:reschedule", "evening:defer", "evening:done"].includes(customId)) {
    const action = customId.split(":")[1];
    await replyWithTaskSelect(interaction, action);
    return;
  }

  if (customId.startsWith("confirm:") || customId.startsWith("cancel:")) {
    await handleConfirmOrCancel(interaction, stateStore, customId);
    return;
  }
}

async function handleConfirmOrCancel(interaction, stateStore, customId) {
  const [kind, pendingId] = customId.split(":");
  const pending = await stateStore.getPending(pendingId);

  if (!pending) {
    await interaction.reply({
      content: "This action is no longer pending. Please run /evening again.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (pending.userId !== interaction.user.id) {
    await interaction.reply({
      content: "Only the user who initiated this action can confirm it.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (Number(pending.expiresAt) <= Date.now()) {
    await stateStore.deletePending(pending.id);
    await interaction.reply({
      content: "This confirmation has expired. Please start over.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (kind === "cancel") {
    await stateStore.deletePending(pending.id);
    await interaction.reply({
      content: "Canceled. No Notion changes were made.",
      flags: MessageFlags.Ephemeral,
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
    flags: MessageFlags.Ephemeral,
  });
}

async function handleSelectMenu(interaction, stateStore) {
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
        components: [buildConfirmButtonsRow(pending.id)],
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
      components: [buildConfirmButtonsRow(pending.id)],
    });
    return;
  }
}

async function handleModalSubmit(interaction, stateStore) {
  const customId = String(interaction.customId || "");

  if (customId.startsWith("reschedulemodal:")) {
    const taskId = customId.split(":")[1];
    const targetDate = interaction.fields.getTextInputValue("target_date");
    if (!isIsoDate(targetDate)) {
      await interaction.reply({
        content: "Invalid date format. Use YYYY-MM-DD.",
        flags: MessageFlags.Ephemeral,
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
      flags: MessageFlags.Ephemeral,
      components: [buildConfirmButtonsRow(pending.id)],
    });
    return;
  }
}

async function replyWithTaskSelect(interaction, action) {
  const digest = await computeDigest(MODE_EVENING);
  const tasks = pickActionableTasks(digest.ranked);
  const shouldDefer = !interaction.deferred && !interaction.replied;

  if (shouldDefer) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  if (tasks.length === 0) {
    await interaction.editReply({ content: "No actionable evening tasks found.", components: [] });
    return;
  }
  await interaction.editReply({
    content: `Select a task to ${action}.`,
    components: [buildTaskSelectRow(tasks, action)],
  });
}

function pickActionableTasks(ranked) {
  return ranked.slice(0, Math.max(1, config.discordMaxActionTasks));
}

function buildActionButtonsRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("evening:sweep").setLabel("Do Nothing").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("evening:reschedule").setLabel("Reschedule").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("evening:defer").setLabel("Defer").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("evening:done").setLabel("Mark Done").setStyle(ButtonStyle.Success),
  );
}

function buildConfirmButtonsRow(pendingId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`confirm:${pendingId}`).setLabel("Confirm").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`cancel:${pendingId}`).setLabel("Cancel").setStyle(ButtonStyle.Secondary),
  );
}

function buildTaskSelectRow(tasks, action) {
  const options = tasks.slice(0, 25).map((task) => ({
    label: truncate(task.title, 90) || "Untitled",
    value: task.id,
    description: `${truncate(task.project, 30)} | ${task.dueIso || "no due date"}`,
  }));
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`taskselect:${action}`)
      .setPlaceholder("Choose task")
      .addOptions(options),
  );
}

function buildDigestEmbed(digest, titlePrefix) {
  const overdue = digest.ranked.filter((task) => task.bucket === BUCKETS.OVERDUE);
  const dueToday = digest.ranked.filter((task) => task.bucket === BUCKETS.DUE_TODAY);
  const dueSoon = digest.ranked.filter((task) => task.bucket === BUCKETS.DUE_SOON);

  const fields = [];
  if (digest.eveningProgress) {
    fields.push({
      name: "Progress",
      value: `Done today: ${digest.eveningProgress.completedToday}\nPending due today: ${digest.eveningProgress.pendingDueToday}`,
      inline: true,
    });
  }

  if (digest.capacity.available) {
    fields.push({
      name: "Capacity",
      value: `Free: ${formatMinutes(digest.capacity.freeMinutes)}\nPlanned: ${formatMinutes(digest.capacity.requiredMinutes)}\nStatus: ${digest.capacity.status === "balanced_day" ? "BALANCED" : "CONSTRAINED"}`,
      inline: true,
    });
  }

  if (overdue.length > 0) {
    fields.push({
      name: `Overdue (${overdue.length})`,
      value: formatTaskListForEmbed(overdue),
      inline: false,
    });
  }

  if (dueToday.length > 0) {
    fields.push({
      name: `Due Today (${dueToday.length})`,
      value: formatTaskListForEmbed(dueToday),
      inline: false,
    });
  }

  if (dueSoon.length > 0) {
    fields.push({
      name: `Due Soon (${dueSoon.length})`,
      value: formatTaskListForEmbed(dueSoon),
      inline: false,
    });
  }

  if (digest.top3.length > 0) {
    fields.push({
      name: "Top 3",
      value: digest.top3
        .map((task, index) => `${index + 1}. ${formatTaskForEmbed(task)}`)
        .join("\n"),
      inline: false,
    });
  }

  if (digest.suggestedDefer) {
    fields.push({
      name: "Defer Candidate",
      value: formatTaskForEmbed(digest.suggestedDefer),
      inline: false,
    });
  }

  if (digest.aiSummary && !digest.aiPlan) {
    fields.push({
      name: "AI Note",
      value: truncate(digest.aiSummary, 180),
      inline: false,
    });
  }

  if (digest.aiPlan) {
    fields.push({
      name: "Suggested Order",
      value: truncate(
        digest.aiPlan.order
          .map((entry, index) => `${index + 1}. ${entry.task}`)
          .join("\n"),
        900,
      ),
      inline: false,
    });

    if (digest.aiPlan.startNow) {
      fields.push({
        name: "Start Now (90m)",
        value: truncate(digest.aiPlan.startNow, 180),
        inline: false,
      });
    }

    if (digest.aiPlan.ifConstrained) {
      fields.push({
        name: "If Constrained",
        value: truncate(digest.aiPlan.ifConstrained, 180),
        inline: false,
      });
    }
  }

  return new EmbedBuilder()
    .setTitle(`${titlePrefix} | ${digest.todayIso}`)
    .setDescription("Choose an action below to update Notion safely.")
    .setColor(0x2f6feb)
    .addFields(fields.slice(0, 25))
    .setFooter({ text: "Only confirmed actions update Notion." });
}

function formatTaskListForEmbed(tasks) {
  const visible = tasks.slice(0, config.maxTasksPerSection);
  const lines = visible.map((task) => `- ${formatTaskForEmbed(task)}`);
  const overflow = tasks.length - visible.length;
  if (overflow > 0) {
    lines.push(`- +${overflow} more`);
  }
  return truncate(lines.join("\n"), 1000);
}

function formatTaskForEmbed(task) {
  const priority = String(task.priority || "").trim().toUpperCase() || "P?";
  const due = formatDue(task);
  return `[${priority}] ${truncate(task.title, 60)} | ${truncate(task.project, 22)} | ${due}`;
}

function formatDue(task) {
  if (!Number.isFinite(task.dueInDays)) return task.dueIso || "no due";
  if (task.dueInDays < 0) return `${Math.abs(task.dueInDays)}d late`;
  if (task.dueInDays === 0) return "due today";
  if (task.dueInDays === 1) return "due tomorrow";
  return `due in ${task.dueInDays}d`;
}

function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) return "n/a";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

module.exports = { runDiscordBot };
