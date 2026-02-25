import { CEREBRO_BRAIN_METADATA } from '../constants.js';

export function CerebroBrain(): ClassDecorator {
  return (target: object) => {
    Reflect.defineMetadata(CEREBRO_BRAIN_METADATA, true, target);
  };
}
