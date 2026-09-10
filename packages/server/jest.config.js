/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@trao/shared$': '<rootDir>/../shared/src/index.ts',
    '^@trao/shared/(.*)$': '<rootDir>/../shared/src/$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        strict: false,
        noImplicitAny: false,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        module: 'commonjs',
        target: 'ES2022',
        moduleResolution: 'node',
        resolveJsonModule: true,
        baseUrl: '.',
        paths: {
          '@trao/shared': ['../shared/src/index.ts'],
          '@trao/shared/*': ['../shared/src/*'],
        },
      },
    }],
  },
};
