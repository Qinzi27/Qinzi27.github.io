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

export default function PrivacyPublishFilter() {
  return {
    name: "PrivacyPublishFilter",
    shouldPublish(_ctx, [_tree, file]) {
      const frontmatter = file.data?.frontmatter ?? {}
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
