function isPublished(value) {
  return value === true || String(value).toLowerCase() === "true"
}

function isPublic(value) {
  return String(value ?? "").toLowerCase() === "public"
}

function isProtected(value) {
  return String(value ?? "").toLowerCase() === "protected"
}

function hasPasswordSource(frontmatter) {
  return (
    typeof frontmatter.password === "string" ||
    typeof frontmatter.passwordEnv === "string"
  )
}

function applyListingFlags(file, frontmatter) {
  file.data = file.data ?? {}
  // Quartz emitters read listing flags from file.data rather than directly
  // from frontmatter. Propagate them here so search, RSS, sitemap, explorer,
  // and recent notes consistently respect `unlisted` and `stealth`.
  file.data.unlisted = isPublished(frontmatter.unlisted)
  if (isPublished(frontmatter.stealth)) {
    file.data.stealth = true
    file.data.unlisted = true
  }
}

export default function PrivacyPublishFilter() {
  return {
    name: "PrivacyPublishFilter",
    shouldPublish(_ctx, [_tree, file]) {
      const frontmatter = file.data?.frontmatter ?? {}
      applyListingFlags(file, frontmatter)
      if (!isPublished(frontmatter.publish)) {
        return false
      }

      if (isPublic(frontmatter.privacy)) {
        return true
      }

      return isProtected(frontmatter.privacy) && hasPasswordSource(frontmatter)
    },
  }
}
