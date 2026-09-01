/** datetime-local inputs arrive as local wall-clock strings without timezone. */
const dateTimeLocalRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export class InvalidDateTimeError extends Error {
  constructor() {
    super("Invalid datetime");
    this.name = "InvalidDateTimeError";
  }
}

export function parseDateTimeLocal(value: string): Date {
  if (!dateTimeLocalRe.test(value)) throw new InvalidDateTimeError();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new InvalidDateTimeError();
  return parsed;
}
