export { param, isTemplateParam } from './param.js';
export { substituteParams } from './substitution.js';
export { validateTemplateParams } from './validation.js';
export { TemplateBuilder, RuleTemplate } from './template-builder.js';
export type { TemplateParamOptions } from './template-builder.js';
export { TemplateValidationError, TemplateInstantiationError } from './errors.js';
export type {
  TemplateParamType,
  TemplateParameterDef,
  TemplateParamMarker,
  TemplateParams,
  TemplateInstantiateOptions,
  TemplateBlueprintData,
  RuleTemplateDefinition,
} from './types.js';
