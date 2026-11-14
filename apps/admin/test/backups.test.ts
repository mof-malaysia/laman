import type { Summary } from "@fiscal-sb/contracts";
import { describe, expect, it } from "@rstest/core";
import { backupHealth } from "../src/lib/backups";

const archive = {
  file: "laman-x.tar.gz",
  at: new Date().toISOString(),
  bytes: 1,
  dbOnly: false,
};
const healthy: Summary["backup"] = {
  dir: "/backups",
  sameDisk: false,
  schedule: "02:00",
  next: null,
  last: archive,
  archives: [archive],
  stale: false,
  failed: null,
  running: false,
  offsite: null,
  disk: { free: 500, total: 1000, low: false },
};

describe("backupHealth", () => {
  it("is ok with a recent backup and room on the disk", () => {
    expect(backupHealth(healthy)).toBe("ok");
  });

  it("warns when the backup disk is low, after everything worse", () => {
    const low = { ...healthy, disk: { free: 10, total: 1000, low: true } };
    expect(backupHealth(low)).toBe("diskLow");
    expect(backupHealth({ ...low, stale: true })).toBe("stale");
    expect(backupHealth({ ...low, failed: { at: archive.at, error: "ENOSPC" } })).toBe("failed");
  });

  it("stays ok when the disk can't be read", () => {
    expect(backupHealth({ ...healthy, disk: null })).toBe("ok");
  });
});
