// NEXT_PUBLIC_ values are inlined at build time, so each must be read by its literal name.
export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  piSandbox: process.env.NEXT_PUBLIC_PI_SANDBOX === "true",
  devSignIn: process.env.NEXT_PUBLIC_DEV_SIGNIN === "true",
};
