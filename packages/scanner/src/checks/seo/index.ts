import type { CheerioAPI } from "cheerio"
import type { RawIssue } from "../../index"
import { checkTitle, checkDescription } from "./meta"
import { checkH1, checkHeadingHierarchy } from "./headings"
import { checkHttps, checkCanonical, checkRobotsMeta, checkViewport, checkLang, checkFavicon, checkJsRendering } from "./technical"
import { checkOpenGraph, checkTwitterCard } from "./social"
import { checkJsonLd } from "./structured-data"
import { checkLinks, checkUrlLength } from "./links"
import { checkImages } from "./images"
import { checkRenderBlockingScripts } from "./scripts"
import { checkHreflang, checkLangConsistency } from "./i18n"
import { checkSchemaNoindexConflict, checkLazyLoadingAboveFold, checkLeakedSecrets } from "./modern"

export function checkSeo($: CheerioAPI, url: string): RawIssue[] {
  const issues: RawIssue[] = []

  checkHttps(url, issues)
  checkTitle($, issues)
  checkDescription($, issues)
  checkH1($, issues)
  checkHeadingHierarchy($, issues)
  checkCanonical($, url, issues)
  checkRobotsMeta($, issues)
  checkOpenGraph($, issues)
  checkTwitterCard($, issues)
  checkJsonLd($, issues)
  checkViewport($, issues)
  checkLang($, issues)
  checkHreflang($, url, issues)
  checkLangConsistency($, issues)
  checkFavicon($, issues)
  checkLinks($, url, issues)
  checkUrlLength(url, issues)
  checkJsRendering($, issues)
  checkRenderBlockingScripts($, issues)
  checkImages($, issues)
  checkSchemaNoindexConflict($, issues)
  checkLazyLoadingAboveFold($, issues)
  checkLeakedSecrets($, issues)

  return issues
}
