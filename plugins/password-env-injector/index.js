const DEFAULT_OPTIONS = {
  envField: "passwordEnv",
  passwordField: "password",
  minLength: 12,
}

function getFrontmatter(file) {
  file.data = file.data ?? {}
  file.data.frontmatter = file.data.frontmatter ?? {}
  return file.data.frontmatter
}

function getPageLabel(file) {
  return file.data?.relativePath ?? file.path ?? "unknown page"
}

export default function PasswordEnvInjector(userOptions = {}) {
  const options = { ...DEFAULT_OPTIONS, ...userOptions }

  return {
    name: "PasswordEnvInjector",
    htmlPlugins() {
      return [
        () => (_tree, file) => {
          const frontmatter = getFrontmatter(file)
          const envName = frontmatter[options.envField]

          if (typeof envName !== "string" || envName.trim().length === 0) {
            return
          }

          const password = process.env[envName.trim()]
          if (typeof password !== "string" || password.length === 0) {
            throw new Error(
              `Missing environment variable "${envName}" for encrypted page ${getPageLabel(file)}.`,
            )
          }

          if (password.length < options.minLength) {
            throw new Error(
              `Environment variable "${envName}" for ${getPageLabel(file)} must be at least ${options.minLength} characters.`,
            )
          }

          frontmatter[options.passwordField] = password
        },
      ]
    },
  }
}
