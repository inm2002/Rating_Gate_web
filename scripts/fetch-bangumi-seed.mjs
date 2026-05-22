import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { collectSubjects, mediaDefinitions, mediaKinds } from './bangumi-data.mjs'

const requestedKind = process.argv[2]
if (requestedKind && !mediaKinds.includes(requestedKind)) {
  throw new Error(`Unknown media kind "${requestedKind}". Use one of: ${mediaKinds.join(', ')}`)
}

for (const kind of requestedKind ? [requestedKind] : mediaKinds) {
  const definition = mediaDefinitions[kind]
  const outputPath = resolve(`public/${definition.outputBase}-seed.json`)
  const metaOutputPath = resolve(`public/${definition.outputBase}-seed-meta.json`)
  const { subjects } = await collectSubjects(kind)

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(subjects, null, 2)}\n`, 'utf8')
  await writeFile(
    metaOutputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: 'Bangumi API',
        mediaKind: kind,
        count: subjects.length,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  console.log(`Wrote ${subjects.length} ${definition.label} subjects to ${outputPath}`)
}
