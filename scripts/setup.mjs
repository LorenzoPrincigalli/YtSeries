import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise((r) => rl.question(q, r))

const EXAMPLE_FILES = [
  {
    src: join(root, 'src/shared/config.example.js'),
    dest: join(root, 'src/shared/config.js'),
    name: 'YouTube Data API v3 key',
  },
  {
    src: join(root, 'src/shared/firebase.config.example.js'),
    dest: join(root, 'src/shared/firebase.config.js'),
    name: 'Firebase project config',
  },
]

async function main() {
  console.log('\n--- YT Series Setup ---\n')

  for (const file of EXAMPLE_FILES) {
    if (existsSync(file.dest)) {
      console.log(`[✓] ${file.name} — ${file.dest} already exists, skipped`)
      continue
    }

    const answer = await ask(`Do you want to configure ${file.name}? (y/N) `)
    if (answer.toLowerCase() !== 'y') {
      console.log(`  Skipped. Copy example manually later with:\n    cp ${file.src} ${file.dest}\n`)
      continue
    }

    let content = readFileSync(file.src, 'utf-8')

    if (file.name === 'YouTube Data API v3 key') {
      const key = await ask('  Enter your YouTube API key: ')
      if (key.trim()) {
        content = content.replace(/AIzaSy\.\.\./, key.trim())
      }
    }

    if (file.name === 'Firebase project config') {
      const apiKey = await ask('  Enter Firebase apiKey: ')
      const projectId = await ask('  Enter Firebase projectId: ')
      const authDomain = await ask(`  Enter Firebase authDomain (default: ${projectId || 'YOUR_PROJECT_ID'}.firebaseapp.com): `)

      if (apiKey.trim()) content = content.replace(/YOUR_FIREBASE_API_KEY/, apiKey.trim())
      if (projectId.trim()) content = content.replace(/YOUR_PROJECT_ID/g, projectId.trim())
      if (authDomain.trim()) content = content.replace(/YOUR_PROJECT_ID\.firebaseapp\.com/, authDomain.trim())
    }

    writeFileSync(file.dest, content)
    console.log(`[✓] ${file.dest} created\n`)
  }

  rl.close()
  console.log('Setup complete! Run `npm run icons` to generate icons.\n')
}

main()
