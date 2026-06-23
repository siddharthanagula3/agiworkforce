import os
import math
from PIL import Image, ImageDraw

def generate_agi_logo(width, height, is_opaque, output_path):
    # We use 4x supersampling for high-quality antialiasing
    super_w = width * 4
    super_h = height * 4
    
    if is_opaque:
        # Solid dark background (#0f0f0f)
        img = Image.new('RGBA', (super_w, super_h), (15, 15, 15, 255))
    else:
        # Transparent background
        img = Image.new('RGBA', (super_w, super_h), (0, 0, 0, 0))
        
    draw = ImageDraw.Draw(img)
    
    # SVG base viewbox is 24x24, center is (12, 12)
    cx = super_w / 2.0
    cy = super_h / 2.0
    
    # Scale factor mapping SVG coordinates [0, 24] to super resolution
    scale = super_w / 24.0
    
    inner_r = 4.6 * scale
    outer_r = 9.0 * scale
    stroke_w = 1.5 * scale
    
    spoke_count = 12
    # Spokes colors
    # Accent spoke (12 o'clock - index 0): amber (#fbbf24)
    # Other 11 spokes: white/off-white (#f4f4f4)
    accent_color = (251, 191, 36, 255)
    base_color = (244, 244, 244, 255)
    
    for idx in range(spoke_count):
        angle = idx * (360.0 / spoke_count)
        rad = math.radians(angle)
        
        x1 = cx + inner_r * math.sin(rad)
        y1 = cy - inner_r * math.cos(rad)
        x2 = cx + outer_r * math.sin(rad)
        y2 = cy - outer_r * math.cos(rad)
        
        color = accent_color if idx == 0 else base_color
        
        # Draw line with rounded linecaps. Since ImageDraw.line in PIL doesn't
        # support linecap style natively, we draw circles at the endpoints of the line
        # with the same diameter as the stroke width to simulate 'round' linecaps.
        draw.line([x1, y1, x2, y2], fill=color, width=int(round(stroke_w)))
        draw.ellipse([x1 - stroke_w/2, y1 - stroke_w/2, x1 + stroke_w/2, y1 + stroke_w/2], fill=color)
        draw.ellipse([x2 - stroke_w/2, y2 - stroke_w/2, x2 + stroke_w/2, y2 + stroke_w/2], fill=color)
        
    # Resize back down to target resolution with Lanczos interpolation
    final_img = img.resize((width, height), Image.Resampling.LANCZOS)
    
    # If opaque, save as RGB (no alpha channel)
    if is_opaque:
        final_img = final_img.convert('RGB')
        
    # Ensure directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    final_img.save(output_path, 'PNG')
    print(f"Generated logo asset: {output_path} ({width}x{height})")

if __name__ == '__main__':
    # 1. iOS App Icon (opaque background)
    generate_agi_logo(1024, 1024, is_opaque=True, output_path='apps/mobile/assets/icon.png')
    
    # 2. Android Adaptive Icon Foreground (transparent background)
    generate_agi_logo(1024, 1024, is_opaque=False, output_path='apps/mobile/assets/adaptive-icon.png')
    
    # 3. Splash Screen Icon (transparent background)
    generate_agi_logo(200, 200, is_opaque=False, output_path='apps/mobile/assets/splash-icon.png')
