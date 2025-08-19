"use strict";

/** @type {import('@typescript-eslint/utils').TSESLint.Linter.ConfigType} */
module.exports = {
  extends: `@ryb73`,

  overrides: [
    {
      files: [`./vite.config.ts`],
      rules: {
        "import/no-unused-modules": `off`,
      },
    },
  ],

  rules: {
    "@stylistic/lines-between-class-members": `off`,
    "func-style": `off`,
    "import/no-anonymous-default-export": `off`,
    "import/no-extraneous-dependencies": [
      `warn`,
      {
        devDependencies: [
          `.eslintrc.{js,ts,tsx}`,
          `.graphqlrc.ts`,
          `.storybook/**.*`,
          `**/*.spec.{js,ts,tsx}`,
          `**/*.test.{js,ts,tsx}`,
          `config/**/*.{js,ts,tsx}`,
          `cypress.config.ts`,
          `cypress/support/e2e.ts`,
          `jest.config.{js,ts,tsx}`,
          `jest.globalSetup.{js,ts,tsx}`,
          `jest.globalTeardown.{js,ts,tsx}`,
          `jest.setup.{js,ts,tsx}`,
          `next.config.{js,ts,tsx}`,
          `rollup.config.{js,ts,tsx}`,
          `test/**/*`,
          `vite.config.*`,
        ],
      },
    ],
    "jest/padding-around-all": `off`,
    "jest/padding-around-expect-groups": `off`,
    "no-await-in-loop": `off`,
    "no-console": `off`,
    "no-void": `off`,
    "react/jsx-key": `off`,
    "react/jsx-no-bind": `off`,
    "react/no-unknown-property": `off`,
    "react-form-fields/no-only-value-prop": `off`,
    "sonar/function-return-type": `off`,
    "sonarjs/no-nested-switch": `off`,
    "ssr-friendly/no-dom-globals-in-module-scope": `off`,
    "unicorn/catch-error-name": `off`,
  },
};
