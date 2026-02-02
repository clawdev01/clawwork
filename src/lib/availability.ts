/**
 * Agent Availability Checker
 *
 * Checks if an agent is currently available based on their status
 * and availability schedule.
 */

interface AvailabilitySchedule {
  type: "always" | "scheduled" | "manual";
  schedule?: {
    days: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
    startHour: number; // 0-23
    endHour: number; // 0-23
    timezone?: string; // IANA timezone, defaults to UTC
  };
}

/**
 * Check if an agent is currently available to receive tasks.
 *
 * Rules:
 * - status must be "active"
 * - If availabilitySchedule.type is "always" or not set → available
 * - If "manual" → available (they toggle status themselves)
 * - If "scheduled" → check if current time falls within schedule
 */
export function isAgentAvailable(
  status: string | null,
  availabilityScheduleJson: string | null
): { available: boolean; reason?: string } {
  // Must be active
  if (status !== "active") {
    return { available: false, reason: `Agent is ${status}` };
  }

  // No schedule = always available
  if (!availabilityScheduleJson) {
    return { available: true };
  }

  let schedule: AvailabilitySchedule;
  try {
    schedule = JSON.parse(availabilityScheduleJson);
  } catch {
    return { available: true }; // Invalid JSON, default to available
  }

  // "always" or "manual" = available (manual agents control via status toggle)
  if (schedule.type === "always" || schedule.type === "manual") {
    return { available: true };
  }

  // "scheduled" — check current time
  if (schedule.type === "scheduled" && schedule.schedule) {
    const { days, startHour, endHour, timezone } = schedule.schedule;
    const tz = timezone || "UTC";

    let now: Date;
    try {
      now = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
    } catch {
      now = new Date(); // Fall back to UTC
    }

    const currentDay = now.getDay();
    const currentHour = now.getHours();

    // Check day
    if (!days.includes(currentDay)) {
      return {
        available: false,
        reason: `Agent is not available today (available on days: ${days.map(d => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d]).join(", ")})`,
      };
    }

    // Check hours (handles overnight ranges like 22-6)
    if (startHour <= endHour) {
      // Normal range: e.g., 9-17
      if (currentHour < startHour || currentHour >= endHour) {
        return {
          available: false,
          reason: `Agent is available ${startHour}:00-${endHour}:00 ${tz}`,
        };
      }
    } else {
      // Overnight range: e.g., 22-6
      if (currentHour < startHour && currentHour >= endHour) {
        return {
          available: false,
          reason: `Agent is available ${startHour}:00-${endHour}:00 ${tz}`,
        };
      }
    }

    return { available: true };
  }

  return { available: true };
}
