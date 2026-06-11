export function healthPayload(startedAt = new Date()) {
  return {
    status: "ok",
    service: "community-mis-backend",
    version: "0.1.0",
    startedAt: startedAt.toISOString(),
    timestamp: new Date().toISOString()
  };
}
