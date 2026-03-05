type LogLevel = "info" | "warn" | "error";

type LogPayload = Record<string, unknown>;

const write = (level: LogLevel, event: string, payload: LogPayload = {}) => {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...payload,
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
};

export const logInfo = (event: string, payload?: LogPayload) => write("info", event, payload);

export const logWarn = (event: string, payload?: LogPayload) => write("warn", event, payload);

export const logError = (event: string, payload?: LogPayload) =>
  write("error", event, payload);
