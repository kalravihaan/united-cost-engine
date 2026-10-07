// Server-side code (route handlers, services) uses Node's Buffer; the single-file build provides the npm "buffer" polyfill.
import { Buffer } from "buffer";
export { Buffer };
