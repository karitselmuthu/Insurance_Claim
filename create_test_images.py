#!/usr/bin/env python3
"""Generate minimal test JPEG images for insurance claim testing."""

from PIL import Image, ImageDraw, ImageFont
import os

# Image configurations
IMAGE_CONFIGS = {
    "sample": [
        {
            "path": "dataset/images/sample/car_dent_001/photo_1.jpg",
            "label": "Car Dent",
            "description": "Front bumper damage"
        },
        {
            "path": "dataset/images/sample/laptop_crack_001/screen_1.jpg",
            "label": "Laptop Crack",
            "description": "Screen damage 1"
        },
        {
            "path": "dataset/images/sample/laptop_crack_001/screen_2.jpg",
            "label": "Laptop Crack",
            "description": "Screen damage 2"
        },
        {
            "path": "dataset/images/sample/package_damaged_001/damage_1.jpg",
            "label": "Package Damage",
            "description": "Crushed corner"
        }
    ],
    "test": [
        {
            "path": "dataset/images/test/case_001/damage.jpg",
            "label": "Car Dent Test",
            "description": "Front bumper damage"
        },
        {
            "path": "dataset/images/test/case_002/screen.jpg",
            "label": "Laptop Crack Test",
            "description": "Screen crack"
        },
        {
            "path": "dataset/images/test/case_003/box.jpg",
            "label": "Package Damage Test",
            "description": "Box crushed"
        }
    ]
}

def create_test_image(path, label, description):
    """Create a minimal JPEG test image."""
    # Create image with solid color background
    width, height = 400, 300
    
    # Use different colors for different types
    if "Dent" in label:
        color = (100, 100, 150)  # Blue-ish
    elif "Crack" in label:
        color = (150, 100, 100)  # Red-ish
    elif "Package" in label:
        color = (100, 150, 100)  # Green-ish
    else:
        color = (128, 128, 128)  # Gray
    
    # Create image
    img = Image.new('RGB', (width, height), color)
    draw = ImageDraw.Draw(img)
    
    # Add text
    text_y = 50
    try:
        font = ImageFont.load_default()
    except:
        font = None
    
    # Draw damage indicator (diagonal line or pattern)
    draw.rectangle([(50, 100), (350, 250)], outline=(255, 0, 0), width=3)
    draw.line([(100, 100), (300, 250)], fill=(255, 0, 0), width=2)
    draw.line([(300, 100), (100, 250)], fill=(255, 0, 0), width=2)
    
    # Add text labels
    draw.text((20, 10), label, fill=(255, 255, 255), font=font)
    draw.text((20, height - 30), description, fill=(255, 255, 255), font=font)
    
    # Save image
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'JPEG', quality=85)
    print(f"✓ Created {path}")

def main():
    """Generate all test images."""
    print("Generating test JPEG images...\n")
    
    for dataset_type, configs in IMAGE_CONFIGS.items():
        print(f"Creating {dataset_type} images:")
        for config in configs:
            create_test_image(
                config["path"],
                config["label"],
                config["description"]
            )
        print()
    
    print("✅ All test images created successfully!")

if __name__ == "__main__":
    main()
