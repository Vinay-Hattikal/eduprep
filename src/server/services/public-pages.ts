import "server-only";

import { updateTag } from "next/cache";
import { PUBLIC_CATALOG_TAG } from "@/server/services/public-catalog";
import { COMPANIES_TAG } from "@/server/services/public-companies";
import { PUBLIC_QUESTIONS_TAG } from "@/server/services/public-questions";

/**
 * Refreshes every cached public page (companies, questions, problems, mock tests) after an admin
 * change. The public pages cross-link each other (company pages list questions, problems and
 * mocks), so a content change can affect any of them; refreshing all three tags is cheap and
 * means no action can forget one. Call from server actions only (updateTag's rule).
 */
export function refreshPublicPages() {
  updateTag(COMPANIES_TAG);
  updateTag(PUBLIC_QUESTIONS_TAG);
  updateTag(PUBLIC_CATALOG_TAG);
}
