import { z } from "zod";

export const magicLinkSchema = z.object({
  email: z.email("Enter a valid email address").max(320),
  next: z.string().max(2048).optional(),
});

export type MagicLinkInput = z.infer<typeof magicLinkSchema>;
