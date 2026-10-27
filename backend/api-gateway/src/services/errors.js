// An error with an HTTP status and a message that is safe to send to the browser.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
