export const env = {
  port: Number(process.env.PORT ?? 4000),
  production: process.env.NODE_ENV === "production",
  clerkConfigured: Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY),
  // Local development without Clerk keys: treat every request as a moderator.
  devModerator: process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_MODERATOR === "1",
};
