const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const buildDir = path.join(__dirname, '..', 'build');
const sourcePng = path.join(buildDir, 'Gemini_Generated_Image_dgvk94dgvk94dgvk.png');
const iconsetDir = path.join(buildDir, 'icon.iconset');

// Sizes needed for macOS icns
const sizes = [16, 32, 64, 128, 256, 512, 1024];

async function generateIcons() {
  // Create iconset directory
  if (!fs.existsSync(iconsetDir)) {
    fs.mkdirSync(iconsetDir, { recursive: true });
  }

  const sourceImage = sharp(sourcePng);

  // Generate PNG files for iconset
  for (const size of sizes) {
    // Regular resolution
    await sharp(sourcePng)
      .resize(size, size)
      .png()
      .toFile(path.join(iconsetDir, `icon_${size}x${size}.png`));

    console.log(`Generated ${size}x${size}`);

    // @2x resolution (for Retina)
    if (size <= 512) {
      await sharp(sourcePng)
        .resize(size * 2, size * 2)
        .png()
        .toFile(path.join(iconsetDir, `icon_${size}x${size}@2x.png`));

      console.log(`Generated ${size}x${size}@2x`);
    }
  }

  // Also generate a single 512x512 PNG for electron-builder
  await sharp(sourcePng)
    .resize(512, 512)
    .png()
    .toFile(path.join(buildDir, 'icon.png'));

  console.log('Generated icon.png');

  // Convert to icns using iconutil (macOS only)
  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(buildDir, 'icon.icns')}"`, {
      stdio: 'inherit'
    });
    console.log('Generated icon.icns');
  } catch (err) {
    console.log('iconutil not available, skipping icns generation');
  }

  console.log('Done!');
}

generateIcons().catch(console.error);
