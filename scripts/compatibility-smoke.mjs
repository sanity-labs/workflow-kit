import {execFileSync} from 'node:child_process'
import {mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const sanityVersion = process.env.SANITY_VERSION || '^6.0.0'
const sanityUiVersion = process.env.SANITY_UI_VERSION || '^4.0.0'
const smokeRoot = mkdtempSync(join(tmpdir(), 'workflow-kit-smoke-'))

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    env: {...process.env, CI: '1'},
    stdio: 'inherit',
  })
}

try {
  run('pnpm', ['build'], packageRoot)
  run('pnpm', ['pack', '--pack-destination', smokeRoot], packageRoot)

  const tarballName = readdirSync(smokeRoot).find((name) => name.endsWith('.tgz'))
  if (!tarballName) throw new Error('workflow-kit pack did not create a tarball')

  const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  writeFileSync(
    join(smokeRoot, 'package.json'),
    JSON.stringify(
      {
        name: 'workflow-kit-compatibility-smoke',
        private: true,
        type: 'module',
        scripts: {
          build: 'sanity build',
        },
        dependencies: {
          [packageJson.name]: `file:./${tarballName}`,
          '@sanity/ui': sanityUiVersion,
          react: '19.2.8',
          'react-dom': '19.2.8',
          sanity: sanityVersion,
          'styled-components': '^6.4.0',
        },
      },
      null,
      2,
    ),
  )

  writeFileSync(
    join(smokeRoot, 'sanity.config.ts'),
    `import {StatusPathInput} from '@sanity-labs/workflow-kit/studio'
import {defineConfig, defineField, defineType} from 'sanity'

export default defineConfig({
  projectId: 'ppsg7ml5',
  dataset: 'production',
  schema: {
    types: [
      defineType({
        name: 'article',
        title: 'Article',
        type: 'document',
        fields: [
          defineField({name: 'title', type: 'string'}),
          defineField({
            name: 'status',
            type: 'string',
            components: {input: StatusPathInput},
            options: {list: ['draft', 'published'], pathStages: ['draft', 'published']},
          }),
        ],
      }),
    ],
  },
})
`,
  )
  writeFileSync(
    join(smokeRoot, 'sanity.cli.ts'),
    `import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {projectId: 'ppsg7ml5', dataset: 'production'},
})
`,
  )

  run('npm', ['install', '--loglevel=error'], smokeRoot)
  run('npm', ['run', 'build'], smokeRoot)
} finally {
  rmSync(smokeRoot, {force: true, recursive: true})
}
