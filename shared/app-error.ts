// Erasable TypeScript is also consumed by the Node 24 canvas service.
export class AppError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
