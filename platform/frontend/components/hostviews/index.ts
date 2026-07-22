import type { ComponentType } from 'react';
import { ScribbleHostView } from './ScribbleHostView';

/**
 * First-party host views, keyed by gameId (docs/IMPLEMENTATION_PLAN.md D3):
 * when a game is running and its id is here, the running screen hands the
 * whole surface to this component instead of the raw-state panel. Provider
 * bundles loaded at runtime arrive with the marketplace phase.
 */
export const HOST_VIEWS: Record<string, ComponentType<{ state: any }>> = {
  scribble: ScribbleHostView as ComponentType<{ state: any }>
};
