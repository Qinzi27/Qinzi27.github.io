import assert from "node:assert/strict"
import test from "node:test"

import PasswordEnvInjector from "./index.js"

test("injects the calendar token only into the pre-encryption HAST tree", () => {
  const passwordName = "QINZI_TEST_PASSWORD"
  const tokenName = "QINZI_TEST_CALENDAR_TOKEN"
  process.env[passwordName] = "test-password"
  process.env[tokenName] = "calendar-token-that-is-long-enough-123456"

  try {
    const tree = {
      type: "root",
      children: [{ type: "element", tagName: "p", properties: {}, children: [] }],
    }
    const file = {
      data: {
        relativePath: "Our Calendar/index.md",
        frontmatter: {
          passwordEnv: passwordName,
          calendarAccessTokenEnv: tokenName,
        },
      },
    }
    const transformer = PasswordEnvInjector({ minLength: 4 }).htmlPlugins()[0]()
    transformer(tree, file)

    assert.equal(file.data.frontmatter.password, "test-password")
    const marker = tree.children.at(-1)
    assert.equal(marker.tagName, "span")
    assert.equal(marker.properties.dataCalendarAccessToken, "calendar-token-that-is-long-enough-123456")
    assert.equal("calendarAccessToken" in file.data.frontmatter, false)
  } finally {
    delete process.env[passwordName]
    delete process.env[tokenName]
  }
})

test("refuses to inject an access token into a page without password encryption", () => {
  const tokenName = "QINZI_TEST_UNENCRYPTED_TOKEN"
  process.env[tokenName] = "calendar-token-that-is-long-enough-123456"

  try {
    const tree = { type: "root", children: [] }
    const file = {
      data: {
        relativePath: "unsafe.md",
        frontmatter: { calendarAccessTokenEnv: tokenName },
      },
    }
    const transformer = PasswordEnvInjector().htmlPlugins()[0]()
    assert.throws(() => transformer(tree, file), /requires passwordEnv/)
  } finally {
    delete process.env[tokenName]
  }
})
