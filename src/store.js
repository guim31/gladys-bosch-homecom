// -----------------------------------------------------------------------------
// Small persistence under /data (the only writable path of the container):
//   - `auth`: the SingleKey ID refresh token. Bosch rotates it at every use, so
//     the new one must be on disk before the old one is forgotten;
//   - `login`: the PKCE verifier of the last login address handed out;
//   - `catalog`: the gateways and circuits seen last, so a restart while the
//     cloud is down still lists the same devices;
//   - `faults`: the fault codes already reported to the scenes.
// Writes are atomic (temporary file + rename) and serialized.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';
import { createIssueLog } from './issues.js';

const logger = createLogger({ name: 'bosch-store' });
const FILE_NAME = 'bosch-homecom.json';

export class Store {
  constructor(directory = process.env.BOSCH_DATA_DIR || '/data') {
    this.directory = directory;
    this.path = join(directory, FILE_NAME);
    this.data = {};
    this.writing = Promise.resolve();
    // A read-only or full /data fails every write: logged once.
    this.issues = createIssueLog(logger);
  }

  async load() {
    try {
      const data = JSON.parse(await readFile(this.path, 'utf8'));
      this.data = data && typeof data === 'object' ? data : {};
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`Cannot read ${this.path}: ${err.message}`);
      }
      this.data = {};
    }
    return this.data;
  }

  get(key) {
    return this.data[key];
  }

  /**
   * Set one key and write the file. Resolves once it is on disk; rejects when
   * the write failed (the caller decides whether that matters).
   */
  set(key, value) {
    if (value === undefined) {
      delete this.data[key];
    } else {
      this.data[key] = value;
    }
    const snapshot = JSON.stringify(this.data);
    const run = this.writing.then(async () => {
      try {
        await mkdir(this.directory, { recursive: true });
        const temporary = `${this.path}.tmp`;
        // The file holds a refresh token: readable by the integration only.
        await writeFile(temporary, snapshot, { mode: 0o600 });
        await chmod(temporary, 0o600).catch(() => {});
        await rename(temporary, this.path);
        this.issues.ok('write', `${this.path} written again`);
      } catch (err) {
        this.issues.fail('write', `Cannot write ${this.path}: ${err.message}`);
        throw err;
      }
    });
    this.writing = run.catch(() => {});
    return run;
  }

  /** Resolves once every write requested so far is done. */
  flush() {
    return this.writing;
  }
}
