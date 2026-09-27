import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { File, Files, Folder } from 'fumadocs-ui/components/files';
import type { MDXComponents } from 'mdx/types';
import { ApiAside, ApiExample, ApiMain, ApiPage } from './api/layout';
import { Endpoint } from './api/endpoint';
import { Expandable, Fields, ParamField, ResponseField } from './api/fields';
import { MethodBadge } from './api/method';
import { ArchitectureDiagram, LifecycleDiagram } from './diagrams';
import { StatusBadge } from './status-badge';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Accordion,
    Accordions,
    Step,
    Steps,
    Tab,
    Tabs,
    TypeTable,
    File,
    Files,
    Folder,
    ApiPage,
    ApiMain,
    ApiAside,
    ApiExample,
    Endpoint,
    ParamField,
    ResponseField,
    Expandable,
    Fields,
    MethodBadge,
    StatusBadge,
    ArchitectureDiagram,
    LifecycleDiagram,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
