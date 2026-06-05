// Minimal stand-in for the Workers `cloudflare:email` module so the worker
// entrypoint can be imported and exercised under plain Node/Vitest.
//
// Fidelity gap (issue #39): the real `EmailMessage` expects `raw` to be a
// complete RFC-822 stream, and the Send binding parses/validates it and
// re-signs DKIM on the way out — none of which happens here. This class just
// holds the constructor args. The structural validation the real binding would
// apply is modelled instead by `assertSendableRaw` in `test/helpers.js`, which
// the `EMAIL_SENDING.send` double calls so a malformed rewrite fails the test.
export class EmailMessage {
  constructor(from, to, raw) {
    this.from = from;
    this.to = to;
    this.raw = raw;
  }
}
