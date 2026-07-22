import base64
import os

webp_path = r'd:\Scribble-Cantrolla-Game\client\public\bg-doodle.webp'
out_path = r'd:\Scribble-Cantrolla-Game\client\src\assets\bgData.ts'

with open(webp_path, 'rb') as f:
    data = f.read()

b64 = base64.b64encode(data).decode('utf-8')

content = f'export const BG_DOODLE_BASE64 = "data:image/webp;base64,{b64}";\n'

with open(out_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("bgData.ts written successfully! File size:", os.path.getsize(out_path))
