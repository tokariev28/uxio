export class AgentError extends Error {
  constructor(public readonly agent: string, message: string) {
    super(`[${agent}] ${message}`);
    this.name = "AgentError";
  }
}
