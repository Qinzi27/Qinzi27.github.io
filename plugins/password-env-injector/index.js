const DEFAULT_OPTIONS = {
  envField: "passwordEnv",
  passwordField: "password",
  minLength: 12,
  accessTokenEnvField: "calendarAccessTokenEnv",
  accessTokenMinLength: 32,
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
        () => (tree, file) => {
          const frontmatter = getFrontmatter(file)
          const envName = frontmatter[options.envField]
          const accessTokenEnvName = frontmatter[options.accessTokenEnvField]

          if (typeof envName !== "string" || envName.trim().length === 0) {
            if (typeof accessTokenEnvName === "string" && accessTokenEnvName.trim().length > 0) {
              throw new Error(
                `Encrypted access token on ${getPageLabel(file)} requires ${options.envField}.`,
              )
            }
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

          if (typeof accessTokenEnvName !== "string" || accessTokenEnvName.trim().length === 0) {
            return
          }

          const accessToken = process.env[accessTokenEnvName.trim()]
          if (typeof accessToken !== "string" || accessToken.length === 0) {
            throw new Error(
              `Missing environment variable "${accessTokenEnvName}" for encrypted page ${getPageLabel(file)}.`,
            )
          }

          if (accessToken.length < options.accessTokenMinLength) {
            throw new Error(
              `Environment variable "${accessTokenEnvName}" for ${getPageLabel(file)} must be at least ${options.accessTokenMinLength} characters.`,
            )
          }

          // The following marker is appended before encrypted-pages serializes
          // the HAST tree. It therefore exists only inside the AES-GCM payload,
          // never as plaintext in the generated page.
          tree.children.push({
            type: "element",
            tagName: "span",
            properties: {
              hidden: true,
              ariaHidden: "true",
              className: ["qinzi-calendar-access-marker"],
              dataCalendarAccessToken: accessToken,
            },
            children: [],
          })
        },
      ]
    },
  }
}
