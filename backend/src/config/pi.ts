import axios from "axios";

import env from "./env";

/**
 * Pi Platform API client.
 *
 * The default header authenticates THIS APP with the server API key, which the payment
 * endpoints use. Verifying a USER is a different credential: `GET /v2/me` must be called
 * with the user's own `Authorization: Bearer <accessToken>`, overriding the default.
 */
const piPlatform = axios.create({
  baseURL: env.platformApiUrl,
  timeout: 20_000,
  headers: { Authorization: `Key ${env.piApiKey}` },
});

export default piPlatform;
