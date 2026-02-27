const fs = require("node:fs/promises");
const path = require("node:path");

class BotStateStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return { pending: {} };
      if (!parsed.pending || typeof parsed.pending !== "object") {
        parsed.pending = {};
      }
      return parsed;
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return { pending: {} };
      }
      throw error;
    }
  }

  async save(state) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  async putPending(entry) {
    const state = await this.load();
    state.pending[entry.id] = entry;
    await this.save(state);
  }

  async getPending(id) {
    const state = await this.load();
    return state.pending[id] || null;
  }

  async deletePending(id) {
    const state = await this.load();
    delete state.pending[id];
    await this.save(state);
  }

  async pruneExpired(nowMillis) {
    const state = await this.load();
    for (const [id, entry] of Object.entries(state.pending)) {
      if (!entry || Number(entry.expiresAt) <= nowMillis) {
        delete state.pending[id];
      }
    }
    await this.save(state);
  }
}

module.exports = { BotStateStore };
