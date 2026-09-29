import sys
sys.path.insert(0, '.brand-tools')
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from pathlib import Path
for weight, name in [(400, 'regular'), (700, 'bold')]:
    font = TTFont('public/assets/plus-jakarta-latin.woff2')
    font = instantiateVariableFont(font, {'wght': weight}, inplace=True)
    style = 'Bold' if weight == 700 else 'Regular'
    names = {2: style, 4: f'Plus Jakarta Sans {style}', 6: f'PlusJakartaSans-{style}', 17: style}
    for record in font['name'].names:
        if record.nameID in names:
            record.string = names[record.nameID].encode(record.getEncoding())
    font.flavor = None
    font.save(f'public/assets/plus-jakarta-{name}.ttf')
print('Fontes do manual preparadas para incorporação no PDF.')
