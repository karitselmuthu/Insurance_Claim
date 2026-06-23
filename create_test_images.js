import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from 'canvas';

const IMAGE_CONFIGS = [
  {
    path: 'dataset/images/sample/car_dent_001/photo_1.jpg',
    label: 'Car Dent',
    description: 'Front bumper damage'
  },
  {
    path: 'dataset/images/sample/laptop_crack_001/screen_1.jpg',
    label: 'Laptop Crack',
    description: 'Screen damage 1'
  },
  {
    path: 'dataset/images/sample/laptop_crack_001/screen_2.jpg',
    label: 'Laptop Crack',
    description: 'Screen damage 2'
  },
  {
    path: 'dataset/images/sample/package_damaged_001/damage_1.jpg',
    label: 'Package Damage',
    description: 'Crushed corner'
  },
  {
    path: 'dataset/images/test/case_001/damage.jpg',
    label: 'Car Dent Test',
    description: 'Front bumper damage'
  },
  {
    path: 'dataset/images/test/case_002/screen.jpg',
    label: 'Laptop Crack Test',
    description: 'Screen crack'
  },
  {
    path: 'dataset/images/test/case_003/box.jpg',
    label: 'Package Damage Test',
    description: 'Box crushed'
  }
];

async function createImage(config) {
  const width = 800;
  const height = 600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  let color = '#808080';
  if (config.label.includes('Dent')) color = '#4f6fa6';
  if (config.label.includes('Crack')) color = '#a64f4f';
  if (config.label.includes('Package')) color = '#4fa66f';

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.strokeRect(80, 120, 640, 360);
  ctx.beginPath();
  ctx.moveTo(160, 160);
  ctx.lineTo(640, 440);
  ctx.moveTo(640, 160);
  ctx.lineTo(160, 440);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px Sans';
  ctx.fillText(config.label, 40, 70);
  ctx.font = '24px Sans';
  ctx.fillText(config.description, 40, 560);

  fs.mkdirSync(path.dirname(config.path), { recursive: true });
  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.85 });
  fs.writeFileSync(config.path, buffer);
  console.log(`✓ Created ${config.path}`);
}

async function main() {
  for (const config of IMAGE_CONFIGS) {
    await createImage(config);
  }
  console.log('✅ Test images created.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});