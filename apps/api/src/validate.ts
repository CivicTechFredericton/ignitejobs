import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";

/** zValidator that answers with an error code (translated by the web app) plus the bad fields. */
export const validate = <T extends ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
      return c.json({ error: "invalid_input", fields }, 400);
    }
  });
