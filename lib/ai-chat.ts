/** Remove hidden reasoning tags from persisted/previous AI replies before display or reuse. */
export function stripThinkBlocks(content: string) {
  return content
    .replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, '')
    .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
    .replace(/<\/think\s*>/gi, '')
    .trim();
}
