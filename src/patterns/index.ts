/**
 * CEP (Complex Event Processing) pattern moduly.
 *
 * Tyto moduly poskytují samostatně použitelné implementace
 * temporálních vzorů. Lze je použít přímo nebo skrz TemporalProcessor.
 *
 * @module patterns
 */

export * from './sequence.js';
export * from './absence.js';
export * from './count.js';

// TODO: Implementovat zbývající vzory
// export * from './aggregate.js';   // Agregace hodnot
