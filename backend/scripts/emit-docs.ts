import "dotenv/config";

import { writeFileSync } from "fs";
import { resolve } from "path";

import swaggerSpec from "../src/docs/swagger";

/**
 * Writes the OpenAPI document to backend/openapi.json, for generating a typed client
 * without the server running, or diffing the contract in a pull request.
 *
 *   yarn docs:emit
 */
const target = resolve(__dirname, "..", "openapi.json");

writeFileSync(target, JSON.stringify(swaggerSpec, null, 2) + "\n", "utf8");

console.log(
  `Wrote ${target}: ${Object.keys(swaggerSpec.paths).length} paths, ` +
    `${Object.keys(swaggerSpec.components.schemas).length} schemas`,
);
