// Minimal stand-in for the Workers `cloudflare:email` module so the worker
// entrypoint can be imported and exercised under plain Node/Vitest.
export class EmailMessage {
  constructor(from, to, raw) {
    this.from = from;
    this.to = to;
    this.raw = raw;
  }
}
