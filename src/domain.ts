import { z } from "zod";

export const TicketIdSchema = z.string().regex(/^TKT-\d{4}$/);
export type TicketId = z.infer<typeof TicketIdSchema>;
