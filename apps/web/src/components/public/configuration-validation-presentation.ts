import type { ConfigurationGroupV2 } from "@menu/shared";
type Issue = { code: string; path: string; message: string };
// Presentation only. The Shared validator remains the sole source of validity.
export const isMissingChoice = (issue: Issue) => ["SIZE_REQUIRED", "GROUP_MIN_NOT_MET", "OPTION_MIN_NOT_MET"].includes(issue.code);
export function groupNeedsChoice(group: ConfigurationGroupV2, path: string, issues: readonly Issue[]) {
  return issues.some(issue => isMissingChoice(issue) && (issue.path === path ||
    (issue.code === "OPTION_MIN_NOT_MET" && group.type === "OPTIONS" && group.options.some(option => issue.path === `${path}.${option.id}`))));
}
export function validationPresentation(issues: readonly Issue[]) {
  return { missing: issues.filter(isMissingChoice), other: [...new Map(issues.filter(issue => !isMissingChoice(issue)).map(issue => [issue.code + ":" + issue.message, issue])).values()] };
}
