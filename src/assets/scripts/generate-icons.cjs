// Generates PNG icons at all required sizes from SVG source
// Run: node src/assets/scripts/generate-icons.js

const fs = require('fs')
const path = require('path')

const ICON_DIR = path.resolve(__dirname, '..', 'icons')
const OUTPUT_DIR = path.resolve(__dirname, '..', '..', '..', 'icons')

const SIZES = [16, 48, 128]
const VARIANTS = [
  { name: '', svg: 'icon.svg' },
  { name: '_light', svg: 'icon_light.svg' }
]

async function main() {
  // Try sharp
  let sharp
  try {
    sharp = require('sharp')
  } catch {
    console.error('sharp not found. Installing...')
    const { execSync } = require('child_process')
    execSync('npm install sharp --no-save', { cwd: path.resolve(__dirname, '..', '..', '..'), stdio: 'inherit' })
    sharp = require('sharp')
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  for (const variant of VARIANTS) {
    const svgPath = path.join(ICON_DIR, variant.svg)
    if (!fs.existsSync(svgPath)) {
      console.warn(`Skipping ${variant.svg}: not found`)
      continue
    }

    const svgContent = fs.readFileSync(svgPath, 'utf-8')

    for (const size of SIZES) {
      const outputName = `icon${size}${variant.name}.png`
      const outputPath = path.join(OUTPUT_DIR, outputName)

      try {
        await sharp(Buffer.from(svgContent))
          .resize(size, size)
          .png()
          .toFile(outputPath)
        console.log(`✓ Generated ${outputName} (${size}x${size})`)
      } catch (err) {
        console.error(`✗ Failed to generate ${outputName}:`, err.message)
      }
    }
  }

  console.log('\nDone! All icons generated in:', OUTPUT_DIR)
}

main().catch(console.error)
