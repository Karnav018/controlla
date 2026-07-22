import { z } from 'zod';

/**
 * The Dynamic Controller contract: game plugins emit these layouts, the
 * platform renders them on phones. Versioned — renderers must degrade
 * gracefully on unknown component kinds rather than crash.
 */

const ButtonSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1)
});

export const LayoutComponentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('buttons'), id: z.string().min(1), buttons: z.array(ButtonSchema).min(1) }),
  z.object({ kind: z.literal('dpad'), id: z.string().min(1) }),
  z.object({
    kind: z.literal('text-input'),
    id: z.string().min(1),
    placeholder: z.string().optional(),
    maxLength: z.number().int().positive().max(500).optional()
  }),
  z.object({
    kind: z.literal('choice-list'),
    id: z.string().min(1),
    choices: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(1)
  }),
  z.object({ kind: z.literal('label'), id: z.string().min(1), text: z.string() }),
  z.object({
    kind: z.literal('slider'),
    id: z.string().min(1),
    min: z.number(),
    max: z.number(),
    step: z.number().positive().optional()
  })
]);
export type LayoutComponent = z.infer<typeof LayoutComponentSchema>;

export const ControllerLayoutSchema = z.object({
  layoutVersion: z.literal(1),
  components: z.array(LayoutComponentSchema)
});
export type ControllerLayout = z.infer<typeof ControllerLayoutSchema>;
