import sys, re
sys.path.insert(0, '.tools')
import pymupdf as fitz

names=['proposta-200','proposta-dois-itens','proposta-ecoclean','proposta-ecoclean-extensa']
pattern=r'ECO-\d{8}-[A-F0-9]{4}'
for name in names:
    before=fitz.open(f'validacao/antes-modulo/{name}.pdf')
    after=fitz.open(f'validacao/{name}.pdf')
    assert len(before)==len(after),(name,'page count')
    for previous,current in zip(before,after):
        assert re.sub(pattern,'PROPOSTA',previous.get_text())==re.sub(pattern,'PROPOSTA',current.get_text()),(name,'content')
        assert sorted(f[3] for f in previous.get_fonts())==sorted(f[3] for f in current.get_fonts()),(name,'fonts')
        # Os testes criam número aleatório de proposta. Mascarar só esse campo.
        masks=[]
        for page in [previous,current]:
            for number in re.findall(pattern,page.get_text()):
                masks.extend(page.search_for(number))
        for page in [previous,current]:
            for rect in masks:
                page.draw_rect(rect+(-2,-2,2,2),fill=(1,1,1),color=(1,1,1),overlay=True)
        assert previous.get_pixmap().samples==current.get_pixmap().samples,(name,'visual regression')
    print(f'OK: {name}: {len(after)} página(s), textos, fontes e imagem preservados.')

for name in ['workspace-http','workspace-offline']:
    doc=fitz.open(f'validacao/{name}.pdf')
    assert len(doc)==1,(name,'short quote')
    text=''.join(p.get_text() for p in doc)
    assert 'Investimento total' in text and 'VALOR NO PIX' in text
    assert 'file:///' not in text and 'index.html' not in text
    doc[0].get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save(f'validacao/{name}-pdf.png')
    print(f'OK: {name}: PDF de uma página, sem caminho local, gerado e armazenado pela interface.')
