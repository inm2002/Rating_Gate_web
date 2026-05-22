import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { collectSubjects, mediaDefinitions, mediaKinds, summarizeSubjects } from './bangumi-data.mjs'

const outputPath = resolve('docs/bangumi-data-audit.json')
const report = {
  generatedAt: new Date().toISOString(),
  note: '题库审计基于 Bangumi API 抽样候选池；生成脚本复用同一过滤规则。',
  media: {},
}

for (const kind of mediaKinds) {
  const definition = mediaDefinitions[kind]
  const { subjects, audit } = await collectSubjects(kind, { maxPagesPerQuery: 4 })
  report.media[kind] = {
    label: definition.label,
    minVotes: definition.minVotes,
    filters:
      kind === 'manga'
        ? 'Comic category + series'
        : kind === 'lightNovel'
        ? 'Novel category + series + light novel tag signal'
        : kind === 'galgame'
          ? 'Game type + Galgame meta tag + local adult signal; adult entries use title covers'
          : 'Anime type + nsfw=false',
    ...summarizeSubjects(subjects),
    pages: audit,
  }
  console.log(`${definition.label}: ${subjects.length} candidates, ${report.media[kind].distinctScores} score values`)
  for (const sample of report.media[kind].sample.slice(0, 5)) {
    console.log(`  - ${sample.title} | ${sample.score.toFixed(1)} | ${sample.votes} votes`)
  }
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`Wrote audit report to ${outputPath}`)
