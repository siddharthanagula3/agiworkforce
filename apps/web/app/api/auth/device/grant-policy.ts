/**
 * The two numbers the device grant puts on the wire. The client is told both
 * when it starts, and told the interval again when it polls too fast, so they
 * cannot be allowed to disagree.
 */
export const DEVICE_CODE_EXPIRES_SECONDS = 900;
export const DEVICE_POLL_INTERVAL_SECONDS = 5;
