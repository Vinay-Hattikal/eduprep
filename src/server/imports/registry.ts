// Every import type, in the order files should be imported (data-import.md section 3).
// Companies come before questions and coding problems, whose `companies` column links to them.

import type { ImportType } from "@/generated/prisma/enums";
import {
  codingPackageImport,
  codingProblemImport,
  codingSolutionImport,
  codingTestCaseImport,
} from "@/server/imports/definitions/coding";
import { codingBundleImport } from "@/server/imports/definitions/coding-bundle";
import {
  companyQuestionMapImport,
  companyRoundImport,
  companySectionImport,
  companySourceImport,
} from "@/server/imports/definitions/company-details";
import { companyProcessImport } from "@/server/imports/definitions/company-process";
import { companyImport } from "@/server/imports/definitions/companies";
import { mcqImport } from "@/server/imports/definitions/mcq";
import { passageImport } from "@/server/imports/definitions/passages";
import { taxonomyImport } from "@/server/imports/definitions/taxonomy";
import { designQuestionImport, roleTrackImport } from "@/server/imports/definitions/tracks";
import type { ImportDefinition } from "@/server/imports/types";

// Each importer has its own row type; the pipeline only passes rows back to the importer
// that produced them, so the registry can hold them under one type.
type AnyImportDefinition = ImportDefinition<unknown>;

export const IMPORT_DEFINITIONS: readonly AnyImportDefinition[] = [
  taxonomyImport,
  passageImport,
  companyImport,
  companyProcessImport,
  mcqImport,
  codingBundleImport,
  codingPackageImport,
  roleTrackImport,
  designQuestionImport,
  // Older multi-file formats (D-054): still accepted.
  codingProblemImport,
  codingTestCaseImport,
  codingSolutionImport,
  companyRoundImport,
  companySectionImport,
  companySourceImport,
  companyQuestionMapImport,
] as unknown as AnyImportDefinition[];

export function getImportDefinition(type: ImportType): AnyImportDefinition {
  const definition = IMPORT_DEFINITIONS.find((d) => d.type === type);
  if (!definition) throw new Error(`No importer for ${type}`);
  return definition;
}
