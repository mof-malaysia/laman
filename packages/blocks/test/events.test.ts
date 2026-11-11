import { describe, expect, it } from "@rstest/core";
import {
  EntryEvent,
  addMonths,
  calendarPath,
  dayOf,
  daysBetween,
  eventDays,
  isUpcoming,
  kindIssues,
} from "../src/index.js";

describe("event dates", () => {
  it("reads days in Malaysia's time", () => {
    // 11.30 pm in UTC is the next morning in Malaysia.
    expect(dayOf("2026-11-11T23:30:00Z")).toBe("2026-11-12");
    expect(dayOf("2026-11-12T07:59:00+08:00")).toBe("2026-11-12");
  });

  it("counts days and months across year ends", () => {
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("puts an event on every day it runs", () => {
    expect(
      eventDays({ start: "2026-11-30T09:00:00+08:00", end: "2026-12-02T17:00:00+08:00" }),
    ).toEqual(["2026-11-30", "2026-12-01", "2026-12-02"]);
    expect(eventDays({ start: "2026-11-30T09:00:00+08:00" })).toEqual(["2026-11-30"]);
  });

  it("keeps an all-day event coming until its last day is over", () => {
    const event = { start: "2026-11-12T00:00:00+08:00", allDay: true };
    expect(isUpcoming(event, Date.parse("2026-11-12T22:00:00+08:00"))).toBe(true);
    expect(isUpcoming(event, Date.parse("2026-11-13T00:00:01+08:00"))).toBe(false);
    expect(
      isUpcoming({ start: "2026-11-12T09:00:00+08:00" }, Date.parse("2026-11-12T10:00:00+08:00")),
    ).toBe(false);
  });

  it("refuses an event that ends before it starts", () => {
    expect(
      EntryEvent.safeParse({ start: "2026-11-12T10:00:00+08:00", end: "2026-11-12T09:00:00+08:00" })
        .success,
    ).toBe(false);
  });

  it("writes a calendar's addresses", () => {
    expect(calendarPath("/takwim")).toBe("/takwim");
    expect(calendarPath("/takwim", { month: "2026-11" })).toBe("/takwim/2026-11");
    expect(calendarPath("/takwim", { filter: { kind: "location", slug: "sabah" } })).toBe(
      "/takwim/lokasi/sabah",
    );
    expect(
      calendarPath("/takwim", { month: "2026-11", filter: { kind: "category", slug: "a" } }),
    ).toBe("/takwim/kategori/a/2026-11");
  });

  it("lets a listing show its entries with an entry list or an event calendar, not both", () => {
    expect(kindIssues("listing", [{ type: "eventCalendar" }])).toEqual([]);
    expect(kindIssues("listing", [{ type: "entryList" }, { type: "eventCalendar" }])).toEqual([
      "A listing page has one Entry list or Event calendar block",
    ]);
    expect(kindIssues("page", [{ type: "upcomingEvents" }])).toEqual([]);
  });
});
