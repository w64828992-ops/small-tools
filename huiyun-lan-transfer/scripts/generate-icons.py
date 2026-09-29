from PIL import Image, ImageDraw
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "build"
OUT.mkdir(parents=True, exist_ok=True)
S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Rounded blue background.
d.rounded_rectangle((0, 0, S-1, S-1), radius=220, fill=(25, 103, 224, 255))

# Two computers.
for x, y in [(145, 250), (549, 529)]:
    d.rounded_rectangle((x, y, x+330, y+245), radius=34, fill=(255, 255, 255, 250))
    d.rounded_rectangle((x+40, y+42, x+290, y+197), radius=18, fill=(221, 235, 255, 255))
    d.rounded_rectangle((x+133, y+245, x+197, y+307), radius=12, fill=(255, 255, 255, 255))
    d.rounded_rectangle((x+73, y+294, x+258, y+332), radius=19, fill=(255, 255, 255, 255))

# Bidirectional arrows.
d.polygon([(445,407),(700,407),(646,353),(684,315),(803,434),(684,553),(646,515),(700,461),(445,461)], fill=(255,255,255,255))
d.polygon([(579,617),(324,617),(378,671),(340,709),(221,590),(340,471),(378,509),(324,563),(579,563)], fill=(155,193,255,255))

png = OUT / "icon.png"
img.save(png)
img.save(OUT / "icon.ico", format="ICO", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
img.save(OUT / "icon.icns", format="ICNS")
print(png)
